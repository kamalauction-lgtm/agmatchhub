import { describe, it, expect } from "vitest";
import { normalisePropertyType, convertSize, inferCountry, applyCountryDefaults, PLATFORM_TYPES } from "../../../../apps/hub/src/lib/ingest/normalise";

describe("ingest normalisation per country (E10)", () => {
  it("maps Hero's vocabulary to each country's own keys — never across", () => {
    expect(normalisePropertyType("ID", "terrace_house")).toEqual({ propertyType: "rumah", category: "residential" });
    expect(normalisePropertyType("MY", "terrace_house")).toEqual({ propertyType: "terrace", category: "residential" });
    expect(normalisePropertyType("ID", "shop_lot")).toEqual({ propertyType: "ruko", category: "commercial" });
    expect(normalisePropertyType("MY", "shop_lot")).toEqual({ propertyType: "shoplot", category: "commercial" });
    expect(normalisePropertyType("MY", "serviced_apartment").propertyType).toBe("serviced_residence");
    expect(normalisePropertyType("MY", "condominium").propertyType).toBe("condominium");
    expect(normalisePropertyType("ID", "condominium").propertyType).toBe("kondominium");
  });

  it("accepts a platform key of the same country, and falls back to lainnya otherwise", () => {
    expect(normalisePropertyType("MY", "SOHO").propertyType).toBe("soho");
    expect(normalisePropertyType("ID", "kost").propertyType).toBe("kost");
    // An Indonesian key sent for a Malaysian agent is not a Malaysian product.
    expect(normalisePropertyType("MY", "ruko").propertyType).toBe("lainnya");
    expect(normalisePropertyType("ID", "shoplot").propertyType).toBe("lainnya");
    expect(normalisePropertyType("MY", "spaceship")).toEqual({ propertyType: "lainnya", category: "other" });
  });

  it("every mapped key is one the check constraint allows", () => {
    for (const c of ["ID", "MY"] as const) {
      for (const sent of ["terrace_house", "apartment", "shop_lot", "office", "warehouse", "residential_land", "other", "hotel", "villa"]) {
        expect(PLATFORM_TYPES[c].has(normalisePropertyType(c, sent).propertyType)).toBe(true);
      }
    }
  });

  it("converts sizes into the country's unit and rounds to 2 dp", () => {
    expect(convertSize(100, "sqm", "sqft")).toBe(1076.39);
    expect(convertSize(1076.39, "sqft", "sqm")).toBe(100);
    expect(convertSize(85.5, "sqm", "sqm")).toBe(85.5);
    expect(convertSize(null, "sqm", "sqft")).toBeNull();
  });

  it("infers the country from the currency only when the sender said nothing", () => {
    expect(inferCountry("MYR")).toBe("MY");
    expect(inferCountry("IDR")).toBe("ID");
    expect(inferCountry("USD")).toBe("ID");
    expect(inferCountry(null, "MY")).toBe("MY");
  });

  it("fills currency and language from the country row, never from a constant", () => {
    const my = { default_currency: "MYR", default_language: "ms", measurement_unit: "sqft" as const };
    expect(applyCountryDefaults({}, my)).toEqual({ currency: "MYR", language: "ms" });
    expect(applyCountryDefaults({ currency: "USD", language: "en" }, my)).toEqual({ currency: "USD", language: "en" });
  });
});
