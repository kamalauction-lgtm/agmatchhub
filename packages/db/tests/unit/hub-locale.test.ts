import { describe, it, expect } from "vitest";
import { allowedLocalesForCountry, resolveLocale } from "../../../../apps/hub/src/i18n/locale-rules";

/**
 * Market language defaults for the hub (owner directive, 10 Nov 2026):
 * Indonesia → Bahasa Indonesia default, English alternative;
 * Malaysia  → English default, Bahasa Melayu alternative.
 */
describe("hub locale rules", () => {
  describe("Indonesia", () => {
    it("defaults a new agent to Bahasa Indonesia", () => {
      expect(resolveLocale({ countryCode: "ID" })).toBe("id");
    });
    it("offers exactly Indonesian then English", () => {
      expect(allowedLocalesForCountry("ID")).toEqual(["id", "en"]);
    });
    it("honours an English choice from the switcher", () => {
      expect(resolveLocale({ countryCode: "ID", cookie: "en" })).toBe("en");
    });
    it("ignores a Malay cookie left from another market", () => {
      expect(resolveLocale({ countryCode: "ID", cookie: "ms" })).toBe("id");
    });
    it("uses the saved preference when there is no cookie", () => {
      expect(resolveLocale({ countryCode: "ID", preferred: "en" })).toBe("en");
    });
  });

  describe("Malaysia", () => {
    it("defaults a new agent to English", () => {
      expect(resolveLocale({ countryCode: "MY" })).toBe("en");
    });
    it("offers exactly English then Bahasa Melayu", () => {
      expect(allowedLocalesForCountry("MY")).toEqual(["en", "ms"]);
    });
    it("honours a Bahasa Melayu choice", () => {
      expect(resolveLocale({ countryCode: "MY", cookie: "ms" })).toBe("ms");
      expect(resolveLocale({ countryCode: "MY", preferred: "ms" })).toBe("ms");
    });
    it("ignores an Indonesian cookie or preference", () => {
      expect(resolveLocale({ countryCode: "MY", cookie: "id" })).toBe("en");
      expect(resolveLocale({ countryCode: "MY", preferred: "id" })).toBe("en");
    });
  });

  describe("precedence and fallbacks", () => {
    it("an explicitly requested locale wins (Content Studio follows the listing language)", () => {
      expect(resolveLocale({ countryCode: "MY", cookie: "ms", requested: "id" })).toBe("id");
    });
    it("cookie beats saved preference", () => {
      expect(resolveLocale({ countryCode: "MY", cookie: "ms", preferred: "en" })).toBe("ms");
    });
    it("signed out or unknown market: English, all languages offered", () => {
      expect(resolveLocale({})).toBe("en");
      expect(allowedLocalesForCountry(null)).toEqual(["en", "ms", "id"]);
      expect(resolveLocale({ countryCode: "SG", cookie: "id" })).toBe("id");
    });
    it("garbage input never escapes the locale set", () => {
      expect(resolveLocale({ countryCode: "ID", cookie: "fr", preferred: "xx", requested: "zz" })).toBe("id");
    });
  });
});
