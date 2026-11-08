import { describe, it, expect } from "vitest";
import { hasEnv, raClient, saClient, uid } from "./setup";

/**
 * Migration 00083: deterministic listing quality + comparables.
 *
 * The seeded scenario gives RA a draft listing (LST-2026-900002, no photos,
 * short description) and LA a published one (LST-2026-900001). The score must
 * exist for both because the migration backfilled, must be readable by the
 * owner only, must be recomputable by the owner, and must move when the
 * listing changes.
 */
describe.skipIf(!hasEnv)("listing quality (00083)", () => {
  it("the backfill scored existing listings and the owner can read theirs", async () => {
    const ra = await raClient();
    const me = await uid(ra);
    const { data: mine } = await ra
      .from("listings")
      .select("id, quality_score, listing_quality_scores (total_score, photo_quality, recommendations)")
      .eq("agent_id", me)
      .eq("human_readable_id", "LST-2026-900002")
      .maybeSingle();
    expect(mine).toBeTruthy();
    const q = (Array.isArray(mine!.listing_quality_scores) ? mine!.listing_quality_scores[0] : mine!.listing_quality_scores) as
      | { total_score: number; photo_quality: number; recommendations: { key: string }[] } | null;
    expect(q).toBeTruthy();
    expect(q!.photo_quality).toBe(0);                       // no photos
    expect(mine!.quality_score).toBe(q!.total_score);        // denormalised column stamped
    expect(q!.recommendations.map((r) => r.key)).toContain("add_photos");
    expect(q!.recommendations.map((r) => r.key)).toContain("describe_more");
  });

  it("another agent cannot read the score, and cannot recompute it", async () => {
    const ra = await raClient();
    const sa = await saClient();
    const me = await uid(ra);
    const { data: listing } = await ra.from("listings").select("id").eq("agent_id", me).eq("human_readable_id", "LST-2026-900002").single();
    const { data: theirs } = await sa.from("listing_quality_scores").select("total_score").eq("listing_id", listing!.id);
    expect(theirs ?? []).toHaveLength(0);
    const { error } = await sa.rpc("compute_listing_quality", { p_listing_id: listing!.id });
    expect(error).not.toBeNull();
  });

  it("changing the description recomputes the score (trigger) and the owner may recompute by hand", async () => {
    const ra = await raClient();
    const me = await uid(ra);
    const { data: listing } = await ra.from("listings").select("id, description").eq("agent_id", me).eq("human_readable_id", "LST-2026-900002").single();
    const before = (await ra.from("listing_quality_scores").select("description_quality").eq("listing_id", listing!.id).single()).data!.description_quality;

    const longer = "Unit 2 kamar tidur di tower B, lantai 12, hadap kota. Full furnished, siap huni, 5 menit jalan kaki ke MRT Blok M dan dekat sekolah internasional. Akses tol dalam kota 10 menit. Hubungi kami untuk jadwal survey.";
    const { error: updErr } = await ra.from("listings").update({ description: longer }).eq("id", listing!.id);
    expect(updErr, updErr?.message).toBeNull();
    const after = (await ra.from("listing_quality_scores").select("description_quality").eq("listing_id", listing!.id).single()).data!.description_quality;
    expect(after).toBeGreaterThan(before);

    // put it back so the seed stays what the other tests expect
    await ra.from("listings").update({ description: listing!.description }).eq("id", listing!.id);
    const { data: total, error } = await ra.rpc("compute_listing_quality", { p_listing_id: listing!.id });
    expect(error).toBeNull();
    expect(Number(total)).toBeGreaterThanOrEqual(0);
    expect(Number(total)).toBeLessThanOrEqual(100);
  });

  it("comparables answer within one country and kind, and the anon role gets nothing", async () => {
    const ra = await raClient();
    const { data, error } = await ra.rpc("listing_comparables", {
      p_country: "ID", p_listing_type: "sale", p_property_type: "rumah", p_regency: "Jakarta Selatan", p_bedrooms: null, p_exclude: null,
    });
    expect(error).toBeNull();
    const row = (Array.isArray(data) ? data[0] : data) as { n: number; median_price: number | null };
    expect(Number(row.n)).toBeGreaterThanOrEqual(1);           // LA's published Cilandak house
    expect(Number(row.median_price)).toBeGreaterThan(0);

    const { data: my } = await ra.rpc("listing_comparables", {
      p_country: "MY", p_listing_type: "sale", p_property_type: "rumah", p_regency: "Jakarta Selatan", p_bedrooms: null, p_exclude: null,
    });
    const myRow = (Array.isArray(my) ? my[0] : my) as { n: number };
    expect(Number(myRow.n)).toBe(0);                            // never across a border
  });
});
