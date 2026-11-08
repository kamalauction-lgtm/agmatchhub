import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Price, area and rent formatting in both markets.
 *
 * These are the numbers a buyer decides on. Getting the market wrong here does
 * not look like a bug — it looks like a cheap house: "RM1.25 mil" rendered as
 * "Rp1,25 miliar" is a believable string with a hundredfold error behind it,
 * and nothing on the page would flag it.
 *
 * The market is read from `NEXT_PUBLIC_MARKET` at module load, so each case
 * resets the module registry and re-imports rather than trying to mutate a
 * frozen const.
 */

async function load(marketCode: string) {
  vi.resetModules();
  process.env.NEXT_PUBLIC_MARKET = marketCode;
  return import("@/lib/format");
}

const ORIGINAL = process.env.NEXT_PUBLIC_MARKET;

beforeEach(() => vi.resetModules());
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_MARKET;
  else process.env.NEXT_PUBLIC_MARKET = ORIGINAL;
});

describe("market configuration", () => {
  it("rejects an unknown market loudly instead of defaulting", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_MARKET = "SG";
    await expect(import("@/config/market")).rejects.toThrow(/not a market/);
  });

  it("Malaysia is English-first and Indonesia is Indonesian-first", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_MARKET = "MY";
    const my = (await import("@/config/market")).market;
    expect(my.defaultLocale).toBe("en");
    expect(my.locales).toEqual(["en", "ms"]);
    expect(my.currency).toBe("MYR");
    expect(my.measurementUnit).toBe("sqft");

    vi.resetModules();
    process.env.NEXT_PUBLIC_MARKET = "ID";
    const id = (await import("@/config/market")).market;
    expect(id.defaultLocale).toBe("id");
    expect(id.currency).toBe("IDR");
    expect(id.measurementUnit).toBe("sqm");
  });
});

describe("exact price", () => {
  it("Malaysia prints ringgit with the symbol closed up", async () => {
    const { formatPriceExact } = await load("MY");
    const out = formatPriceExact(1_250_000, "MYR", "en");
    expect(out).toContain("RM");
    expect(out).toMatch(/^RM1,250,000$/);
  });

  it("Indonesia prints rupiah with dot grouping and no gap", async () => {
    const { formatPriceExact } = await load("ID");
    expect(formatPriceExact(2_150_000_000, "IDR", "id")).toBe("Rp2.150.000.000");
  });

  it("never leaves a space between symbol and figure in either market", async () => {
    for (const [code, currency, locale] of [
      ["MY", "MYR", "en"],
      ["MY", "MYR", "ms"],
      ["ID", "IDR", "id"],
      ["ID", "IDR", "en"],
    ] as const) {
      const { formatPriceExact } = await load(code);
      // Covers the ordinary space AND the non-breaking space Intl inserts for
      // some locales — the bug the old regex existed to paper over.
      expect(formatPriceExact(500_000, currency, locale)).not.toMatch(/[\s ]/);
    }
  });
});

describe("short price", () => {
  it("English-Malaysian abbreviates: mil, bil, k", async () => {
    const { formatPriceShort } = await load("MY");
    // Closed up, the way Malaysian portals print them.
    expect(formatPriceShort(1_250_000, "MYR", "en")).toBe("RM1.25mil");
    expect(formatPriceShort(950_000, "MYR", "en")).toBe("RM950k");
    expect(formatPriceShort(2_000_000_000, "MYR", "en")).toBe("RM2bil");
  });

  it("Malay spells the scale out and never says miliar", async () => {
    const { formatPriceShort } = await load("MY");
    const out = formatPriceShort(2_000_000_000, "MYR", "ms");
    expect(out).toBe("RM2 bilion");
    expect(out).not.toContain("miliar");
  });

  it("Indonesian keeps miliar and the comma decimal", async () => {
    const { formatPriceShort } = await load("ID");
    expect(formatPriceShort(2_150_000_000, "IDR", "id")).toBe("Rp2,15 miliar");
  });

  it("a price below the smallest unit falls back to the exact figure", async () => {
    const { formatPriceShort } = await load("MY");
    expect(formatPriceShort(800, "MYR", "en")).toBe("RM800");
  });
});

describe("area", () => {
  it("follows the LISTING's unit, not the market", async () => {
    /* A Malaysian build must render an imported square-metre figure as m².
     * Relabelling it sqft would misstate the size by a factor of about eleven,
     * and the number itself would look entirely plausible. */
    const { formatArea } = await load("MY");
    expect(formatArea(120, "sqm", "en")).toBe("120 m²");
    expect(formatArea(1_292, "sqft", "en")).toBe("1,292 sqft");
  });

  it("groups digits the way the locale does", async () => {
    const my = await load("MY");
    expect(my.formatArea(1_292, "sqft", "en")).toBe("1,292 sqft");
    const id = await load("ID");
    expect(id.formatArea(1_292, "sqft", "id")).toBe("1.292 sqft");
  });
});

describe("rent period", () => {
  it("is a word, so it follows the locale", async () => {
    const { formatRentPeriod } = await load("MY");
    expect(formatRentPeriod("monthly", "en")).toBe("/month");
    expect(formatRentPeriod("monthly", "ms")).toBe("/sebulan");
    expect(formatRentPeriod("yearly", "en")).toBe("/year");
  });

  it("an unknown period renders nothing rather than a guess", async () => {
    const { formatRentPeriod } = await load("MY");
    expect(formatRentPeriod(null, "en")).toBe("");
    expect(formatRentPeriod("weekly", "en")).toBe("");
  });
});
