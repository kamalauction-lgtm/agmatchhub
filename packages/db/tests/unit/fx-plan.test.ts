import { describe, it, expect } from "vitest";
import { parseFeed, planRates, type RateRow } from "../../../../apps/hub/src/lib/international/fx-plan";

/**
 * The daily exchange-rate refresh (apps/hub/src/lib/international/fx-plan.ts).
 * A rupiah estimate from a broken feed is a false price on a public page, so
 * these are the ways the refresh must refuse to write.
 */

const prev = (currency: string, per_usd: number, source = "feed.example"): RateRow => ({ currency, per_usd, as_of: "2026-11-20", source });

describe("parseFeed", () => {
  it("reads the expected shape and upper-cases codes", () => {
    const f = parseFeed({ date: "2026-11-21", usd: { idr: 16500, aud: 1.5, usd: 1 } });
    expect(f).toEqual({ date: "2026-11-21", rates: { IDR: 16500, AUD: 1.5, USD: 1 } });
  });

  it("drops non-numbers, zero, negatives and non-currency keys", () => {
    const f = parseFeed({ date: "2026-11-21", usd: { idr: "16500", aud: 0, gbp: -1, eur: NaN, bitcoin: 1, jpy: 150 } });
    expect(f).toEqual({ date: "2026-11-21", rates: { JPY: 150 } });
  });

  it("refuses a wrong shape, a missing date, or a base that is not the dollar", () => {
    expect(parseFeed(null)).toBeNull();
    expect(parseFeed({ usd: { idr: 16500 } })).toBeNull();
    expect(parseFeed({ date: "21/11/2026", usd: { idr: 16500 } })).toBeNull();
    expect(parseFeed({ date: "2026-11-21", rates: { idr: 16500 } })).toBeNull();
    expect(parseFeed({ date: "2026-11-21", usd: { usd: 0.92, idr: 16500 } })).toBeNull();
    expect(parseFeed({ date: "2026-11-21", usd: {} })).toBeNull();
  });
});

describe("planRates", () => {
  const incoming = { date: "2026-11-21", rates: { IDR: 16600, AUD: 1.51, TRY: 50 } };
  const base = { incoming, source: "feed.example", today: "2026-11-21" };

  it("writes only wanted currencies, always including the dollar", () => {
    const p = planRates({ ...base, previous: [], wanted: ["idr", "AUD"] });
    expect(p.write.map((r) => r.currency).sort()).toEqual(["AUD", "IDR", "USD"]);
    expect(p.write.find((r) => r.currency === "USD")!.per_usd).toBe(1);
    expect(p.write.every((r) => r.as_of === "2026-11-21" && r.source === "feed.example")).toBe(true);
    expect(p.held).toEqual([]);
  });

  it("holds a currency the feed does not carry", () => {
    const p = planRates({ ...base, previous: [], wanted: ["IDR", "VND"] });
    expect(p.held).toEqual([{ currency: "VND", reason: "missing" }]);
    expect(p.write.map((r) => r.currency)).not.toContain("VND");
  });

  it("holds a rate that jumped more than a quarter against a real previous rate", () => {
    const p = planRates({ ...base, previous: [prev("IDR", 16500), prev("TRY", 34)], wanted: ["IDR", "TRY"] });
    expect(p.write.map((r) => r.currency)).toContain("IDR");
    expect(p.held).toEqual([{ currency: "TRY", reason: "jump", from: 34, to: 50 }]);
  });

  it("replaces a seed rate without the jump check", () => {
    const p = planRates({ ...base, previous: [prev("TRY", 34, "demo-seed")], wanted: ["TRY"], untrustedSources: ["demo-seed"] });
    expect(p.held).toEqual([]);
    expect(p.write.find((r) => r.currency === "TRY")!.per_usd).toBe(50);
  });

  it("accepts a move exactly at the limit and refuses one just over", () => {
    const at = planRates({ ...base, incoming: { date: "2026-11-21", rates: { AUD: 1.25 } }, previous: [prev("AUD", 1)], wanted: ["AUD"] });
    expect(at.held).toEqual([]);
    const over = planRates({ ...base, incoming: { date: "2026-11-21", rates: { AUD: 1.2501 } }, previous: [prev("AUD", 1)], wanted: ["AUD"] });
    expect(over.held[0]).toMatchObject({ currency: "AUD", reason: "jump" });
  });

  it("writes nothing from a feed that is stale or dated in the future", () => {
    const stale = planRates({ ...base, today: "2026-11-30", previous: [], wanted: ["IDR"] });
    expect(stale.write).toEqual([]);
    expect(stale.held.map((h) => h.reason)).toEqual(["invalid", "invalid"]);
    const future = planRates({ ...base, today: "2026-11-18", previous: [], wanted: ["IDR"] });
    expect(future.write).toEqual([]);
  });
});
