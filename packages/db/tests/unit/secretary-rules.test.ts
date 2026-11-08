import { describe, it, expect } from "vitest";
import { ruleReply, firstNameOf } from "../../../../apps/hub/src/lib/ai/secretary-rules";

/**
 * The Secretary's floor. What matters: the enquirer's language, their first
 * name only, the listing's own price, no invented terms, a signature.
 */
const base = {
  channel: "whatsapp" as const,
  firstName: "Siti",
  agentName: "Dewi",
  listingTitle: "Rumah 3KT Cilandak",
  priceText: "Rp2,75 miliar",
  negotiable: true,
};

describe("ruleReply()", () => {
  it("writes Indonesian, greets by first name, quotes the price for a price question", () => {
    const d = ruleReply({ ...base, locale: "id", inquiryType: "price_question" });
    expect(d.reply).toMatch(/^Halo Siti,/);
    expect(d.reply).toContain("Rp2,75 miliar");
    expect(d.reply).toContain("masih bisa nego");
    expect(d.reply).toMatch(/Dewi$/);
    expect(d.questions).toHaveLength(2);
  });

  it("writes English and Malay for the other markets", () => {
    expect(ruleReply({ ...base, locale: "en", inquiryType: "viewing_request" }).reply).toContain("arrange a viewing");
    expect(ruleReply({ ...base, locale: "ms", inquiryType: "availability" }).reply).toContain("ketersediaan");
  });

  it("never mentions a price it was not given, and copes with no name", () => {
    const d = ruleReply({ ...base, locale: "en", inquiryType: "price_question", priceText: null, firstName: null });
    expect(d.reply).toMatch(/^Hello,/);
    expect(d.reply).not.toMatch(/Rp|RM|\$/);
  });

  it("falls back to Indonesian for an unknown locale", () => {
    expect(ruleReply({ ...base, locale: "xx", inquiryType: "general" }).reply).toContain("terima kasih");
  });
});

describe("firstNameOf()", () => {
  it("takes the first token only", () => {
    expect(firstNameOf("Siti Rahma Binti Ahmad")).toBe("Siti");
    expect(firstNameOf("  ")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});
