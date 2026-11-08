import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodType } from "zod";
import {
  generate,
  redact,
  sha256Hex,
  canonical,
  apiKeyEnvName,
  ProviderError,
  type ModelRoute,
  type Provider,
  type Attachment,
} from "@pg/ai";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { defaultPrompt, fillTemplate } from "./prompts";

/**
 * The one door every AI capability walks through.
 *
 *   runAi(feature, input, schema, ctx)
 *     → may this agent, right now, spend a call?      (flag · verified · caps · quota)
 *     → which provider/model/prompt answers it?        (rows in ai_models / ai_prompts)
 *     → call, with redacted input and a hard timeout
 *     → write ONE ledger row whatever happened         (ai_record_job)
 *     → hand back a typed object, or a reason
 *
 * Callers never see a provider, a key or an exception. They get `ok` with the
 * parsed output, or `denied`/`failed` with a reason they translate into "AI is
 * resting today — here is the rules-only version". That contract is what lets
 * every feature keep its deterministic path as the thing that always works.
 */

export type DeniedReason =
  | "disabled" | "quota" | "daily_cap" | "platform_cap" | "circuit_open"
  | "unverified" | "feature_off" | "no_provider";

export type AiOutcome<T> =
  | { ok: true; output: T; jobId: string | null; provider: Provider; model: string; latencyMs: number }
  | { ok: false; kind: "denied"; reason: DeniedReason; jobId: string | null }
  | { ok: false; kind: "failed"; reason: ProviderError["kind"]; jobId: string | null };

export type AiContext = {
  userId: string;
  locale: string;
  /** What the call was about, for the ledger — never the content. */
  refType?: string;
  refId?: string;
  /** Redact phones/e-mails/IDs from string inputs before the call. Default true. */
  redactInput?: boolean;
  /** A cron runs without a session; it passes the service client. */
  client?: SupabaseClient;
  /** Allow an unverified agent (admins testing prompts). Default false. */
  allowUnverified?: boolean;
  temperature?: number;
  /**
   * Files that go to the model with the text (photos, a PDF). Never redacted,
   * never logged; only their count and sizes enter the input hash.
   */
  attachments?: Attachment[];
  /** A vision or document call may need longer than a text one. */
  timeoutMs?: number;
};

type QuotaRow = {
  enabled: boolean; monthly_allowance: number; used_this_month: number; remaining: number;
  per_user_daily_cap: number; used_today: number; platform_open: boolean; circuit_open: boolean;
};

type ModelRow = {
  feature: string; provider: "gemini" | "anthropic" | "none"; model: string;
  fallback_provider: "gemini" | "anthropic" | null; fallback_model: string | null;
  max_output_tokens: number; input_cost_micros_per_1k: number; output_cost_micros_per_1k: number; enabled: boolean;
};

export async function runAi<T>(
  feature: string,
  input: Record<string, unknown>,
  schema: ZodType<T>,
  ctx: AiContext,
): Promise<AiOutcome<T>> {
  const db = ctx.client ?? (await createClient());
  const service = createServiceClient();

  const record = async (fields: Omit<JobFields, "feature">) => recordJob(db, ctx, { feature, ...fields });

  // 1 · Is the feature on for this person at all?
  const { data: flagOn } = await db.rpc("is_feature_enabled", { p_key: "ai_features", p_user: ctx.userId });
  if (flagOn !== true) return { ok: false, kind: "denied", reason: "feature_off", jobId: await record({ status: "denied", denied_reason: "feature_off" }) };

  if (!ctx.allowUnverified) {
    const { data: profile } = await service.from("profiles").select("agent_status").eq("id", ctx.userId).maybeSingle();
    if (profile?.agent_status !== "verified") {
      return { ok: false, kind: "denied", reason: "unverified", jobId: await record({ status: "denied", denied_reason: "unverified" }) };
    }
  }

  // 2 · Quota and caps, in one round trip.
  const { data: quotaRows, error: quotaErr } = await db.rpc("ai_quota_status", { p_user: ctx.userId });
  const quota = (Array.isArray(quotaRows) ? quotaRows[0] : quotaRows) as QuotaRow | undefined;
  if (quotaErr || !quota) {
    console.error("ai_quota_status failed", quotaErr?.message);
    return { ok: false, kind: "denied", reason: "disabled", jobId: null };
  }
  const denied: DeniedReason | null =
    !quota.enabled ? "disabled"
    : quota.circuit_open ? "circuit_open"
    : !quota.platform_open ? "platform_cap"
    : quota.used_today >= quota.per_user_daily_cap ? "daily_cap"
    : quota.remaining <= 0 ? "quota"
    : null;
  if (denied) return { ok: false, kind: "denied", reason: denied, jobId: await record({ status: "denied", denied_reason: denied }) };

  // 3 · Route and key.
  const { data: modelRow } = await service.from("ai_models").select("*").eq("feature", feature).maybeSingle<ModelRow>();
  const routes = resolveRoutes(modelRow);
  if (!routes.length) return { ok: false, kind: "denied", reason: "no_provider", jobId: await record({ status: "denied", denied_reason: "no_provider" }) };

  // 4 · Prompt: current DB row for the locale, then 'any', then the code default.
  const { data: promptRows } = await service
    .from("ai_prompts")
    .select("locale, version, system_text, template_text")
    .eq("feature", feature)
    .eq("is_current", true)
    .in("locale", [ctx.locale, "any"]);
  const dbPrompt =
    promptRows?.find((p) => p.locale === ctx.locale) ?? promptRows?.find((p) => p.locale === "any") ?? null;
  const prompt = dbPrompt
    ? { system: dbPrompt.system_text, template: dbPrompt.template_text, version: dbPrompt.version }
    : { ...(defaultPrompt(feature, ctx.locale) ?? { system: "", template: "{{input}}" }), version: 0 };

  // 5 · Input: redact, then fill.
  const safeInput = ctx.redactInput === false ? input : redactDeep(input);
  const userText = fillTemplate(prompt.template, { ...safeInput, input: safeInput });
  const inputHash = await sha256Hex(canonical({
    feature, v: prompt.version, locale: ctx.locale, i: safeInput,
    a: (ctx.attachments ?? []).map((x) => [x.mimeType, x.dataBase64.length]),
  }));

  // 6 · Call, fall back once, record exactly once per attempt.
  let lastKind: ProviderError["kind"] = "upstream";
  for (const route of routes) {
    const apiKey = process.env[apiKeyEnvName(route.provider)];
    if (!apiKey) continue;
    try {
      const res = await generate({
        route, apiKey, system: prompt.system, user: userText, schema, temperature: ctx.temperature,
        attachments: ctx.attachments, timeoutMs: ctx.timeoutMs,
      });
      const jobId = await record({
        status: "ok", provider: res.provider, model: res.model, prompt_version: prompt.version, input_hash: inputHash,
        tokens_in: res.usage.tokensIn, tokens_out: res.usage.tokensOut, cost_micros: res.costMicros, latency_ms: res.latencyMs,
      });
      return { ok: true, output: res.output, jobId, provider: res.provider, model: res.model, latencyMs: res.latencyMs };
    } catch (err) {
      const kind = err instanceof ProviderError ? err.kind : "upstream";
      lastKind = kind;
      await record({ status: "error", provider: route.provider, model: route.model, prompt_version: prompt.version, input_hash: inputHash, error: kind });
      // A bad output or a timeout is worth one more try on the fallback; an
      // auth failure on the primary key is not a reason to burn the fallback's.
      await db.rpc("ai_note_provider_failure");
      if (kind === "auth") break;
    }
  }
  if (routes.every((r) => !process.env[apiKeyEnvName(r.provider)])) {
    return { ok: false, kind: "denied", reason: "no_provider", jobId: await record({ status: "denied", denied_reason: "no_provider" }) };
  }
  return { ok: false, kind: "failed", reason: lastKind, jobId: null };
}

/** Primary then fallback, skipping anything disabled or unrouted. */
function resolveRoutes(row: ModelRow | null | undefined): ModelRoute[] {
  if (!row || !row.enabled || row.provider === "none") return [];
  const base = {
    feature: row.feature,
    maxOutputTokens: row.max_output_tokens,
    inputCostMicrosPer1k: row.input_cost_micros_per_1k,
    outputCostMicrosPer1k: row.output_cost_micros_per_1k,
  };
  const routes: ModelRoute[] = [{ ...base, provider: row.provider, model: row.model }];
  if (row.fallback_provider && row.fallback_model) routes.push({ ...base, provider: row.fallback_provider, model: row.fallback_model });
  return routes;
}

/** Redact every string in a (shallow or nested) input object. */
function redactDeep<V>(value: V): V {
  if (typeof value === "string") return redact(value).text as unknown as V;
  if (Array.isArray(value)) return value.map(redactDeep) as unknown as V;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactDeep(v)])) as V;
  }
  return value;
}

type JobFields = {
  feature: string; status: "ok" | "degraded" | "error" | "denied"; denied_reason?: DeniedReason;
  provider?: string; model?: string; prompt_version?: number; input_hash?: string;
  tokens_in?: number; tokens_out?: number; cost_micros?: number; latency_ms?: number; error?: string;
};

async function recordJob(db: SupabaseClient, ctx: AiContext, f: JobFields): Promise<string | null> {
  const { data, error } = await db.rpc("ai_record_job", {
    p_user: ctx.userId, p_feature: f.feature, p_provider: f.provider ?? null, p_model: f.model ?? null,
    p_prompt_version: f.prompt_version ?? null, p_status: f.status, p_denied_reason: f.denied_reason ?? null,
    p_ref_type: ctx.refType ?? null, p_ref_id: ctx.refId ?? null, p_input_hash: f.input_hash ?? null,
    p_tokens_in: f.tokens_in ?? 0, p_tokens_out: f.tokens_out ?? 0, p_cost_micros: f.cost_micros ?? 0,
    p_latency_ms: f.latency_ms ?? null, p_error: f.error ?? null,
  });
  if (error) {
    // The ledger failing must not take the feature down with it, but it must
    // be visible: an unrecorded call is a metering hole.
    console.error("ai_record_job failed", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/** What the UI shows next to an AI button: remaining tasks this month. */
export async function aiQuotaFor(userId: string): Promise<QuotaRow | null> {
  const db = await createClient();
  const { data } = await db.rpc("ai_quota_status", { p_user: userId });
  const row = (Array.isArray(data) ? data[0] : data) as QuotaRow | undefined;
  return row ?? null;
}
