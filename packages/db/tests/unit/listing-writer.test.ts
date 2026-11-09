import { describe, it, expect } from "vitest";
import { writeTitles, writeDescription, type WriterInput } from "../../../../apps/hub/src/lib/ai/listing-writer";

/**
 * The Listing Copywriter's deterministic floor. Structural checks only: the
 * writer must use the facts it was given and nothing else. Exact wording is
 * the writer's business and may change.
 */

const base: WriterInput = {
  listingType: "sale",
  propertyTypeLabel: "Rumah",
  province: "DKI Jakarta",
  regency: "Jakarta Selatan",
  area: "Pondok Indah",
  bedrooms: 3,
  bathrooms: 2,
  buildingSize: 150,
  landSize: 220,
  price: 3_800_000_000,
};

describe("writeTitles()", () => {
  it("returns at least one non-empty title that names the type and the place", () => {
    const titles = writeTitles(base);
    expect(titles.length).toBeGreaterThanOrEqual(1);
    for (const t of titles) {
      expect(t.trim().length).toBeGreaterThan(0);
      expect(t).not.toMatch(/undefined|null|NaN/);
    }
    expect(titles.join(" ")).toContain("Rumah");
    expect(titles.join(" ")).toContain("Pondok Indah");
  });

  it("uses the bedroom count only when one is given", () => {
    expect(writeTitles(base).join(" ")).toContain("3KT");
    expect(writeTitles({ ...base, bedrooms: null }).join(" ")).not.toMatch(/\dKT/);
  });
});

describe("writeDescription()", () => {
  it("writes a sale as DIJUAL and a rental as DISEWAKAN, from the given facts", () => {
    const sale = writeDescription(base);
    expect(sale).toContain("DIJUAL");
    // The headline is upper-cased by design, so match the type case-insensitively.
    expect(sale.toLowerCase()).toContain("rumah");
    expect(sale).not.toMatch(/undefined|null|NaN/);

    const rent = writeDescription({ ...base, listingType: "rent" });
    expect(rent).toContain("DISEWAKAN");
  });

  it("copes with the sparsest input without leaking placeholders", () => {
    const out = writeDescription({ listingType: "sale", propertyTypeLabel: "Tanah" });
    expect(out.trim().length).toBeGreaterThan(0);
    expect(out).not.toMatch(/undefined|null|NaN/);
    expect(out).not.toMatch(/\dKT/);
  });
});
