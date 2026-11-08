import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadTestEnv } from "../env";

/**
 * RLS test harness. Signs in as the seeded test users and checks that the
 * policies hold.
 *
 * TARGET
 *   Whatever `scripts/test.mjs --env=<target>` named — staging by default
 *   (`npm test`) since 7 Nov 2026, when `propertiguru-staging`
 *   (aylzekkeurjsudazzxjv) was created and all 77 migrations replayed onto it.
 *   Production is reachable only through `npm run test:production`, which
 *   demands an explicit extra flag. The fixture discipline below predates
 *   staging and stays: it is what made running on production survivable, and
 *   it costs nothing on staging.
 *
 *   Some tests genuinely create a user and publish a listing to prove that an
 *   entitlement or a reward fires. One of them once left seven orphan agencies
 *   in the live database because it deleted in the wrong FK order and never
 *   read the error. So fixtures are not left to each test's good intentions:
 *
 *     · every fixture carries a marker — `FIXTURE_DOMAIN` for accounts,
 *       `FIXTURE_PREFIX` for anything with a name;
 *     · `tests/teardown.ts` sweeps the marker after the whole run and FAILS
 *       the run if it found anything, so a test that forgets its own cleanup
 *       is reported rather than discovered months later.
 *
 *   The marker is what makes the sweep safe: it can only ever match rows this
 *   suite created, so it can never touch a real agent.
 */

loadTestEnv();

export const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const hasEnv = !!(
  URL_ && ANON &&
  process.env.TEST_RA_EMAIL && process.env.TEST_SA_EMAIL && process.env.TEST_ADMIN_EMAIL
);

/* --------------------------------------------------------------------------
 * Fixture markers
 *
 * `.invalid` is reserved by RFC 2606 and can never receive mail, so a fixture
 * account cannot accidentally be emailed. The prefix is deliberately ugly: if
 * one ever shows up on a screen, it should be obvious what it is.
 * ----------------------------------------------------------------------- */
export const FIXTURE_DOMAIN = "@fixture.propertiguru.invalid";
export const FIXTURE_PREFIX = "[fixture]";

let seq = 0;

/** A unique fixture email. Unique per call, not per run — tests retry. */
export function fixtureEmail(tag: string): string {
  return `${tag}.${Date.now()}.${seq++}${FIXTURE_DOMAIN}`;
}

/** A fixture name the sweep can find. */
export function fixtureName(label: string): string {
  return `${FIXTURE_PREFIX} ${label}`;
}

/**
 * Create a verified agent for a test to act on.
 *
 * Centralised so the marker cannot be forgotten, and so the shape of a test
 * agent is defined once. Returns the id; the sweep removes it afterwards
 * whether or not the test remembers to.
 */
export async function makeFixtureAgent(
  service: SupabaseClient,
  tag: string,
  fields: Record<string, unknown> = {}
): Promise<string> {
  const email = fixtureEmail(tag);
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: `Fx!${Date.now()}${seq}`,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create fixture agent ${tag}: ${error.message}`);

  const { error: pErr } = await service.from("profiles").upsert({
    id: data.user.id,
    display_name: fixtureName(tag),
    agent_status: "verified",
    ...fields,
  });
  if (pErr) throw new Error(`could not upsert fixture profile ${tag}: ${pErr.message}`);

  return data.user.id;
}

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

/* The co-marketing pair, also used by the Secretary tests: LA owns the
 * published listing the seeded lead points at. Optional in the env — tests
 * that need them skip when they are absent, like the pool tests. */
const pair: { la?: SupabaseClient; ma?: SupabaseClient } = {};
export const hasPairEnv = !!(process.env.TEST_LA_EMAIL && process.env.TEST_LA_PASSWORD && process.env.TEST_MA_EMAIL && process.env.TEST_MA_PASSWORD);
export async function laClient(): Promise<SupabaseClient> {
  pair.la ??= await signedIn(process.env.TEST_LA_EMAIL!, process.env.TEST_LA_PASSWORD!);
  return pair.la;
}
export async function maClient(): Promise<SupabaseClient> {
  pair.ma ??= await signedIn(process.env.TEST_MA_EMAIL!, process.env.TEST_MA_PASSWORD!);
  return pair.ma;
}

export async function uid(c: SupabaseClient): Promise<string> {
  const { data } = await c.auth.getUser();
  return data.user!.id;
}
