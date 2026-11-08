import { describe, it, expect } from "vitest";
import { ruleQualify } from "../../../../apps/hub/src/lib/ai/qualifier-rules";

/** The intent floor: a sort key with a sentence, bounded 1–5, in the agent's language. */
describe("ruleQualify()", () => {
  it("scores a viewing request that talks money and timing at the top", () => {
    const q = ruleQualify({ message: "Bisa survey akhir pekan ini? Harga masih bisa nego?", inquiryType: "viewing_request", locale: "id" });
    expect(q.intent).toBe(5);
    expect(q.signals).toEqual(expect.arrayContaining(["asks_viewing", "asks_price", "mentions_timing"]));
    expect(q.reason).toMatch(/^Pertanyaan /);
    expect(q.suggestedAction).toContain("survey");
  });

  it("keeps a bare general question low, and a terse one lower", () => {
    expect(ruleQualify({ message: "Info?", inquiryType: "general", locale: "en" }).intent).toBe(1);
    expect(ruleQualify({ message: null, inquiryType: "general", locale: "en" }).intent).toBe(2);
  });

  it("never leaves the 1–5 range and writes the reason in the asked language", () => {
    const en = ruleQualify({ message: "Can I view this week? Budget is 3bn cash, when is it available?", inquiryType: "price_question", locale: "en" });
    expect(en.intent).toBe(5);
    expect(en.reason).toMatch(/^Enquiry /);
    const ms = ruleQualify({ message: "Boleh lawat hujung minggu ini?", inquiryType: "availability", locale: "ms" });
    expect(ms.intent).toBeGreaterThanOrEqual(4);
    expect(ms.reason).toMatch(/^Pertanyaan /);
  });
});
