import { describe, it, expect } from "vitest";
import { parseBudget, ruleRequirement } from "../../../../apps/hub/src/lib/ai/requirement-rules";
import { hamming, ruleCheckPhotos } from "../../../../apps/hub/src/lib/ai/photo-rules";
import { matchObjection, SCENARIOS, OBJECTIONS } from "../../../../apps/hub/src/lib/ai/coach-rules";
import { planWeek, weekDays } from "../../../../apps/hub/src/lib/ai/social-plan-rules";

/** 00098 — the deterministic floors of the roles that went live: pure, no model, no database. */

describe("Buyer Profile Builder rules", () => {
  it("reads local budget shorthand in both markets", () => {
    expect(parseBudget("budget 2 miliar nego", "IDR")).toEqual({ min: null, max: 2_000_000_000 });
    expect(parseBudget("max RM650k", "MYR")).toEqual({ min: null, max: 650_000 });
    expect(parseBudget("antara 500 jt dan 700 jt", "IDR")).toEqual({ min: 500_000_000, max: 700_000_000 });
    expect(parseBudget("around 1.5M", "MYR").max).toBe(1_500_000);
    // "2M" is two billion to an Indonesian, two million to a Malaysian.
    expect(parseBudget("sekitar 2M", "IDR").max).toBe(2_000_000_000);
    expect(parseBudget("no numbers here", "MYR")).toEqual({ min: null, max: null });
  });

  it("fills only what the chat says and lists what is missing", () => {
    const r = ruleRequirement("Cari rumah 3 kamar tidur 2 kamar mandi di Bintaro, budget 2 miliar, full furnished, masuk Januari", { country: "ID", currency: "IDR" });
    expect(r.transaction_type).toBe(null); // "cari" alone is not buy or rent
    expect(r.property_type).toBe("house");
    expect(r.property_category).toBe("residential");
    expect(r.bedrooms_min).toBe(3);
    expect(r.bathrooms_min).toBe(2);
    expect(r.budget_max).toBe(2_000_000_000);
    expect(r.furnishing).toBe("fully");
    expect(r.preferred_areas).toContain("Bintaro");
    expect(r.missing).toContain("transaction_type");
    expect(r.missing).not.toContain("budget");

    const rent = ruleRequirement("Looking to rent a 2BR condo in Mont Kiara, max RM4,500 per month", { country: "MY", currency: "MYR" });
    expect(rent.transaction_type).toBe("rent");
    expect(rent.max_monthly_rent).toBe(4500);
    expect(rent.budget_max).toBe(null);
    expect(rent.property_type).toBe("apartment");
    expect(rent.title).toMatch(/2BR/);
  });
});

describe("Photo Checker rules", () => {
  it("finds near-duplicate hashes, low resolution and tiny files; counts the cover", () => {
    expect(hamming("ff00ff00", "ff00ff00")).toBe(0);
    expect(hamming("ff00ff00", "ff00ff01")).toBe(1);
    expect(hamming("ff00", "ff00ff00")).toBe(Infinity);
    const r = ruleCheckPhotos([
      { id: "a", position: 0, is_cover: true, width: 1600, height: 1200, byte_size: 300_000, phash: "abcdef0123456789" },
      { id: "b", position: 1, is_cover: false, width: 1600, height: 1200, byte_size: 300_000, phash: "abcdef0123456788" }, // 1 bit away → duplicate of #1
      { id: "c", position: 2, is_cover: false, width: 640, height: 480, byte_size: 20_000, phash: "0000000000000000" },
    ]);
    expect(r.count).toBe(3);
    expect(r.hasCover).toBe(true);
    expect(r.tooFew).toBe(true);
    expect(r.flags.find((f) => f.id === "b")).toMatchObject({ index: 2, issues: ["duplicate"], duplicateOf: 1 });
    expect(r.flags.find((f) => f.id === "c")?.issues.sort()).toEqual(["low_res", "tiny_file"]);
    expect(r.flags.find((f) => f.id === "a")).toBeUndefined();
  });
});

describe("Coach library", () => {
  it("matches the common objections in three languages and carries complete entries", () => {
    expect(matchObjection("Honestly it's too expensive for this area")?.key).toBe("price_high");
    expect(matchObjection("Saya pikir-pikir dulu ya")?.key).toBe("think_about_it");
    expect(matchObjection("Saya dah ada ejen lain")?.key).toBe("other_agent");
    expect(matchObjection("I'll wait for prices to drop next year")?.key).toBe("wait_market");
    expect(matchObjection("the sky is blue")).toBeNull();
    for (const o of OBJECTIONS) for (const l of ["en", "id", "ms"] as const) {
      expect(o.meaning[l].length).toBeGreaterThan(20);
      expect(o.approaches[l]).toHaveLength(3);
      expect(o.sample[l].length).toBeGreaterThan(40);
      expect(o.followUp[l].length).toBeGreaterThan(5);
    }
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(6);
  });
});

describe("Social Calendar Planner rules", () => {
  it("plans seven days, rotating listings (photographed first) and platforms", () => {
    expect(weekDays("2026-11-16")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    const slots = planWeek(
      [
        { id: "x", title: "No photo", hasPhoto: false, publishedAt: "2026-11-10", caption: "cx" },
        { id: "y", title: "With photo", hasPhoto: true, publishedAt: "2026-11-01", caption: "cy" },
      ],
      ["instagram", "facebook"],
      "2026-11-16",
    );
    expect(slots).toHaveLength(7);
    expect(slots[0]).toMatchObject({ day: "2026-11-16", weekday: 0, platform: "instagram", listingId: "y", caption: "cy" });
    expect(slots[1]).toMatchObject({ platform: "facebook", listingId: "x" });
    expect(new Set(slots.map((s) => s.angle)).size).toBe(7);
    expect(planWeek([], ["facebook"], "2026-11-16")).toEqual([]);
  });
});
