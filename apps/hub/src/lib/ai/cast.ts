import "server-only";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Companion } from "@/components/ai/companion";

/**
 * The cast on duty for one screen: the characters (ai_role_personas, 00097)
 * for the roles that screen uses, with the role title in the agent's language.
 *
 * One query for the personas, one for the role names. A row for the agent's
 * country wins over the default row, so the same call keeps working if the
 * owner ever gives a market its own character — today the cast is shared
 * (owner, 8 Nov 2026: same names for both countries).
 */
export async function getCompanions(keys: readonly string[]): Promise<Record<string, Companion>> {
  if (!keys.length) return {};
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: personas }, { data: roles }, { data: profile }] = await Promise.all([
    supabase.from("ai_role_personas").select("role_key, country_code, name, avatar_path").in("role_key", [...keys]),
    supabase.from("ai_roles").select("key, name").in("key", [...keys]),
    user ? supabase.from("profiles").select("country_code").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const country = profile?.country_code ?? null;
  const roleName = new Map((roles ?? []).map((r) => {
    const n = r.name as Record<string, string>;
    return [r.key, n[locale] ?? n.en ?? r.key];
  }));
  const out: Record<string, Companion> = {};
  const rows = personas ?? [];
  // Defaults first, then the agent's own country on top; other countries never.
  for (const p of rows.filter((p) => !p.country_code)) {
    out[p.role_key] = { key: p.role_key, name: p.name, avatar: p.avatar_path, role: roleName.get(p.role_key) ?? p.role_key };
  }
  for (const p of rows.filter((p) => p.country_code && p.country_code === country)) {
    out[p.role_key] = { key: p.role_key, name: p.name, avatar: p.avatar_path, role: roleName.get(p.role_key) ?? p.role_key };
  }
  return out;
}
