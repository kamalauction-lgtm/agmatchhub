/**
 * One billing system, three gateways (Decision 8, 7 Nov 2026).
 *
 * An adapter turns a `payment_intents` row into a checkout at its gateway and
 * turns the gateway's webhook back into a verdict the database understands.
 * Everything that is the SAME for every gateway — who may pay, for what, how
 * much, what a paid intent unlocks — lives in Postgres (00094), not here.
 *
 * Mode discipline: the provider row says `sandbox` or `live`; the adapter
 * refuses a key whose shape contradicts that (a live Stripe key under a
 * sandbox row, a sandbox Midtrans key under a live row). The two can never
 * silently cross.
 */

export type ProviderKey = "billplz" | "midtrans" | "stripe";
export type ProviderMode = "sandbox" | "live";

export type IntentForCheckout = {
  id: string;
  human_readable_id: string;
  user_id: string;
  provider_key: ProviderKey;
  mode: ProviderMode;
  kind: "subscription" | "topup";
  currency: string;
  amount: string;            // numeric from Postgres arrives as a string
  expires_at: string;
};

export type CheckoutContext = {
  /** Where the gateway sends the person afterwards (our /plan/payment/<id>). */
  returnUrl: string;
  /** Where the gateway POSTs the result (our /api/payments/webhook/<provider>). */
  webhookUrl: string;
  description: string;
  payer: { name: string | null; email: string | null; phone: string | null };
};

export type CheckoutResult =
  | { ok: true; providerRef: string; checkoutUrl: string }
  | { ok: false; reason: "not_configured" | "mode_mismatch" | "gateway_error" | "network"; detail?: string };

/** What a verified webhook says about ONE intent. */
export type WebhookVerdict = {
  /** The gateway's own id for this delivery, for idempotency; null when it has none. */
  eventId: string | null;
  eventType: string;
  /** How we find the intent: our id when the gateway echoes it, else its reference. */
  intentId: string | null;
  providerRef: string | null;
  status: "paid" | "failed" | "expired" | "cancelled" | "refunded" | "ignored";
  amount: number | null;
  currency: string | null;
  paidAt: string | null;
};

export type WebhookResult =
  | { valid: true; verdicts: WebhookVerdict[]; payload: unknown }
  | { valid: false; reason: "not_configured" | "bad_signature" | "bad_payload"; payload?: unknown };

export type PaymentAdapter = {
  key: ProviderKey;
  /** True when the Worker holds the secrets this adapter needs. Never reveals them. */
  configured(mode: ProviderMode): boolean;
  createCheckout(intent: IntentForCheckout, ctx: CheckoutContext): Promise<CheckoutResult>;
  /** Raw body + headers in, verdicts out. Must not throw on garbage. */
  verifyWebhook(rawBody: string, headers: Headers, mode: ProviderMode): Promise<WebhookResult>;
};

/** Smallest currency unit per currency: Stripe counts in these, Billplz too. */
export function minorUnits(amount: number | string, currency: string): number {
  const n = Number(amount);
  return currency === "IDR" ? Math.round(n) : Math.round(n * 100);
}
export function fromMinorUnits(minor: number, currency: string): number {
  return currency === "IDR" ? minor : Math.round(minor) / 100;
}
