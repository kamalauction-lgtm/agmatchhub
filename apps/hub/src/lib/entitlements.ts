import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * What an agent may do, resolved from plan + grants.
 *
 * This replaces `config/quotas.ts`, whose own comment admitted it was a
 * placeholder: one flat `MAX_ACTIVE_LISTINGS = 20` imported everywhere a limit
 * was enforced. That constant made every plan identical and made referral
 * rewards impossible — you cannot grant somebody twenty more listings when the
 * limit is a number compiled into the bundle.
 *
 * The arithmetic lives in Postgres (migration 00062), not here, for a reason
 * that matters: enforcement and explanation must come from the SAME code path.
 * `entitlement_lines()` returns the working, `resolve_entitlement_int()` sums
 * it, and the admin's "why does this agent have 355 slots" screen reads the
 * lines. If this file did the summing, the explanation could drift from what
 * is actually enforced and nobody would notice until an agent complained.
 */

export const ENTITLEMENT = {
  listingActiveLimit: "listing.active_limit",
  listingImportLimit: "listing.import_limit",
  boostMonthlyCredits: "boost.monthly_credits",
  featuredVouchers: "featured.vouchers",
  aiMonthlyUsage: "ai.monthly_usage",
  websiteEnabled: "website.enabled",
  websiteCustomDomain: "website.custom_domain",
  analyticsLevel: "analytics.level",
  contentStudioLevel: "content_studio.level",
  comarketingEnabled: "comarketing.enabled",
  matchhubEnabled: "matchhub.enabled",
  supportLevel: "support.level",
} as const;

export type EntitlementKey = (typeof ENTITLEMENT)[keyof typeof ENTITLEMENT];

/**
 * A numeric allowance, already combined across plan, grants and bonuses.
 *
 * Falls back to 0 rather than to a generous default: if resolution fails, the
 * safe answer is "no allowance", which surfaces as a blocked action somebody
 * reports — not as an agent silently publishing past their plan.
 */
export async function entitlementInt(userId: string, key: EntitlementKey): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_entitlement_int", {
    p_user: userId,
    p_key: key,
  });
  if (error) {
    console.error("entitlementInt failed", key, error.message);
    return 0;
  }
  return Number(data ?? 0);
}

export async function entitlementBool(userId: string, key: EntitlementKey): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_entitlement_bool", {
    p_user: userId,
    p_key: key,
  });
  if (error) {
    console.error("entitlementBool failed", key, error.message);
    return false;
  }
  return data === true;
}

export async function entitlementTier(userId: string, key: EntitlementKey): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("resolve_entitlement_tier", { p_user: userId, p_key: key });
  return (data as string | null) ?? null;
}

export type EntitlementLine = {
  source: string;
  label: string | null;
  int_value: number | null;
  bool_value: boolean | null;
  tier_value: string | null;
  expires_at: string | null;
};

/** Every contributing line — the "why", for the explanation screen. */
export async function entitlementLines(
  userId: string,
  key: EntitlementKey,
): Promise<EntitlementLine[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("entitlement_lines", { p_user: userId, p_key: key });
  return (data ?? []) as EntitlementLine[];
}

/* -------------------------------------------------------------------------- */
/* Price lists, families and credits (00090–00091, Decision 4)                  */
/* -------------------------------------------------------------------------- */

/** MY → MYR, ID → IDR for a verified agent; USD otherwise. Never from IP. */
export async function priceCurrencyFor(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("price_currency_for", { p_user: userId });
  return (data as string | null) ?? "USD";
}

export type CataloguePlan = {
  plan_key: string;
  product_key: string | null;
  product_name: string | null;
  name: string;
  description: string | null;
  family: string;
  rank: number;
  plan_version_id: string;
  version: number;
  currency: string;
  monthly_price: string | null;
  annual_price: string | null;
  entitlements: Record<string, number | boolean | string | null>;
};

/** Every agent-family plan in one currency, with what its current version carries. */
export async function planCatalogue(currency: string): Promise<CataloguePlan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("plan_catalogue", { p_currency: currency });
  if (error) {
    console.error("planCatalogue failed", currency, error.message);
    return [];
  }
  return (data ?? []) as CataloguePlan[];
}

export type CreditKind = "boost" | "ai";

/** Spendable balance of one kind; 0 when no wallet exists yet. */
export async function creditBalance(userId: string, kind: CreditKind): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("credit_balance", { p_agent: userId, p_kind: kind });
  return Number(data ?? 0);
}

/** Format an amount in the currency's own locale conventions. */
export function formatMoney(amount: number | string | null, currency: string, locale?: string): string {
  if (amount === null) return "—";
  const loc = locale ?? (currency === "IDR" ? "id-ID" : currency === "MYR" ? "ms-MY" : "en-US");
  return new Intl.NumberFormat(loc, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "IDR" ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(Number(amount));
}

export type ResolvedPrice = {
  plan_key: string;
  plan_name: string;
  currency: string;
  base_price: string;
  policy_id: string | null;
  policy_name: string | null;
  treatment: string | null;
  effective_price: string;
  billing_mode: "FREE_LAUNCH" | "SHADOW_BILLING" | "LIVE_BILLING";
};

/**
 * What this agent would pay.
 *
 * "Would" is the operative word during FREE_LAUNCH: the number is computed and
 * nobody is charged, so switching to SHADOW_BILLING later needs a report, not
 * new arithmetic.
 */
export async function resolvedPrice(
  userId: string,
  cadence: "monthly" | "annual" = "monthly",
): Promise<ResolvedPrice | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("resolve_price", { p_user: userId, p_cadence: cadence });
  const rows = (data ?? []) as ResolvedPrice[];
  return rows[0] ?? null;
}
