import { describe, it, expect } from "vitest";
import { hmacHex, digestHex, timingSafeEqual } from "../../../../apps/hub/src/lib/payments/crypto";
import { billplzSignatureSource, verifyBillplzSignature, billplzVerdict } from "../../../../apps/hub/src/lib/payments/billplz";
import { midtransSignature, verifyMidtransSignature, midtransVerdict, midtransKeyMatchesMode } from "../../../../apps/hub/src/lib/payments/midtrans";
import { verifyStripeSignature, parseStripeSignatureHeader, stripeVerdict, stripeKeyMatchesMode } from "../../../../apps/hub/src/lib/payments/stripe";
import { minorUnits, fromMinorUnits } from "../../../../apps/hub/src/lib/payments/types";

/**
 * E11 — the pure half of each adapter: signature schemes, status mapping,
 * mode/key discipline, minor units. No gateway is called. The schemes are the
 * published ones (Billplz X Signature, Midtrans SHA-512 signature_key, Stripe
 * t/v1 HMAC) and are checked here against vectors computed from their
 * definitions; a real sandbox round-trip waits for the owner's sandbox keys.
 */

describe("crypto primitives", () => {
  it("HMAC-SHA256 and SHA-512 match known vectors", async () => {
    // RFC 4231 test case 2
    expect(await hmacHex("SHA-256", "Jefe", "what do ya want for nothing?"))
      .toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
    expect(await digestHex("SHA-512", "abc")).toMatch(/^ddaf35a193617aba/);
  });
  it("timingSafeEqual compares whole strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
  });
  it("minor units per currency", () => {
    expect(minorUnits("39.00", "MYR")).toBe(3900);
    expect(minorUnits(349000, "IDR")).toBe(349000);
    expect(minorUnits("10", "USD")).toBe(1000);
    expect(fromMinorUnits(3900, "MYR")).toBe(39);
    expect(fromMinorUnits(349000, "IDR")).toBe(349000);
  });
});

describe("Billplz callback signature", () => {
  const fields = { id: "W_79pJDk", collection_id: "inbmmepb", paid: "true", state: "paid", amount: "3900", paid_amount: "3900",
    due_at: "2026-11-08", email: "a@b.test", mobile: "", name: "Agent", url: "https://www.billplz-sandbox.com/bills/W_79pJDk",
    paid_at: "2026-11-08 10:00:00 +0800", reference_1: "11111111-1111-1111-1111-111111111111" };
  it("source string is sorted key+value joined by |, without x_signature", () => {
    const src = billplzSignatureSource({ ...fields, x_signature: "zzz" });
    expect(src.startsWith("amount3900|collection_idinbmmepb|")).toBe(true);
    expect(src.includes("x_signature")).toBe(false);
  });
  it("accepts the right signature and rejects a tampered amount", async () => {
    const key = "S-test-xsig";
    const x = await hmacHex("SHA-256", key, billplzSignatureSource(fields));
    expect(await verifyBillplzSignature({ ...fields, x_signature: x }, key)).toBe(true);
    expect(await verifyBillplzSignature({ ...fields, paid_amount: "100", x_signature: x }, key)).toBe(false);
    expect(await verifyBillplzSignature(fields, key)).toBe(false); // no signature at all
  });
  it("maps a paid bill to our verdict with the amount in ringgit and our intent id", () => {
    const v = billplzVerdict(fields);
    expect(v).toMatchObject({ status: "paid", amount: 39, currency: "MYR", intentId: fields.reference_1, providerRef: "W_79pJDk" });
    expect(billplzVerdict({ ...fields, paid: "false", state: "due" }).status).toBe("ignored");
  });
});

describe("Midtrans notification", () => {
  const serverKey = "SB-Mid-server-selftest";
  const n = { order_id: "22222222-2222-2222-2222-222222222222", status_code: "200", gross_amount: "349000.00", transaction_status: "settlement",
    fraud_status: "accept", transaction_id: "tx-1", settlement_time: "2026-11-08 10:00:00", currency: "IDR" };
  it("signature_key = sha512(order_id + status_code + gross_amount + server key)", async () => {
    const sig = await midtransSignature(n.order_id, n.status_code, n.gross_amount, serverKey);
    expect(sig).toBe(await digestHex("SHA-512", `${n.order_id}200349000.00${serverKey}`));
    expect(await verifyMidtransSignature({ ...n, signature_key: sig }, serverKey)).toBe(true);
    expect(await verifyMidtransSignature({ ...n, gross_amount: "1.00", signature_key: sig }, serverKey)).toBe(false);
    expect(await verifyMidtransSignature({ ...n, signature_key: sig }, "Mid-server-other")).toBe(false);
  });
  it("status table → verdict", () => {
    expect(midtransVerdict(n)).toMatchObject({ status: "paid", amount: 349000, currency: "IDR", intentId: n.order_id });
    expect(midtransVerdict({ ...n, transaction_status: "capture", fraud_status: "challenge" }).status).toBe("ignored");
    expect(midtransVerdict({ ...n, transaction_status: "pending" }).status).toBe("ignored");
    expect(midtransVerdict({ ...n, transaction_status: "deny" }).status).toBe("failed");
    expect(midtransVerdict({ ...n, transaction_status: "expire" }).status).toBe("expired");
    expect(midtransVerdict({ ...n, transaction_status: "refund" }).status).toBe("refunded");
  });
  it("a sandbox key never serves a live row and vice versa", () => {
    expect(midtransKeyMatchesMode("SB-Mid-server-x", "sandbox")).toBe(true);
    expect(midtransKeyMatchesMode("SB-Mid-server-x", "live")).toBe(false);
    expect(midtransKeyMatchesMode("Mid-server-x", "live")).toBe(true);
    expect(midtransKeyMatchesMode("Mid-server-x", "sandbox")).toBe(false);
  });
});

describe("Stripe webhook signature", () => {
  const secret = "whsec_selftest";
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", created: 1_800_000_000,
    data: { object: { id: "cs_test_1", client_reference_id: "33333333-3333-3333-3333-333333333333", amount_total: 1000, currency: "usd", payment_status: "paid" } } });
  const sign = async (t: number, b = body) => `t=${t},v1=${await hmacHex("SHA-256", secret, `${t}.${b}`)}`;

  it("parses the header, verifies within tolerance, rejects outside it or with a changed body", async () => {
    const t = 1_800_000_000;
    const header = await sign(t);
    expect(parseStripeSignatureHeader(header)).toMatchObject({ t });
    expect(await verifyStripeSignature(body, header, secret, t + 10)).toBe(true);
    expect(await verifyStripeSignature(body, header, secret, t + 301)).toBe(false);          // replay window
    expect(await verifyStripeSignature(body + " ", header, secret, t + 10)).toBe(false);     // exact bytes
    expect(await verifyStripeSignature(body, header, "whsec_other", t + 10)).toBe(false);
    expect(await verifyStripeSignature(body, null, secret, t)).toBe(false);
  });
  it("accepts any of several v1 signatures (secret rotation)", async () => {
    const t = 1_800_000_000;
    const good = (await sign(t)).split("v1=")[1];
    expect(await verifyStripeSignature(body, `t=${t},v1=deadbeef,v1=${good}`, secret, t)).toBe(true);
  });
  it("event → verdict in dollars with our intent id", () => {
    const v = stripeVerdict(JSON.parse(body));
    expect(v).toMatchObject({ status: "paid", amount: 10, currency: "USD", intentId: "33333333-3333-3333-3333-333333333333", providerRef: "cs_test_1", eventId: "evt_1" });
    expect(stripeVerdict({ type: "checkout.session.expired", data: { object: { id: "cs_2" } } }).status).toBe("expired");
    expect(stripeVerdict({ type: "payment_intent.created" }).status).toBe("ignored");
  });
  it("test keys only under sandbox, live keys only under live", () => {
    expect(stripeKeyMatchesMode("sk_test_x", "sandbox")).toBe(true);
    expect(stripeKeyMatchesMode("sk_live_x", "sandbox")).toBe(false);
    expect(stripeKeyMatchesMode("sk_live_x", "live")).toBe(true);
  });
});
