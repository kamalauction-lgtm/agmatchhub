/**
 * Two honest facts about every AI role, decided from backend rows only.
 *
 *   access  — can THIS agent open it right now?
 *             open · unavailable (live, but the agent is not verified) ·
 *             planned · hero (lives in AG Hero; link your account) · hero_open
 *   engine  — HOW does it answer today?
 *             ai             a model is routed AND its provider key is present
 *             rules          a model is routed but no key is present, so the
 *                            deterministic floor answers (every role has one)
 *             rules_by_design no model is routed at all: the role is rules-based
 *
 * "36 live" and "36 with AI" are different claims. `ai_roles.status = 'live'`
 * means the screen exists and opens; it says nothing about a model answering.
 * These functions are pure (no database, no env) so the mapping is unit-tested
 * and the pages only translate what comes back.
 */

export type Provider = "gemini" | "anthropic";

export type WorkforceRole = {
  key: string;
  status: "live" | "planned" | "hidden";
  route: string | null;
  external_url: string | null;
  feature: string | null;
};

export type WorkforceModel = {
  feature: string;
  provider: Provider | "none";
  fallback_provider: Provider | null;
  enabled: boolean;
};

export type RoleAccess = "open" | "unavailable" | "planned" | "hero" | "hero_open";
export type RoleEngine = "ai" | "rules" | "rules_by_design";

export type AccessContext = { verified: boolean; heroLinked: boolean };

export function roleAccess(r: WorkforceRole, ctx: AccessContext): RoleAccess {
  if (r.status === "live" && r.route) return ctx.verified ? "open" : "unavailable";
  if (r.external_url) return ctx.heroLinked ? "hero_open" : "hero";
  return "planned";
}

export function roleEngine(
  r: WorkforceRole,
  model: WorkforceModel | undefined,
  keyPresent: (p: Provider) => boolean,
): RoleEngine {
  if (!r.feature || !model || !model.enabled || model.provider === "none") return "rules_by_design";
  const providers: Provider[] = [model.provider, ...(model.fallback_provider ? [model.fallback_provider] : [])];
  return providers.some(keyPresent) ? "ai" : "rules";
}

export type WorkforceSummary = {
  /** Roles the agent can see (status ≠ hidden). */
  total: number;
  /** Roles whose screen opens for this agent now. */
  open: number;
  /** Roles a model answers for, today, in this deployment. */
  aiConnected: number;
  /** Roles answering through their deterministic floor (routed, no key). */
  rulesOnly: number;
  /** Roles with no model routed at all. */
  rulesByDesign: number;
};

export function summariseWorkforce(
  roles: WorkforceRole[],
  models: WorkforceModel[],
  ctx: AccessContext,
  keyPresent: (p: Provider) => boolean,
): WorkforceSummary {
  const byFeature = new Map(models.map((m) => [m.feature, m]));
  const visible = roles.filter((r) => r.status !== "hidden");
  const s: WorkforceSummary = { total: visible.length, open: 0, aiConnected: 0, rulesOnly: 0, rulesByDesign: 0 };
  for (const r of visible) {
    if (roleAccess(r, ctx) === "open") s.open += 1;
    const e = roleEngine(r, r.feature ? byFeature.get(r.feature) : undefined, keyPresent);
    if (e === "ai") s.aiConnected += 1;
    else if (e === "rules") s.rulesOnly += 1;
    else s.rulesByDesign += 1;
  }
  return s;
}
