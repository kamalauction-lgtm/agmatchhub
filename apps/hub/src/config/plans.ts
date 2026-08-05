/**
 * Plan display — TEMPORARY, like config/quotas.ts.
 *
 * TODO(entitlements): Epic 4 replaces this with the plans / plan_versions /
 * entitlements tables, where tiers, prices, limits and expiry are
 * admin-editable and never live in code (§7).
 *
 * Until then we derive a display tier honestly from what we actually know,
 * and every benchmarked platform proves the surface matters: PropertyGuru,
 * PropMall and Rumah123 all show tier, validity and an upgrade path on the
 * agent's first screen.
 */
import { MAX_ACTIVE_LISTINGS } from "./quotas";

export type PlanView = {
  key: "free" | "iqi_premium";
  /** Translation key under `plans.` */
  nameKey: string;
  maxListings: number;
  /** Complimentary entitlements have no expiry until membership revalidation exists. */
  expiresAt: string | null;
  canUpgrade: boolean;
};

/**
 * §8: a verified agent in good standing receives Premium at no subscription
 * cost. Verification is the only signal we can trust today, so it is the only
 * one used — no invented plan state.
 */
export function planFor(agentStatus: string | null | undefined): PlanView {
  if (agentStatus === "verified") {
    return {
      key: "iqi_premium",
      nameKey: "iqiPremium",
      maxListings: MAX_ACTIVE_LISTINGS,
      expiresAt: null,
      canUpgrade: false,
    };
  }
  return {
    key: "free",
    nameKey: "free",
    maxListings: MAX_ACTIVE_LISTINGS,
    expiresAt: null,
    canUpgrade: true,
  };
}
