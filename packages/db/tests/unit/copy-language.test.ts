import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { copyLanguage } from "../../../../apps/hub/src/lib/ai/copy-language";
import {
  writeTitles, writeDescription, writeWhatsappBroadcast, writeSocialCaption, suggestHashtags,
  type WriterInput, type StudioInput,
} from "../../../../apps/hub/src/lib/ai/listing-writer";
import { WRITER_CASES, STUDIO_CASES } from "../fixtures/writer-cases";

/**
 * P0-d-1c: generated listing copy follows the listing's stored language, in
 * the listing's currency and size unit.
 *
 *   · Indonesian output is byte-for-byte what it was (golden file generated
 *     from the writer before this change);
 *   · English listings get English copy;
 *   · Malay listings get English copy, flagged as a fallback, until reviewed
 *     Malay phrases exist — the stored language is untouched;
 *   · MYR / IDR and sq ft / m² come from the listing, never assumed.
 */

const golden = JSON.parse(readFileSync(new URL("../fixtures/writer-golden.json", import.meta.url), "utf8")) as {
  writer: { titles: string[]; description: string }[];
  studio: { whatsapp: string; caption: string; tags: string[] }[];
};

// Words that only the Indonesian writer uses. None may appear in English copy.
const INDONESIAN = /\b(Dijual|DIJUAL|Disewakan|DISEWAKAN|Kamar Tidur|Kamar Mandi|SPESIFIKASI|HARGA|LOKASI|HUBUNGI|Berlokasi|Sertifikat|Dibangun|siap huni|miliar|juta|nego\b)/;

const my: WriterInput = {
  listingType: "sale", propertyTypeLabel: "Terrace house", province: "Selangor", regency: "Petaling", area: "Kota Damansara",
  bedrooms: 4, bathrooms: 3, parking: 2, floors: 2, buildingSize: 2200, landSize: 1650, price: 980000,
  ownership: "freehold", furnishing: "partially", condition: "good", currency: "MYR", sizeUnit: "sqft", language: "en",
};

describe("copyLanguage()", () => {
  it("follows the stored language; Malay is English for now and flagged", () => {
    expect(copyLanguage("id")).toEqual({ lang: "id", stored: "id", fallback: false });
    expect(copyLanguage("en")).toEqual({ lang: "en", stored: "en", fallback: false });
    expect(copyLanguage("ms")).toEqual({ lang: "en", stored: "ms", fallback: true });
    expect(copyLanguage(null)).toEqual({ lang: "id", stored: "id", fallback: false });
    expect(copyLanguage("fr")).toEqual({ lang: "id", stored: "fr", fallback: true });
  });
});

describe("Indonesian output is unchanged", () => {
  it("titles and descriptions match the pre-change writer exactly", () => {
    WRITER_CASES.forEach((c, n) => {
      expect(writeTitles(c), `case ${n}`).toEqual(golden.writer[n].titles);
      expect(writeDescription(c), `case ${n}`).toBe(golden.writer[n].description);
    });
  });
  it("Studio WhatsApp, caption and hashtags match too (Indonesian and existing English)", () => {
    STUDIO_CASES.forEach((c, n) => {
      expect(writeWhatsappBroadcast(c as StudioInput), `case ${n}`).toBe(golden.studio[n].whatsapp);
      expect(writeSocialCaption(c as StudioInput), `case ${n}`).toBe(golden.studio[n].caption);
      expect(suggestHashtags(c as StudioInput), `case ${n}`).toEqual(golden.studio[n].tags);
    });
  });
});

describe("English listing copy", () => {
  it("an English Malaysian listing: English, RM, sq ft, tenure", () => {
    const d = writeDescription(my);
    expect(d).toContain("🏡 FOR SALE: TERRACE HOUSE 4BR IN KOTA DAMANSARA, PETALING");
    expect(d).toContain("📋 SPECIFICATIONS");
    expect(d).toContain("• 🛏️ 4 bedrooms");
    expect(d).toContain("📐 Land 1,650 sq ft / built-up 2,200 sq ft");
    expect(d).toContain("📜 Freehold");
    expect(d).toMatch(/💰 PRICE\n• RM\s?980,000 \(negotiable for serious offers\)/);
    expect(d).toContain("📱 CONTACT ME");
    expect(d).not.toMatch(INDONESIAN);
    expect(d).not.toMatch(/m²|Rp/);
    for (const t of writeTitles(my)) {
      expect(t).not.toMatch(INDONESIAN);
      expect(t).not.toMatch(/undefined|null|NaN/);
    }
    expect(writeTitles(my)[0]).toBe("For sale: Terrace house 4BR in Kota Damansara");
  });

  it("claims 'move-in ready' only when the agent's fields say so", () => {
    expect(writeTitles(my).join(" ")).not.toContain("move-in ready");
    expect(writeDescription(my)).not.toContain("Move-in ready");
    const ready = { ...my, condition: "excellent" };
    expect(writeTitles(ready)[0]).toContain("move-in ready");
    expect(writeDescription(ready)).toContain("Move-in ready");
  });

  it("an English Indonesian listing keeps rupiah and m²", () => {
    const d = writeDescription({ ...WRITER_CASES[0], language: "en", propertyTypeLabel: "House" });
    expect(d).toContain("Rp3,8 miliar"); // rupiah keeps its own form, even in English copy
    expect(d).toContain("📐 Land 220 m² / built-up 150 m²");
    expect(d).toContain("FOR SALE: HOUSE 3BR IN PONDOK INDAH");
    expect(d).not.toMatch(/Kamar Tidur|SPESIFIKASI|HUBUNGI/);
  });

  it("rent: monthly and yearly periods in English", () => {
    const m = writeDescription({ ...my, listingType: "rent", rentPeriod: "monthly", price: 4500 });
    expect(m).toMatch(/RM\s?4,500 \/ month/);
    const y = writeDescription({ ...my, listingType: "rent", rentPeriod: "yearly", price: 54000 });
    expect(y).toMatch(/RM\s?54,000 \/ year/);
    expect(y).toContain("Viewing slots are still open this week.");
  });
});

describe("Malay listings: English fallback", () => {
  it("a Malay listing gets the same English copy as an English one — never Indonesian", () => {
    const ms = { ...my, language: "ms" };
    expect(writeDescription(ms)).toBe(writeDescription(my));
    expect(writeTitles(ms)).toEqual(writeTitles(my));
    expect(writeDescription(ms)).not.toMatch(INDONESIAN);
  });

  it("Studio copy for a Malay listing is English with RM and sq ft", () => {
    const studio: StudioInput = { ...my, language: "ms", title: "Terrace house in Kota Damansara", url: null, propertyTypeSlug: "terrace" };
    const w = writeWhatsappBroadcast(studio);
    const c = writeSocialCaption(studio);
    expect(w).toMatch(/RM\s?980,000 \(negotiable\)/);
    expect(w).toContain("sq ft");
    expect(w).toContain("📜 Freehold");
    expect(w).not.toMatch(/m²|Rp|KT|KM\b/);
    expect(c).toContain("📋 DETAILS");
    expect(c).not.toContain("📋 DETAIL\n");
    expect(c).toMatch(/RM\s?980,000 \(negotiable for serious offers\)/);
  });
});

describe("currency and unit come from the listing", () => {
  it("IDR without a stored currency, MYR when stored", () => {
    expect(writeDescription({ ...my, currency: undefined, language: "id", price: 2_150_000_000 })).toContain("Rp2,15 miliar");
    expect(writeDescription({ ...my, currency: "MYR", language: "id" })).toMatch(/RM\s?980,000/);
  });
  it("sq ft in Indonesian copy for a sq ft listing, m² otherwise", () => {
    expect(writeDescription({ ...my, language: "id" })).toContain("LT 1650 sq ft / LB 2200 sq ft");
    expect(writeDescription({ ...my, language: "id", sizeUnit: "sqm" })).toContain("LT 1650 m² / LB 2200 m²");
  });
});

describe("what the AI layer is asked for (the normal draft entry point builds this)", () => {
  it("a Malaysian English listing: English locale, RM, sq ft — never sqm or IDR", async () => {
    const { buildListingCopyRequest } = await import("../../../../apps/hub/src/lib/ai/listing-copy-request");
    const req = buildListingCopyRequest(my, { n: 4, medianPrice: 1_050_000, medianPerSqm: 470 });
    expect(req.locale).toBe("en");
    expect(req.copy).toEqual({ lang: "en", stored: "en", fallback: false });
    const f = req.payload.fields as Record<string, unknown>;
    expect(f).toMatchObject({ size_unit: "sqft", currency: "MYR", land_size: 1650, building_size: 2200, price: 980000 });
    expect(Object.keys(f).some((k) => k.includes("sqm"))).toBe(false);
    expect(req.payload.comparables).toMatchObject({ currency: "MYR", size_unit: "sqft", median_price_per_size_unit: 470 });
    expect((req.payload.deterministic_draft as { description: string }).description).not.toMatch(INDONESIAN);
  });

  it("a Malay listing asks the model for English, and says it is a fallback", async () => {
    const { buildListingCopyRequest } = await import("../../../../apps/hub/src/lib/ai/listing-copy-request");
    const req = buildListingCopyRequest({ ...my, language: "ms" }, null);
    expect(req.locale).toBe("en");
    expect(req.copy).toEqual({ lang: "en", stored: "ms", fallback: true });
  });

  it("an Indonesian listing: Indonesian locale, IDR, sqm, unchanged floor draft", async () => {
    const { buildListingCopyRequest } = await import("../../../../apps/hub/src/lib/ai/listing-copy-request");
    const req = buildListingCopyRequest(WRITER_CASES[0], null);
    expect(req.locale).toBe("id");
    expect(req.payload.fields).toMatchObject({ size_unit: "sqm", currency: "IDR" });
    expect(req.description).toBe(golden.writer[0].description);
  });

  it("the default prompt writes in the requested language and quotes the given unit and currency", async () => {
    const { defaultPrompt } = await import("../../../../apps/hub/src/lib/ai/prompts");
    expect(defaultPrompt("listing_copy", "en")!.system).toContain("Write in English");
    expect(defaultPrompt("listing_copy", "id")!.system).toContain("Write in Bahasa Indonesia");
    for (const f of ["listing_copy", "studio_copy"]) {
      expect(defaultPrompt(f, "en")!.template).toMatch(/size_unit .*sqft = square feet.*currency.*never converted/);
    }
  });
});
