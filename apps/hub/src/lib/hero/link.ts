import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@pg/ai";
import { createServiceClient } from "@/lib/supabase/service";
import { heroRenStatus, heroConfigured, type HeroStatus } from "./client";
import { normalisePhone } from "./phone";

/**
 * Link (or re-check) one agent against Hero, using ONLY the identifiers the
 * hub itself holds for them — the registration e-mail and the WhatsApp /
 * mobile number in users_private. Never a value the agent typed into a box,
 * which is what would let somebody claim a colleague's Hero account.
 *
 * E-mail first, then phone. The result goes through hero_link_record(), which
 * decides linked / stale and grants or lets benefits run out. The caller's
 * client (the agent's own session, or the service role from the cron) is
 * what calls the RPC, so the self-or-service guard in the database applies.
 */

export type LinkOutcome =
  | { kind: "not_configured" }
  | { kind: "no_identifiers" }
  | { kind: "linked"; method: "email" | "phone" }
  | { kind: "found_no_login"; method: "email" | "phone" }
  | { kind: "not_found" }
  | { kind: "error"; detail: string };

export async function linkHeroFor(userId: string, db: SupabaseClient): Promise<LinkOutcome> {
  if (!heroConfigured()) return { kind: "not_configured" };

  const service = createServiceClient();
  const { data: priv } = await service
    .from("users_private")
    .select("email, whatsapp_number, mobile_number")
    .eq("user_id", userId)
    .maybeSingle();
  const email = priv?.email?.trim().toLowerCase() || null;
  const phone = normalisePhone(priv?.whatsapp_number) ?? normalisePhone(priv?.mobile_number);
  if (!email && !phone) return { kind: "no_identifiers" };

  const attempts: { method: "email" | "phone"; q: { email: string } | { phone: string }; raw: string }[] = [];
  if (email) attempts.push({ method: "email", q: { email }, raw: email });
  if (phone) attempts.push({ method: "phone", q: { phone }, raw: phone });

  let lastErr: Extract<HeroStatus, { ok: false }> | null = null;
  for (const a of attempts) {
    const res = await heroRenStatus(a.q);
    if (!res.configured) return { kind: "not_configured" };
    if (!res.ok) { lastErr = res; continue; }
    if (!res.found) continue;

    const hash = await sha256Hex(`${a.method}:${a.raw}`);
    const { data: status, error } = await db.rpc("hero_link_record", {
      p_user: userId, p_method: a.method, p_hash: hash, p_result: "found",
      p_account_created: res.accountCreatedAt, p_first_login: res.firstLoginAt, p_last_login: res.lastLoginAt,
      p_country: res.country, p_membership: res.membershipStatus, p_error: null,
    });
    if (error) return { kind: "error", detail: error.message };
    return status === "linked" ? { kind: "linked", method: a.method } : { kind: "found_no_login", method: a.method };
  }

  if (lastErr) {
    // Transient: record the error, keep whatever state the link had.
    const hash = await sha256Hex(`${attempts[0].method}:${attempts[0].raw}`);
    await db.rpc("hero_link_record", {
      p_user: userId, p_method: attempts[0].method, p_hash: hash, p_result: "error",
      p_account_created: null, p_first_login: null, p_last_login: null, p_country: null, p_membership: null,
      p_error: `${lastErr.kind}${lastErr.status ? ` ${lastErr.status}` : ""}`,
    });
    return { kind: "error", detail: lastErr.kind };
  }

  const hash = await sha256Hex(`${attempts[0].method}:${attempts[0].raw}`);
  await db.rpc("hero_link_record", {
    p_user: userId, p_method: attempts[0].method, p_hash: hash, p_result: "not_found",
    p_account_created: null, p_first_login: null, p_last_login: null, p_country: null, p_membership: null, p_error: null,
  });
  return { kind: "not_found" };
}
