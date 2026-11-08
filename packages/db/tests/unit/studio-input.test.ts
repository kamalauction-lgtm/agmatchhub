import { describe, it, expect } from "vitest";
import { buildStudioInput, copyLocaleFor } from "../../../../apps/hub/src/lib/studio/input";
import type { StudioListing } from "../../../../apps/hub/src/lib/studio/listings";

/**
 * The one mapping both the deterministic Studio drafts and the AI Marketing
 * Studio read from. If a field is dropped here, the model is asked to write
 * about a property it was not told about — and would fill the gap.
 */
const listing: StudioListing = {
  id: "l1", human_readable_id: "LST-2026-000001", slug: "x", listing_type: "sale", currency: "IDR", price: 2_750_000_000,
  rent_period: null, price_negotiable: true, language: "id", title: "Rumah 3KT Cilandak",
  property_category: "residential", property_type: "rumah", ownership_type: "shm", general_address: "Cilandak Barat",
  building_name: null, province_name: "DKI Jakarta", regency_name: "Jakarta Selatan", district_name: "Cilandak",
  land_size: 180, building_size: 165, bedrooms: 3, bathrooms: 2, floors: 2, parking_spaces: 2, year_built: 2019,
  furnishing: "partially", property_condition: "good", facilities: ["taman", "carport"], published_at: null,
  cover_image_path: null, agent_display_name: "Dewi", borrowed: false, share_url: "https://www.example.test/properti/x",
};

describe("buildStudioInput()", () => {
  it("carries every fact the writers and the model need", () => {
    const i = buildStudioInput(listing, (slug) => `label:${slug}`);
    expect(i.propertyTypeLabel).toBe("label:rumah");
    expect(i.propertyTypeSlug).toBe("rumah");
    expect(i.area).toBe("Cilandak");                 // district wins over the general address
    expect(i.landSize).toBe(180);
    expect(i.buildingSize).toBe(165);
    expect(i.facilities).toEqual(["taman", "carport"]);
    expect(i.price).toBe(2_750_000_000);
    expect(i.negotiable).toBe(true);
    expect(i.url).toBe(listing.share_url);
    expect(i.language).toBe("id");
  });

  it("falls back to the general address when there is no district", () => {
    expect(buildStudioInput({ ...listing, district_name: null }, (s) => s).area).toBe("Cilandak Barat");
  });
});

describe("copyLocaleFor()", () => {
  it("follows the listing language and narrows unknowns to Indonesian", () => {
    expect(copyLocaleFor({ language: "en" })).toBe("en");
    expect(copyLocaleFor({ language: "ms" })).toBe("ms");
    expect(copyLocaleFor({ language: "id" })).toBe("id");
    expect(copyLocaleFor({ language: "fr" })).toBe("id");
  });
});
