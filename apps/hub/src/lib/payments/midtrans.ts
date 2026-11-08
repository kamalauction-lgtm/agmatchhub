import { digestHex, timingSafeEqual, base64 } from "./crypto";
import { type PaymentAdapter, type ProviderMode, type WebhookVerdict } from "./types";

/**
 * Midtrans (Indonesia, QRIS + bank virtual accounts) — Snap.
 *
 *   create       POST {host}/snap/v1/transactions  Basic <server key>:
 *                { transaction_details: { order_id, gross_amount }, customer_details,
 *                  enabled_payments, callbacks: { finish }, expiry }
 *                → { token, redirect_url }
 *   notification POST JSON to the URL set in the Midtrans dashboard
 *                (Settings → Configuration → Payment Notification URL):
 *                signature_key = SHA-512(order_id + status_code + gross_amount + ServerKey)
 *
 * Hosts: sandbox app.sandbox.midtrans.com · live app.midtrans.com. A sandbox
 * server key starts `SB-Mid-server-`, a live one `Mid-server-`; the adapter
 * refuses a key whose prefix disagrees with the provider row's mode.
 *
 * Env: MIDTRANS_SERVER_KEY. order_id = our intent id (Midtrans echoes it back,
 * which is how the notification finds the row).
 */

const HOST: Record<ProviderMode, string> = {
  sandbox: "https://app.sandbox.midtrans.com",
  live: "https://app.midtrans.com",
};

export function midtransKeyMatchesMode(serverKey: string, mode: ProviderMode): boolean {
  return mode === "sandbox" ? serverKey.startsWith("SB-Mid-server-") : serverKey.startsWith("Mid-server-");
}

export async function midtransSignature(orderId: string, statusCode: string, grossAmount: string, serverKey: string): Promise<string> {
  return digestHex("SHA-512", `${orderId}${statusCode}${grossAmount}${serverKey}`);
}

export type MidtransNotification = {
  order_id?: string; status_code?: string; gross_amount?: string; signature_key?: string;
  transaction_status?: string; fraud_status?: string; transaction_id?: string; payment_type?: string;
  settlement_time?: string; transaction_time?: string; currency?: string;
};

/** Pure: verify one notification against the server key. */
export async function verifyMidtransSignature(n: MidtransNotification, serverKey: string): Promise<boolean> {
  if (!n.order_id || !n.status_code || !n.gross_amount || !n.signature_key) return false;
  const expected = await midtransSignature(n.order_id, n.status_code, n.gross_amount, serverKey);
  return timingSafeEqual(expected, n.signature_key.toLowerCase());
}

/** Pure: transaction_status (+ fraud_status) → our verdict, per Midtrans's status table. */
export function midtransVerdict(n: MidtransNotification): WebhookVerdict {
  const ts = n.transaction_status ?? "";
  const fraud = n.fraud_status ?? "accept";
  let status: WebhookVerdict["status"] = "ignored";
  if ((ts === "settlement" || ts === "capture") && fraud === "accept") status = "paid";
  else if (ts === "deny" || (ts === "capture" && fraud === "deny")) status = "failed";
  else if (ts === "expire") status = "expired";
  else if (ts === "cancel") status = "cancelled";
  else if (ts === "refund" || ts === "partial_refund") status = "refunded";
  // 'pending' and 'authorize' are not final: ignored, the row stays pending.
  return {
    eventId: n.transaction_id ? `${n.transaction_id}:${ts}:${fraud}` : null,
    eventType: `transaction.${ts || "unknown"}`,
    intentId: n.order_id ?? null,
    providerRef: n.transaction_id ?? null,
    status,
    amount: n.gross_amount ? Number(n.gross_amount) : null,
    currency: n.currency ?? "IDR",
    paidAt: n.settlement_time ? new Date(n.settlement_time.replace(" ", "T") + "+07:00").toISOString() : null,
  };
}

const ENABLED_PAYMENTS = ["qris", "bca_va", "bni_va", "bri_va", "permata_va", "other_va", "gopay", "shopeepay"];

export const midtrans: PaymentAdapter = {
  key: "midtrans",
  configured: (mode) => {
    const k = process.env.MIDTRANS_SERVER_KEY;
    return !!k && midtransKeyMatchesMode(k, mode);
  },

  async createCheckout(intent, ctx) {
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) return { ok: false, reason: "not_configured" };
    if (!midtransKeyMatchesMode(serverKey, intent.mode)) return { ok: false, reason: "mode_mismatch", detail: `key prefix does not match mode ${intent.mode}` };
    const [first, ...rest] = (ctx.payer.name ?? "Agent").split(" ");
    const payload = {
      transaction_details: { order_id: intent.id, gross_amount: Math.round(Number(intent.amount)) },
      customer_details: { first_name: first, last_name: rest.join(" ") || undefined, email: ctx.payer.email ?? undefined, phone: ctx.payer.phone ?? undefined },
      item_details: [{ id: intent.kind, price: Math.round(Number(intent.amount)), quantity: 1, name: ctx.description.slice(0, 50) }],
      enabled_payments: ENABLED_PAYMENTS,
      callbacks: { finish: ctx.returnUrl },
      expiry: { unit: "hours", duration: 24 },
    };
    try {
      const res = await fetch(`${HOST[intent.mode]}/snap/v1/transactions`, {
        method: "POST",
        headers: { authorization: `Basic ${base64(`${serverKey}:`)}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => null)) as { token?: string; redirect_url?: string; error_messages?: string[] } | null;
      if (!res.ok || !json?.token || !json.redirect_url) {
        return { ok: false, reason: "gateway_error", detail: `midtrans ${res.status}: ${(json?.error_messages ?? []).join("; ").slice(0, 200)}` };
      }
      return { ok: true, providerRef: json.token, checkoutUrl: json.redirect_url };
    } catch (e) {
      return { ok: false, reason: "network", detail: e instanceof Error ? e.message : String(e) };
    }
  },

  async verifyWebhook(rawBody) {
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) return { valid: false, reason: "not_configured" };
    let n: MidtransNotification;
    try { n = JSON.parse(rawBody) as MidtransNotification; } catch { return { valid: false, reason: "bad_payload" }; }
    if (!n || typeof n !== "object" || !n.order_id) return { valid: false, reason: "bad_payload", payload: n };
    if (!(await verifyMidtransSignature(n, serverKey))) return { valid: false, reason: "bad_signature", payload: n };
    return { valid: true, verdicts: [midtransVerdict(n)], payload: n };
  },
};
