import { hmacHex, timingSafeEqual } from "./crypto";
import { minorUnits, fromMinorUnits, type PaymentAdapter, type ProviderMode, type WebhookVerdict } from "./types";

/**
 * Stripe (USD) — Checkout Sessions, REST, no SDK (the SDK is Node-shaped;
 * the Worker is not).
 *
 *   create   POST https://api.stripe.com/v1/checkout/sessions  Bearer <secret key>
 *            mode=payment, line_items[0][price_data][...], success_url, cancel_url,
 *            client_reference_id = our intent id, metadata[intent_id]
 *   webhook  Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>]
 *            v1 = HMAC-SHA256(webhook secret, `${t}.${rawBody}`); reject when
 *            |now - t| > 300 s (replay window, Stripe's own default).
 *
 * Keys: test keys start `sk_test_`, live `sk_live_`; the adapter refuses a key
 * whose prefix disagrees with the provider row's mode.
 *
 * Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 */

export function stripeKeyMatchesMode(secretKey: string, mode: ProviderMode): boolean {
  return mode === "sandbox" ? secretKey.startsWith("sk_test_") : secretKey.startsWith("sk_live_");
}

export function parseStripeSignatureHeader(header: string | null): { t: number; v1: string[] } | null {
  if (!header) return null;
  let t = NaN; const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.trim().split("=");
    if (k === "t") t = Number(v);
    else if (k === "v1" && v) v1.push(v);
  }
  return Number.isFinite(t) && v1.length ? { t, v1 } : null;
}

/** Pure: verify a raw body against the header and webhook secret. */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): Promise<boolean> {
  const parsed = parseStripeSignatureHeader(header);
  if (!parsed) return false;
  if (Math.abs(nowSeconds - parsed.t) > toleranceSeconds) return false;
  const expected = await hmacHex("SHA-256", secret, `${parsed.t}.${rawBody}`);
  return parsed.v1.some((sig) => timingSafeEqual(expected, sig.toLowerCase()));
}

type StripeEvent = {
  id?: string; type?: string; created?: number;
  data?: { object?: { id?: string; client_reference_id?: string | null; metadata?: Record<string, string>;
                      amount_total?: number; currency?: string; payment_status?: string; payment_intent?: string | null } };
};

/** Pure: event → verdict. Only Checkout Session events matter to us. */
export function stripeVerdict(ev: StripeEvent): WebhookVerdict {
  const o = ev.data?.object ?? {};
  const currency = (o.currency ?? "usd").toUpperCase();
  const amount = typeof o.amount_total === "number" ? fromMinorUnits(o.amount_total, currency) : null;
  let status: WebhookVerdict["status"] = "ignored";
  if ((ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") && o.payment_status === "paid") status = "paid";
  else if (ev.type === "checkout.session.async_payment_failed") status = "failed";
  else if (ev.type === "checkout.session.expired") status = "expired";
  else if (ev.type === "charge.refunded") status = "refunded";
  return {
    eventId: ev.id ?? null,
    eventType: ev.type ?? "unknown",
    intentId: o.client_reference_id ?? o.metadata?.intent_id ?? null,
    providerRef: o.id ?? null,
    status,
    amount,
    currency,
    paidAt: ev.created ? new Date(ev.created * 1000).toISOString() : null,
  };
}

export const stripe: PaymentAdapter = {
  key: "stripe",
  configured: (mode) => {
    const k = process.env.STRIPE_SECRET_KEY;
    return !!k && !!process.env.STRIPE_WEBHOOK_SECRET && stripeKeyMatchesMode(k, mode);
  },

  async createCheckout(intent, ctx) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || !process.env.STRIPE_WEBHOOK_SECRET) return { ok: false, reason: "not_configured" };
    if (!stripeKeyMatchesMode(key, intent.mode)) return { ok: false, reason: "mode_mismatch", detail: `key prefix does not match mode ${intent.mode}` };
    const body = new URLSearchParams({
      mode: "payment",
      client_reference_id: intent.id,
      "metadata[intent_id]": intent.id,
      success_url: ctx.returnUrl,
      cancel_url: ctx.returnUrl,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": intent.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(minorUnits(intent.amount, intent.currency)),
      "line_items[0][price_data][product_data][name]": ctx.description.slice(0, 120),
      expires_at: String(Math.min(Math.floor(Date.parse(intent.expires_at) / 1000), Math.floor(Date.now() / 1000) + 23 * 3600)),
    });
    if (ctx.payer.email) body.set("customer_email", ctx.payer.email);
    try {
      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => null)) as { id?: string; url?: string; error?: { message?: string } } | null;
      if (!res.ok || !json?.id || !json.url) {
        return { ok: false, reason: "gateway_error", detail: `stripe ${res.status}: ${(json?.error?.message ?? "").slice(0, 200)}` };
      }
      return { ok: true, providerRef: json.id, checkoutUrl: json.url };
    } catch (e) {
      return { ok: false, reason: "network", detail: e instanceof Error ? e.message : String(e) };
    }
  },

  async verifyWebhook(rawBody, headers) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return { valid: false, reason: "not_configured" };
    if (!(await verifyStripeSignature(rawBody, headers.get("stripe-signature"), secret))) return { valid: false, reason: "bad_signature" };
    let ev: StripeEvent;
    try { ev = JSON.parse(rawBody) as StripeEvent; } catch { return { valid: false, reason: "bad_payload" }; }
    if (!ev?.type) return { valid: false, reason: "bad_payload", payload: ev };
    return { valid: true, verdicts: [stripeVerdict(ev)], payload: ev };
  },
};
