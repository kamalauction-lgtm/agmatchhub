import { describe, it, expect } from "vitest";
import { hmacHex } from "../../../../apps/hub/src/lib/payments/crypto";
import {
  verifyMetaSignature, verificationChallenge, parseWebhook, e164, templateComponents, renderTemplate,
} from "../../../../apps/hub/src/lib/whatsapp/webhook";

/** E12 — the pure half of the Meta webhook: handshake, signature, payload shape, helpers. */

const sample = {
  object: "whatsapp_business_account",
  entry: [{ id: "WABA1", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "60193918000", phone_number_id: "111222333" },
    contacts: [{ profile: { name: "Siti" }, wa_id: "6281200009901" }],
    messages: [
      { from: "6281200009901", id: "wamid.AAA", timestamp: "1762560000", type: "text", text: { body: "Boleh viewing Sabtu?" } },
      { from: "6281200009901", id: "wamid.BBB", timestamp: "1762560010", type: "image", image: { id: "m1", mime_type: "image/jpeg", caption: "ini rumahnya?" } },
      { from: "6281200009901", id: "wamid.CCC", timestamp: "1762560020", type: "reaction", reaction: { message_id: "wamid.X", emoji: "👍" } },
    ],
  } }] }],
};
const statusSample = {
  object: "whatsapp_business_account",
  entry: [{ id: "WABA1", changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "111222333" },
    statuses: [
      { id: "wamid.OUT1", status: "delivered", timestamp: "1762560100", recipient_id: "6281200009901", conversation: { id: "conv1", origin: { type: "service" } }, pricing: { billable: true, category: "service" } },
      { id: "wamid.OUT2", status: "failed", timestamp: "1762560200", recipient_id: "60123", errors: [{ code: 131026, title: "Message undeliverable" }] },
    ],
  } }, { field: "account_update", value: {} }] }],
};

describe("Meta signature + handshake", () => {
  it("accepts sha256= of the raw body with the app secret, rejects anything else", async () => {
    const body = JSON.stringify(sample);
    const good = `sha256=${await hmacHex("SHA-256", "app-secret", body)}`;
    expect(await verifyMetaSignature(body, good, "app-secret")).toBe(true);
    expect(await verifyMetaSignature(body + " ", good, "app-secret")).toBe(false);
    expect(await verifyMetaSignature(body, good, "other")).toBe(false);
    expect(await verifyMetaSignature(body, good.slice(7), "app-secret")).toBe(false);   // no prefix
    expect(await verifyMetaSignature(body, null, "app-secret")).toBe(false);
  });
  it("echoes the challenge only for subscribe + the right token", () => {
    const q = (s: string) => new URLSearchParams(s);
    expect(verificationChallenge(q("hub.mode=subscribe&hub.verify_token=tok&hub.challenge=12345"), "tok")).toBe("12345");
    expect(verificationChallenge(q("hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345"), "tok")).toBeNull();
    expect(verificationChallenge(q("hub.mode=unsubscribe&hub.verify_token=tok&hub.challenge=1"), "tok")).toBeNull();
    expect(verificationChallenge(q("hub.mode=subscribe&hub.verify_token=tok&hub.challenge=1"), undefined)).toBeNull();
  });
});

describe("parseWebhook()", () => {
  it("reads messages with the phone number id, kind, body/caption and sender name", () => {
    const p = parseWebhook(sample)!;
    expect(p.messages).toHaveLength(3);
    expect(p.messages[0]).toMatchObject({ phoneNumberId: "111222333", from: "6281200009901", waMessageId: "wamid.AAA", kind: "text", body: "Boleh viewing Sabtu?", profileName: "Siti", timestamp: "2025-11-08T00:00:00.000Z" });
    expect(p.messages[1]).toMatchObject({ kind: "media", mediaType: "image", body: "ini rumahnya?" });
    expect(p.messages[2]).toMatchObject({ kind: "reaction", body: "👍" });
    expect(p.statuses).toHaveLength(0);
  });
  it("reads statuses with pricing, conversation and the first error; counts other fields", () => {
    const p = parseWebhook(statusSample)!;
    expect(p.statuses[0]).toMatchObject({ waMessageId: "wamid.OUT1", status: "delivered", pricingCategory: "service", conversationId: "conv1", error: null });
    expect(p.statuses[1]).toMatchObject({ status: "failed", error: "131026 Message undeliverable" });
    expect(p.other).toBe(1);
  });
  it("rejects anything that is not a WhatsApp business account event", () => {
    expect(parseWebhook({ object: "page", entry: [] })).toBeNull();
    expect(parseWebhook("x")).toBeNull();
    expect(parseWebhook(null)).toBeNull();
  });
});

describe("helpers", () => {
  it("e164 adds the plus Meta omits", () => {
    expect(e164("6281200009901")).toBe("+6281200009901");
    expect(e164("+60 12-345 6789")).toBe("+60123456789");
  });
  it("template components and preview", () => {
    expect(templateComponents([])).toEqual([]);
    expect(templateComponents(["Siti", "Sabtu"])).toEqual([{ type: "body", parameters: [{ type: "text", text: "Siti" }, { type: "text", text: "Sabtu" }] }]);
    expect(renderTemplate("Hi {{1}}, viewing {{2}} on {{3}}.", ["Siti", "Rumah A"])).toBe("Hi Siti, viewing Rumah A on {{3}}.");
  });
});
