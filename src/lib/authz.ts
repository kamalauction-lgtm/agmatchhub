import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/** Returns the signed-in user or redirects to /login. */
export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Platform-admin gate (server-side, backed by user_roles via the
 * is_platform_admin() DB function — never client metadata).
 */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/dashboard");
  return user;
}
