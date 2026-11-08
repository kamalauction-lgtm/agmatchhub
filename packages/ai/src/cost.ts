import type { ModelRoute, Usage } from "./types";

/**
 * Cost in micro-USD from token counts and the per-1k prices on the route.
 *
 * Prices live in `ai_models`, entered by an admin from the provider's price
 * list, and default to 0 — so until somebody enters them the ledger records
 * tokens faithfully and cost honestly as unknown-zero, rather than a guess
 * baked into the bundle that silently goes stale when a provider reprices.
 */
export function costMicros(route: ModelRoute, usage: Usage): number {
  const input = Math.round((usage.tokensIn / 1000) * route.inputCostMicrosPer1k);
  const output = Math.round((usage.tokensOut / 1000) * route.outputCostMicrosPer1k);
  return Math.max(0, input + output);
}
