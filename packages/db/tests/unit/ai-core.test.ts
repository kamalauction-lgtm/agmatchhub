import { describe, it, expect } from "vitest";
import { z } from "zod";
import { redact, parseJsonOutput, costMicros, canonical, sha256Hex, ProviderError } from "@pg/ai";

/**
 * The pure parts of the AI layer. No provider is called here; what is proven
 * is the contract every feature leans on: identifiers leave the building as
 * tokens, model text becomes a typed object or a classified failure, and cost
 * is arithmetic on the route's own prices.
 */

describe("redact()", () => {
  it("replaces Malaysian and Indonesian phone forms", () => {
    const { text, counts } = redact("Call me 012-345 6789 or +62 812 3456 7890, WhatsApp 0812-3456-7890.");
    expect(text).not.toMatch(/\d{3}[\s-]?\d{4}/);
    expect(counts.phone).toBe(3);
  });

  it("replaces e-mails, IC numbers, NIK and wa.me links", () => {
    const { text, counts } = redact(
      "siti@example.com · IC 900101-14-5678 · NIK 3171234567890001 · https://wa.me/60123456789",
    );
    expect(text).toContain("[email]");
    expect(text).toContain("[id-number]");
    expect(text).toContain("[whatsapp-link]");
    expect(text).not.toContain("example.com");
    expect(counts.email).toBe(1);
    expect(counts.my_ic).toBe(1);
    expect(counts.nik).toBe(1);
  });

  it("leaves prices, areas and years alone", () => {
    const src = "Rumah 3 kamar, 165 m2, dibangun 2019, harga Rp2.750.000.000, 12 min ke Citos.";
    const { text, counts } = redact(src);
    expect(text).toBe(src);
    expect(counts).toEqual({});
  });

  it("can keep e-mails when a feature needs them", () => {
    expect(redact("mail siti@example.com", { keepEmails: true }).text).toContain("siti@example.com");
  });
});

describe("parseJsonOutput()", () => {
  const schema = z.object({ intent: z.number().int().min(1).max(5), reason: z.string() });

  it("accepts plain JSON", () => {
    expect(parseJsonOutput('{"intent": 4, "reason": "asks for a viewing"}', schema)).toEqual({ intent: 4, reason: "asks for a viewing" });
  });

  it("unwraps a code fence and a leading sentence", () => {
    expect(parseJsonOutput('Here you go:\n```json\n{"intent":2,"reason":"browsing"}\n```', schema).intent).toBe(2);
  });

  it("classifies non-JSON and schema violations as bad_output", () => {
    for (const raw of ["not json at all", '{"intent": 9, "reason": "too high"}', '{"reason": "missing intent"}']) {
      let kind: string | null = null;
      try { parseJsonOutput(raw, schema); } catch (e) { kind = e instanceof ProviderError ? e.kind : "other"; }
      expect(kind).toBe("bad_output");
    }
  });
});

describe("costMicros()", () => {
  const route = { feature: "x", provider: "gemini" as const, model: "m", maxOutputTokens: 1, inputCostMicrosPer1k: 300, outputCostMicrosPer1k: 2500 };
  it("prices tokens per thousand from the route", () => {
    expect(costMicros(route, { tokensIn: 2000, tokensOut: 400 })).toBe(600 + 1000);
  });
  it("is zero until an admin enters prices", () => {
    expect(costMicros({ ...route, inputCostMicrosPer1k: 0, outputCostMicrosPer1k: 0 }, { tokensIn: 5000, tokensOut: 5000 })).toBe(0);
  });
});

describe("canonical() + sha256Hex()", () => {
  it("hashes equal inputs equally regardless of key order", async () => {
    const a = await sha256Hex(canonical({ b: 1, a: { d: 2, c: 3 } }));
    const b = await sha256Hex(canonical({ a: { c: 3, d: 2 }, b: 1 }));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
