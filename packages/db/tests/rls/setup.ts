import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * RLS test harness. Runs against the live dev Supabase project using the
 * seeded test users. Tests only ever perform reads and EXPECTED-TO-FAIL
 * writes, so the dev dataset is not mutated.
 */

const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

export const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const hasEnv = !!(
  URL_ && ANON &&
  process.env.TEST_RA_EMAIL && process.env.TEST_SA_EMAIL && process.env.TEST_ADMIN_EMAIL
);

export function anonClient(): SupabaseClient {
  return createClient(URL_, ANON, { auth: { persistSession: false } });
}

async function signedIn(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`test sign-in failed for ${email}: ${error.message}`);
  return c;
}

const cache: { ra?: SupabaseClient; sa?: SupabaseClient; admin?: SupabaseClient } = {};

export async function raClient(): Promise<SupabaseClient> {
  cache.ra ??= await signedIn(process.env.TEST_RA_EMAIL!, process.env.TEST_RA_PASSWORD!);
  return cache.ra;
}
export async function saClient(): Promise<SupabaseClient> {
  cache.sa ??= await signedIn(process.env.TEST_SA_EMAIL!, process.env.TEST_SA_PASSWORD!);
  return cache.sa;
}
export async function adminClient(): Promise<SupabaseClient> {
  cache.admin ??= await signedIn(process.env.TEST_ADMIN_EMAIL!, process.env.TEST_ADMIN_PASSWORD!);
  return cache.admin;
}

export async function uid(c: SupabaseClient): Promise<string> {
  const { data } = await c.auth.getUser();
  return data.user!.id;
}
