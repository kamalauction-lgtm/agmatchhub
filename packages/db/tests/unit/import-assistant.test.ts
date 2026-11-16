import { describe, it, expect } from "vitest";
import { buildAssistantInput, parseAssistantOutput, ruleSuggestions, canUseImportAssistant, redact } from "../../../../apps/hub/src/lib/ai/import-assistant-rules";

/**
 * Screen 12: the Import Assistant contract, tested with fixtures and no
 * provider (apps/hub/src/lib/ai/import-assistant-rules.ts).
 */
const ID_ITEM = { extracted: { title: "Dijual Rumah 2 Lantai di Bintaro", description: "Rumah 4 KT 3 KM, SHM. Hubungi Pak Budi Santoso 0812-3456-7890 atau budi@example.com", price: 2150000000 } };
const MY_ITEM = { extracted: { title: "Double storey terrace, Puchong — for rent", description: "4 bedrooms 3 bathrooms, fully furnished. WhatsApp Encik Ahmad +6012 345 6789" }, overrides: { bedrooms: 4 } };

describe("input", () => {
  it("removes phone numbers, emails and names, keeps the listing facts", () => {
    const i = buildAssistantInput(ID_ITEM, "ID");
    expect(i.description).not.toMatch(/0812|example\.com|Budi|Santoso/);
    expect(i.description).toMatch(/\[phone\]/);
    expect(i.description).toMatch(/\[email\]/);
    expect(i.description).toMatch(/4 KT 3 KM/);
    expect(i.known).toEqual({ price: 2150000000 });
    expect(i.allowedPropertyTypes).toContain("rumah");
    expect(i.allowedPropertyTypes).not.toContain("terrace");
  });

  it("overrides win over extracted values", () => {
    expect(buildAssistantInput(MY_ITEM, "MY").known).toEqual({ bedrooms: 4 });
  });

  it("redaction covers Malaysian forms too", () => {
    expect(redact("WhatsApp Encik Ahmad +6012 345 6789")).toBe("WhatsApp [name] [phone]");
  });
});

describe("output", () => {
  it("keeps only valid, quoted suggestions in the agent's market", () => {
    const out = parseAssistantOutput(JSON.stringify({ suggestions: [
      { field: "propertyType", value: "terrace", quote: "Double storey terrace" },
      { field: "propertyType", value: "rumah", quote: "Rumah" },            // not a MY type: dropped
      { field: "listingType", value: "lease", quote: "for lease" },          // not sale/rent: dropped
      { field: "listingType", value: "rent", quote: "for rent" },
      { field: "bedrooms", value: 400, quote: "400 rooms" },                // out of range: dropped
      { field: "bathrooms", value: 3, quote: "" },                          // no quote: dropped
      { field: "bathrooms", value: 3, quote: "3 bathrooms" },
      { field: "price", value: 1, quote: "RM1" },                           // field not allowed: dropped
      { field: "propertyType", value: "bungalow", quote: "second guess" },  // duplicate field: first wins
    ] }), "MY");
    expect(out).toEqual([
      { field: "propertyType", value: "terrace", quote: "Double storey terrace" },
      { field: "listingType", value: "rent", quote: "for rent" },
      { field: "bathrooms", value: 3, quote: "3 bathrooms" },
    ]);
  });

  it("garbage in, nothing out", () => {
    expect(parseAssistantOutput("not json", "ID")).toEqual([]);
    expect(parseAssistantOutput({ answer: "rumah" }, "ID")).toEqual([]);
  });

  it("a quote that leaks contact details is redacted", () => {
    expect(parseAssistantOutput({ suggestions: [{ field: "bedrooms", value: 3, quote: "3 bed, call 0812 3456 7890" }] }, "ID")[0].quote).toBe("3 bed, call [phone]");
  });
});

describe("rules (no provider)", () => {
  it("suggests type, sale or rent and rooms from Indonesian text", () => {
    const s = ruleSuggestions(ID_ITEM, "ID");
    expect(s.map((x) => [x.field, x.value])).toEqual([["propertyType", "rumah"], ["listingType", "sale"], ["bedrooms", 4], ["bathrooms", 3]]);
    expect(s.every((x) => !/0812|Budi/.test(x.quote))).toBe(true);
  });

  it("does not repeat what the item already says (MY, bedrooms overridden)", () => {
    const s = ruleSuggestions(MY_ITEM, "MY");
    expect(s.map((x) => [x.field, x.value])).toEqual([["propertyType", "terrace"], ["listingType", "rent"], ["bathrooms", 3]]);
  });
});

describe("permission", () => {
  const base = { userId: "admin", batchAgentId: "agent", batchIsAssisted: true, agentInControl: false, adminCanImportFor: true };
  it("the agent on their own batch, always", () => {
    expect(canUseImportAssistant({ ...base, userId: "agent", adminCanImportFor: false, agentInControl: true })).toBe(true);
  });
  it("the team only on an assisted batch it may import for, before the agent takes control", () => {
    expect(canUseImportAssistant(base)).toBe(true);
    expect(canUseImportAssistant({ ...base, agentInControl: true })).toBe(false);
    expect(canUseImportAssistant({ ...base, adminCanImportFor: false })).toBe(false);
    expect(canUseImportAssistant({ ...base, batchIsAssisted: false })).toBe(false);
  });
  it("another agent never", () => {
    expect(canUseImportAssistant({ ...base, userId: "other-agent", adminCanImportFor: false })).toBe(false);
  });
});
