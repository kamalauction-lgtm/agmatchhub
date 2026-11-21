import { describe, it, expect } from "vitest";
import { cleanPosition, cleanText, parseRooms, reviewListing } from "../../../../apps/hub/src/lib/international/ingest-plan";

const ok = {
  title: "Riverside Tower",
  countryCode: "ID",
  currency: "IDR",
  priceMin: 650_000_000,
  priceMax: 986_150_000,
  listingType: "sale" as const,
  photoCount: 3,
  perUsd: 16_500,
};

describe("cleanText", () => {
  it("turns source placeholders into null", () => {
    for (const v of ["N/A", "n/a", "NA", "-", "", "  ", null, undefined, "TBC"]) expect(cleanText(v)).toBeNull();
  });
  it("keeps and tidies real text", () => {
    expect(cleanText("  Kuala   Lumpur ")).toBe("Kuala Lumpur");
    expect(cleanText("National Park")).toBe("National Park");
  });
});

describe("parseRooms", () => {
  it("reads plain counts and ranges", () => {
    expect(parseRooms("2")).toEqual({ min: 2, max: 2, label: null });
    expect(parseRooms("2 - 3")).toEqual({ min: 2, max: 3, label: null });
  });
  it("keeps the source wording when extra rooms are stated", () => {
    expect(parseRooms("2 - 6+2")).toEqual({ min: 2, max: 6, label: "2 - 6+2" });
    expect(parseRooms("3+1 - 4+1")).toEqual({ min: 3, max: 4, label: "3+1 - 4+1" });
  });
  it("ignores a missing end and nonsense", () => {
    expect(parseRooms("2 - N/A")).toEqual({ min: 2, max: 2, label: null });
    expect(parseRooms("N/A")).toEqual({ min: null, max: null, label: null });
    expect(parseRooms("many")).toEqual({ min: null, max: null, label: null });
    expect(parseRooms("21 - N/A")).toEqual({ min: null, max: null, label: null });
  });
});

describe("cleanPosition", () => {
  it("accepts a real position", () => {
    expect(cleanPosition("3.1629197", 101.741996)).toEqual({ latitude: 3.16292, longitude: 101.741996 });
  });
  it("refuses half a position, out-of-range values and 0,0", () => {
    expect(cleanPosition(3.1, null)).toBeNull();
    expect(cleanPosition(91, 10)).toBeNull();
    expect(cleanPosition(10, 181)).toBeNull();
    expect(cleanPosition(0, 0)).toBeNull();
    expect(cleanPosition("N/A", "N/A")).toBeNull();
  });
});

describe("reviewListing", () => {
  it("publishes a row with nothing doubtful", () => {
    expect(reviewListing(ok)).toEqual({ status: "published", flags: [] });
  });
  it("holds the price seen in the source: a maximum of 665 against a minimum of 395 million", () => {
    const r = reviewListing({ ...ok, priceMin: 395_000_000, priceMax: 665 });
    expect(r.status).toBe("draft");
    expect(r.flags).toContain("price_range");
  });
  it("holds a sale price that cannot be real in dollars", () => {
    expect(reviewListing({ ...ok, priceMin: 665, priceMax: null }).flags).toContain("price_implausible");
  });
  it("holds a range so wide a digit was probably dropped", () => {
    expect(reviewListing({ ...ok, priceMin: 395_000, priceMax: 665_000_000 }).flags).toContain("price_implausible");
  });
  it("does not judge the dollar value without a rate, or for rent", () => {
    expect(reviewListing({ ...ok, priceMin: 665, priceMax: null, perUsd: null }).status).toBe("published");
    expect(reviewListing({ ...ok, priceMin: 8_000_000, priceMax: null, listingType: "rent" }).status).toBe("published");
  });
  it("holds missing price, photos, title, country and currency, and names each", () => {
    const r = reviewListing({ ...ok, title: " ", countryCode: "Malaysia", currency: "rm", priceMin: null, priceMax: 0, photoCount: 0 });
    expect(r.status).toBe("draft");
    expect(r.flags).toEqual(["title_missing", "country_invalid", "currency_invalid", "price_missing", "no_photos"]);
  });
});
