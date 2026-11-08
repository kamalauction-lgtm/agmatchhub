import { hmacHex, timingSafeEqual, base64 } from "./crypto";
import { minorUnits, fromMinorUnits, type PaymentAdapter, type ProviderMode, type WebhookVerdict } from "./types";

/**
 * Billplz (Malaysia, FPX) — API v3.
 *
 *   create bill   POST {host}/api/v3/bills   Basic <api key>:
 *                 collection_id, email, name, amount (sen), callback_url,
 *                 redirect_url, description, reference_1_label/reference_1
 *   callback      POST form-encoded to callback_url; `x_signature` is
 *                 HMAC-SHA256 over the other fields, each as `key` + value,
 *                 sorted by key, joined with `|`, keyed with the X Signature Key
 *                 from the Billplz account settings. (Redirect query params are
 *                 the same scheme with a `billplz` prefix; we settle only from
 *                 the callback, never from the browser redirect.)
 *
 * Hosts: sandbox www.billplz-sandbox.com · live www.billplz.com. The same env
 * names serve both; the provider row's mode picks the host, so a sandbox key
 * can never be sent to the live host by configuration drift.
 *
 * Env: BILLPLZ_API_KEY, BILLPLZ_COLLECTION_ID, BILLPLZ_X_SIGNATURE_KEY.
 */

const HOST: Record<ProviderMode, string> = {
  sandbox: "https://www.billplz-sandbox.com",
  live: "https://www.billplz.com",
};

export function billplzSignatureSource(fields: Record<string, string>): string {
  return Object.keys(fields)
    .filter((k) => k !== "x_signature")
    .sort()
    .map((k) => `${k}${fields[k]}`)
    .join("|");
}

/** Pure: verify a callback body (already parsed to a flat record) against the key. */
export async function verifyBillplzSignature(fields: Record<string, string>, xSignatureKey: string): Promise<boolean> {
  const given = fields.x_signature;
  if (!given) return false;
  const expected = await hmacHex("SHA-256", xSignatureKey, billplzSignatureSource(fields));
  return timingSafeEqual(expected.toLowerCase(), given.toLowerCase());
}

/** Pure: the callback fields → our verdict. */
export function billplzVerdict(f: Record<string, string>): WebhookVerdict {
  const paid = f.paid === "true" || f.state === "paid";
  return {
    eventId: f.id ? `${f.id}:${f.paid ?? f.state ?? ""}` : null,
    eventType: paid ? "bill.paid" : `bill.${f.state ?? "unpaid"}`,
    intentId: f.reference_1 ?? null,
    providerRef: f.id ?? null,
    status: paid ? "paid" : f.state === "due" ? "ignored" : f.state === "deleted" ? "cancelled" : "ignored",
    amount: f.paid_amount ? fromMinorUnits(Number(f.paid_amount), "MYR") : f.amount ? fromMinorUnits(Number(f.amount), "MYR") : null,
    currency: "MYR",
    paidAt: f.paid_at ? new Date(f.paid_at).toISOString() : null,
  };
}

function parseForm(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
  return out;
}

export const billplz: PaymentAdapter = {
  key: "billplz",
  configured: () => !!(process.env.BILLPLZ_API_KEY && process.env.BILLPLZ_COLLECTION_ID && process.env.BILLPLZ_X_SIGNATURE_KEY),

  async createCheckout(intent, ctx) {
    if (!this.configured(intent.mode)) return { ok: false, reason: "not_configured" };
    const body = new URLSearchParams({
      collection_id: process.env.BILLPLZ_COLLECTION_ID!,
      email: ctx.payer.email ?? "",
      name: ctx.payer.name ?? "Agent",
      amount: String(minorUnits(intent.amount, intent.currency)),
      callback_url: ctx.webhookUrl,
      redirect_url: ctx.returnUrl,
      description: ctx.description.slice(0, 200),
      reference_1_label: "intent",
      reference_1: intent.id,
    });
    if (ctx.payer.phone) body.set("mobile", ctx.payer.phone);
    try {
      const res = await fetch(`${HOST[intent.mode]}/api/v3/bills`, {
        method: "POST",
        headers: { authorization: `Basic ${base64(`${process.env.BILLPLZ_API_KEY}:`)}`, "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => null)) as { id?: string; url?: string; error?: unknown } | null;
      if (!res.ok || !json?.id || !json.url) {
        return { ok: false, reason: "gateway_error", detail: `billplz ${res.status}: ${JSON.stringify(json?.error ?? json).slice(0, 200)}` };
      }
      return { ok: true, providerRef: json.id, checkoutUrl: json.url };
    } catch (e) {
      return { ok: false, reason: "network", detail: e instanceof Error ? e.message : String(e) };
    }
  },

  async verifyWebhook(rawBody) {
    const key = process.env.BILLPLZ_X_SIGNATURE_KEY;
    if (!key) return { valid: false, reason: "not_configured" };
    const fields = parseForm(rawBody);
    if (!fields.id) return { valid: false, reason: "bad_payload", payload: fields };
    if (!(await verifyBillplzSignature(fields, key))) return { valid: false, reason: "bad_signature", payload: fields };
    return { valid: true, verdicts: [billplzVerdict(fields)], payload: fields };
  },
};
