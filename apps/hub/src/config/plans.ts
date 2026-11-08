import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ENTITLEMENT, entitlementInt, resolvedPrice } from "@/lib/entitlements";

/**
 * The agent's plan, as the dashboard shows it.
 *
 * This file used to invent a plan from `agent_status`: verified meant
 * "iqi_premium", everything else meant "free", and both quoted the same flat
 * `MAX_ACTIVE_LISTINGS`. Two agents on genuinely different plans looked
 * identical, and a referral bonus could not show up anywhere.
 *
 * It now reads the real answer from the entitlement engine (00061/00062), so
 * the number on the dashboard is the number the publish action enforces and
 * the number the admin's explanation screen itemises — one source, three uses.
 *
 * `canUpgrade` is deliberately false while billing mode is FREE_LAUNCH: there
 * is nothing to upgrade to when everyone already holds the top plan at no
 * charge, and an upgrade button that leads nowhere is worse than none.
 */

export type PlanView = {
  /** The plan key from the database — 'basic' | 'silver' | 'gold' | 'platinum'. */
  key: string;
  /** Display name as configured, already localised by the admin who set it. */
  name: string;
  /** What the plan is sold as (Free / Starter / Pro / Agency) — Decision 4. */
  productKey: string | null;
  productName: string | null;
  maxListings: number;
  /** Null until subscription expiry is actually managed. */
  expiresAt: string | null;
  canUpgrade: boolean;
  /** What they would pay. Zero during the launch, but computed, not assumed. */
  effectivePrice: number;
  currency: string;
  /** Why it is that price — e.g. "Indonesia Free Launch". */
  sourceLabel: string | null;
};

export async function planFor(userId: string): Promise<PlanView> {
  const [price, maxListings] = await Promise.all([
    resolvedPrice(userId),
    entitlementInt(userId, ENTITLEMENT.listingActiveLimit),
  ]);
  const supabase = await createClient();
  const { data: plan } = price
    ? await supabase.from("plans").select("product_key, product_name").eq("key", price.plan_key).maybeSingle()
    : { data: null };

  return {
    key: price?.plan_key ?? "basic",
    name: price?.plan_name ?? "Basic",
    productKey: plan?.product_key ?? null,
    productName: plan?.product_name ?? null,
    maxListings,
    expiresAt: null,
    canUpgrade: price?.billing_mode === "LIVE_BILLING" && price.plan_key !== "platinum",
    effectivePrice: Number(price?.effective_price ?? 0),
    currency: price?.currency ?? "IDR",
    sourceLabel: price?.policy_name ?? null,
  };
}
