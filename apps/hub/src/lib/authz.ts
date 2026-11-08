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

/**
 * Capability gate — the narrower question `requireAdmin` cannot answer.
 *
 * `requireAdmin` asks "may this person open the admin area", which is true for
 * all four admin roles. It was also, until migration 00060, the only check on
 * every write in the admin — so a compliance admin whose role is specified as
 * "review only, no commercial edits" could edit advertising banners and
 * publish country configuration.
 *
 * Anything that WRITES should gate on a capability instead. Reading may still
 * gate on `requireAdmin`.
 */
export async function requireCapability(capability: string): Promise<User> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("has_capability", {
    p_capability: capability,
  });
  if (!allowed) redirect("/admin?denied=" + encodeURIComponent(capability));
  return user;
}

/** Every capability the signed-in user holds, for greying out what they cannot do. */
export async function myCapabilities(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_capabilities");
  return new Set(
    ((data ?? []) as { capability_key: string }[]).map((r) => r.capability_key),
  );
}
