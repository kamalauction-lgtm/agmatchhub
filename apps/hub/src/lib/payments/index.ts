import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { billplz } from "./billplz";
import { midtrans } from "./midtrans";
import { stripe } from "./stripe";
import type { IntentForCheckout, PaymentAdapter, ProviderKey, ProviderMode, WebhookVerdict } from "./types";

export type { ProviderKey, ProviderMode } from "./types";

/**
 * The billing system's one door to the gateways (Decision 8).
 *
 *   startCheckout(intentId)   intent row → adapter → checkout URL, recorded
 *   handleWebhook(provider)   raw delivery → verified verdict → settle, recorded
 *
 * Both run with the service client, because a webhook has no user session and
 * a checkout must read the payer's private contact details. Both are safe to
 * run twice: the gateway's event id is unique in payment_events and
 * payment_intent_settle() is idempotent.
 */

const ADAPTERS: Record<ProviderKey, PaymentAdapter> = { billplz, midtrans, stripe };

export function adapterFor(key: string): PaymentAdapter | null {
  return (ADAPTERS as Record<string, PaymentAdapter>)[key] ?? null;
}

export const PROVIDER_KEYS = Object.keys(ADAPTERS) as ProviderKey[];

/** Which secrets each gateway needs — names only, for the admin screen and the readiness report. */
export const PROVIDER_ENV: Record<ProviderKey, string[]> = {
  billplz: ["BILLPLZ_API_KEY", "BILLPLZ_COLLECTION_ID", "BILLPLZ_X_SIGNATURE_KEY"],
  midtrans: ["MIDTRANS_SERVER_KEY"],
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
};

/** Presence only. Never the values. */
export function providerConfigured(key: ProviderKey, mode: ProviderMode): boolean {
  return ADAPTERS[key].configured(mode);
}

function baseUrl(): string {
  return (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

export function webhookUrl(key: ProviderKey): string {
  return `${baseUrl()}/api/payments/webhook/${key}`;
}

export type StartResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; reason: "not_found" | "not_configured" | "mode_mismatch" | "gateway_error" | "network" | "not_open" };

export async function startCheckout(intentId: string, description: string): Promise<StartResult> {
  const service = createServiceClient();
  const { data: intent } = await service
    .from("payment_intents")
    .select("id, human_readable_id, user_id, provider_key, mode, kind, currency, amount, expires_at, status")
    .eq("id", intentId)
    .maybeSingle();
  if (!intent) return { ok: false, reason: "not_found" };
  if (intent.status !== "created") return { ok: false, reason: "not_open" };
  const adapter = adapterFor(intent.provider_key);
  if (!adapter) return { ok: false, reason: "not_configured" };

  const [{ data: profile }, { data: priv }] = await Promise.all([
    service.from("profiles").select("display_name").eq("id", intent.user_id).maybeSingle(),
    service.from("users_private").select("email, whatsapp_number, mobile_number").eq("user_id", intent.user_id).maybeSingle(),
  ]);

  const result = await adapter.createCheckout(intent as IntentForCheckout, {
    returnUrl: `${baseUrl()}/plan/payment/${intent.id}`,
    webhookUrl: webhookUrl(intent.provider_key as ProviderKey),
    description: `${description} · ${intent.human_readable_id}`,
    payer: { name: profile?.display_name ?? null, email: priv?.email ?? null, phone: priv?.whatsapp_number ?? priv?.mobile_number ?? null },
  });

  if (!result.ok) {
    await service.rpc("payment_intent_checkout", { p_intent: intent.id, p_provider_ref: null, p_checkout_url: null, p_failure: `${result.reason}${result.detail ? `: ${result.detail}` : ""}` });
    console.error("[payments] checkout failed", intent.provider_key, result.reason, result.detail ?? "");
    return { ok: false, reason: result.reason };
  }
  const { error } = await service.rpc("payment_intent_checkout", { p_intent: intent.id, p_provider_ref: result.providerRef, p_checkout_url: result.checkoutUrl, p_failure: null });
  if (error) console.error("[payments] could not record checkout", error.message);
  return { ok: true, checkoutUrl: result.checkoutUrl };
}

export type WebhookOutcome = {
  http: number;
  recorded: number;
  outcomes: string[];
};

/**
 * Verify, record, settle. HTTP status is for the gateway's retry logic:
 *   400 bad signature / payload (recorded, never settled)
 *   503 adapter not configured (not recorded — nothing to verify with)
 *   200 everything else, including "we do not know this intent", so the
 *       gateway stops retrying something we have already written down.
 */
export async function handleWebhook(providerKey: string, rawBody: string, headers: Headers, db?: SupabaseClient): Promise<WebhookOutcome> {
  const adapter = adapterFor(providerKey);
  if (!adapter) return { http: 404, recorded: 0, outcomes: ["unknown_provider"] };
  const service = db ?? createServiceClient();
  const { data: provider } = await service.from("payment_providers").select("mode").eq("key", providerKey).maybeSingle();
  const mode: ProviderMode = provider?.mode === "live" ? "live" : "sandbox";

  const verified = await adapter.verifyWebhook(rawBody, headers, mode);
  if (!verified.valid) {
    if (verified.reason === "not_configured") return { http: 503, recorded: 0, outcomes: ["not_configured"] };
    await service.from("payment_events").insert({
      provider_key: providerKey, provider_event_id: null, intent_id: null, event_type: "unverified",
      signature_valid: false, payload: redact(verified.payload), outcome: verified.reason,
    });
    return { http: 400, recorded: 1, outcomes: [verified.reason] };
  }

  const outcomes: string[] = [];
  let recorded = 0;
  for (const v of verified.verdicts) {
    const intentId = await resolveIntent(service, providerKey, v);
    const { data: ev, error } = await service
      .from("payment_events")
      .insert({
        provider_key: providerKey, provider_event_id: v.eventId, intent_id: intentId, event_type: v.eventType,
        signature_valid: true, amount: v.amount, currency: v.currency, payload: redact(verified.payload), outcome: "received",
      })
      .select("id")
      .maybeSingle();
    if (error?.code === "23505") { outcomes.push("duplicate"); continue; }   // same gateway event again
    if (error) { console.error("[payments] event insert failed", error.message); outcomes.push("record_failed"); continue; }
    recorded++;

    let outcome = "ignored";
    if (!intentId) outcome = "unknown_intent";
    else if (v.status !== "ignored") {
      const { data, error: sErr } = await service.rpc("payment_intent_settle", {
        p_intent: intentId, p_status: v.status, p_amount: v.amount, p_currency: v.currency, p_provider_ref: v.providerRef, p_paid_at: v.paidAt,
      });
      outcome = sErr ? `settle_error: ${sErr.message.slice(0, 120)}` : String(data);
    }
    if (ev) await service.from("payment_events").update({ outcome }).eq("id", ev.id);
    outcomes.push(outcome);
  }
  return { http: 200, recorded, outcomes };
}

async function resolveIntent(service: SupabaseClient, providerKey: string, v: WebhookVerdict): Promise<string | null> {
  if (v.intentId && /^[0-9a-f-]{36}$/i.test(v.intentId)) {
    const { data } = await service.from("payment_intents").select("id").eq("id", v.intentId).eq("provider_key", providerKey).maybeSingle();
    if (data) return data.id;
  }
  if (v.providerRef) {
    const { data } = await service.from("payment_intents").select("id").eq("provider_key", providerKey).eq("provider_ref", v.providerRef).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

/** Keep the delivery for the audit, minus anything that could be a secret. */
function redact(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload ?? null;
  const SECRET = /signature|secret|key|token|password|authorization/i;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SECRET.test(k) ? "[redacted]" : walk(x)]));
    }
    return v;
  };
  return walk(payload);
}
