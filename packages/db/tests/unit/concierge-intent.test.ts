import { describe, it, expect } from "vitest";
import { inferIntent, parseRequest } from "../../../../apps/www/src/lib/concierge-parse";

/**
 * A budget no rent reaches means "buy" (staging review, 10 Nov 2026: the
 * assistant offered a Rp4.5 million/month rental for a Rp2 billion budget).
 * Thresholds are the markets' own top rent rungs from config/market.ts.
 */
const ID_TOP_RENT = 500_000_000;   // Rp500 juta (yearly rents)
const MY_TOP_RENT = 10_000;        // RM10,000 a month
const places = [{ name: "Depok" }, { name: "Kuala Lumpur" }];

describe("concierge intent inference", () => {
  it("the owner's BM query becomes a purchase search", () => {
    const p = inferIntent(parseRequest("Saya cari rumah 3 bilik di Depok, bajet bawah Rp2 miliar.", places, "IDR"), ID_TOP_RENT);
    expect(p.type).toBe("sale");
    expect(p.typeInferred).toBe(true);
    expect(p.bedrooms).toBe(3);
    expect(p.maxPrice).toBe(2_000_000_000);
  });

  it("an explicit rent word always wins, whatever the budget", () => {
    const p = inferIntent(parseRequest("sewa rumah di Depok di bawah 2 miliar", places, "IDR"), ID_TOP_RENT);
    expect(p.type).toBe("rent");
    expect(p.typeInferred).toBeUndefined();
  });

  it("a budget inside rent range stays ambiguous (no constraint added)", () => {
    const p = inferIntent(parseRequest("apartemen di Depok di bawah 50 juta", places, "IDR"), ID_TOP_RENT);
    expect(p.type).toBeUndefined();
  });

  it("no budget, no inference", () => {
    expect(inferIntent(parseRequest("rumah di Depok", places, "IDR"), ID_TOP_RENT).type).toBeUndefined();
  });

  it("Malaysia uses its own rent rung", () => {
    expect(inferIntent(parseRequest("condo in Kuala Lumpur under RM 800k", places, "MYR"), MY_TOP_RENT).type).toBe("sale");
    expect(inferIntent(parseRequest("condo in Kuala Lumpur under RM 3000", places, "MYR"), MY_TOP_RENT).type).toBeUndefined();
  });
});
