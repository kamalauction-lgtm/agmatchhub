import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { __extractForTest } from "../../../../apps/hub/src/lib/import/adapters";

/**
 * Portal extraction, against the real markup of a real Rumah123 listing.
 *
 * The fixture is that page's actual `<title>`, OpenGraph tags and JSON-LD
 * blocks, captured verbatim. Hand-written markup would only prove the parser
 * agrees with itself.
 *
 * WHY THIS FILE EXISTS: the first live import produced a listing with a title
 * and nothing else — no price, no type, no location — while the page plainly
 * published all of it. Four causes, each with a test below:
 *
 *   1. the property hangs off the page node as `mainEntity`, which was never
 *      followed
 *   2. the outer node's name carries the " | Rumah123" site suffix
 *   3. `RealEstateAgent` contains "realestate", so the agent's node matched the
 *      property filter and their avatar was imported as a photo
 *   4. images are `ImageObject.contentUrl`, and only `.url` was read
 */

const html = readFileSync(join(__dirname, "..", "fixtures", "rumah123-listing.html"), "utf8");
const URL_ =
  "https://www.rumah123.com/properti/jakarta-selatan-kebayoran-baru/american-classic-style-brand-new-dekat-mrt-senayan-dan-blok-m-hos18516197/";

const draft = __extractForTest(html, URL_);

describe("Rumah123 listing — the fields the review screen showed empty", () => {
  it("reads the price", () => {
    expect(draft.price).toBe(22_000_000_000);
    expect(draft.currency).toBe("IDR");
  });

  it("reads sale vs rent from businessFunction, not from guessing at the title", () => {
    // Nothing in this title or URL says "dijual". The old keyword guess found
    // nothing and left it blank; goodrelations `#Sell` says it outright.
    expect(draft.listingType).toBe("sale");
  });

  it("reads the property type from schema.org's own classification", () => {
    // @type is ["SingleFamilyResidence","Product"].
    expect(draft.propertyType).toBe("rumah");
  });

  it("reads the location", () => {
    expect(draft.city).toBe("Kebayoran Baru, Jakarta Selatan");
    expect(draft.province).toBe("DKI Jakarta");
  });

  it("reads the room counts", () => {
    expect(draft.bedrooms).toBe(3);
    expect(draft.bathrooms).toBe(4);
  });

  it("reads the floor size", () => {
    expect(draft.buildingSize).toBe(429);
  });

  it("takes the portal's own listing id", () => {
    expect(draft.sourceExternalId).toBe("hos18516197");
  });
});

describe("the title", () => {
  it("drops the site suffix the page node carries", () => {
    expect(draft.title).toBe("American Classic Style Brand New Dekat MRT Senayan dan Blok M");
    expect(draft.title).not.toMatch(/Rumah123/);
  });

  it("keeps the description the page states", () => {
    expect(draft.description).toMatch(/AMERICAN CLASSIC STYLE/);
  });
});

describe("images", () => {
  it("takes the property photographs, via contentUrl", () => {
    expect(draft.imageUrls?.length).toBeGreaterThan(0);
    expect(draft.imageUrls?.some((u) => /picture\.rumah123\.com/.test(u))).toBe(true);
  });

  it("does not import the agent's profile photo as a property photo", () => {
    // The agent avatar lives on the Person/RealEstateAgent node.
    expect(draft.imageUrls?.some((u) => /\/photo\/\d+\/\d+\//.test(u))).toBe(false);
  });

  it("does not import the generated share card with the price burned into it", () => {
    expect(draft.imageUrls?.some((u) => /image\/og|og\/ldp/.test(u))).toBe(false);
  });
});

describe("nothing is invented", () => {
  it("leaves land size empty — the structured data does not state it", () => {
    // The description says "Luas Tanah : 200 m²", but parsing free text is
    // guessing. The same paragraph says "Kamar Tidur 3 + 2", which is not 3
    // and not 5. The agent fills this in.
    expect(draft.landSize).toBeUndefined();
  });

  it("leaves a street address empty when only the locality is published", () => {
    expect(draft.addressText).toBeUndefined();
  });
});

describe("a page with no listing data yields nothing rather than a husk", () => {
  it("returns no fields for an empty document", () => {
    const empty = __extractForTest("<html><head></head><body>nope</body></html>", "https://example.com/x");
    expect(empty.price).toBeUndefined();
    expect(empty.title).toBeUndefined();
  });

  it("ignores a page whose only structured data is an organisation", () => {
    const orgOnly = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Organization","name":"Some Agency","image":"https://x.test/logo.png"}
    </script></head><body></body></html>`;
    const d = __extractForTest(orgOnly, "https://example.com/x");
    expect(d.title).toBeUndefined();
    expect(d.imageUrls).toBeUndefined();
  });
});
