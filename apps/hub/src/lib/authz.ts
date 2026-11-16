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

/**
 * Capability gate for one country — use it wherever the thing being acted on
 * has a country (an agent, a listing, a request).
 *
 * `requireCapability` answers "may this person verify agents at all". A
 * country admin holds that for {MY} only, but until this helper existed every
 * admin action asked only the global question, so `user_roles.country_codes`
 * was stored and never enforced. `has_capability_in` (00060) treats an empty
 * country list as global, so super admins and admins are unaffected.
 *
 * A null country is allowed only for global holders: an entity with no
 * country is not inside anyone's scope.
 */
export async function requireCapabilityIn(
  capability: string,
  country: string | null | undefined,
  deniedPath = "/admin",
): Promise<User> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("has_capability_in", {
    p_capability: capability,
    p_country: country ?? null,
  });
  if (!allowed) {
    const sep = deniedPath.includes("?") ? "&" : "?";
    redirect(`${deniedPath}${sep}denied=${encodeURIComponent(capability)}`);
  }
  return user;
}

/**
 * The countries the signed-in user may act on for one capability, for
 * filtering list pages: `null` = every country (a global grant), `[]` = none.
 * Mirrors `has_capability_in`: a role row that carries the capability with an
 * empty country list makes the holder global.
 */
export async function capabilityCountries(capability: string): Promise<string[] | null> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: grants } = await supabase
    .from("user_roles")
    .select("role_id, country_codes")
    .eq("user_id", user.id);
  if (!grants?.length) return [];
  const { data: caps } = await supabase
    .from("role_capabilities")
    .select("role_id")
    .eq("capability_key", capability)
    .in("role_id", grants.map((g) => g.role_id as string));
  const holding = new Set((caps ?? []).map((c) => c.role_id as string));
  const relevant = grants.filter((g) => holding.has(g.role_id as string));
  if (!relevant.length) return [];
  const codes = relevant.map((g) => (g.country_codes ?? []) as string[]);
  if (codes.some((c) => c.length === 0)) return null;
  return [...new Set(codes.flat())];
}

/** Every capability the signed-in user holds, for greying out what they cannot do. */
export async function myCapabilities(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_capabilities");
  return new Set(
    ((data ?? []) as { capability_key: string }[]).map((r) => r.capability_key),
  );
}
