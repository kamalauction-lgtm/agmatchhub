/**
 * Usage quotas — TEMPORARY flat defaults.
 *
 * TODO(entitlements): Epic 4 replaces this file with the plans/entitlements
 * engine (plans, plan_versions, entitlements, usage_quotas tables), where
 * limits are admin-editable per plan and never live in code (§7: "Do not
 * hard-code prices into business logic" — the same applies to limits).
 *
 * Until then one honest constant, in one place, imported everywhere a limit
 * is enforced, so the swap is a single-file change.
 */
export const MAX_ACTIVE_LISTINGS = 20;
