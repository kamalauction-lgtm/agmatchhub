import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient } from "./setup";

/**
 * Co-marketing pool: browse, pick up, and the confidences that must survive it
 * (migrations 00040, 00041, 00044, 00045).
 *
 * These need a MARKETING agent and a LISTING agent with a live open-pool offer
 * between them, which the other suites' RA/SA fixtures do not provide. Set
 * TEST_MA_* and TEST_LA_* to run them — the staging seed
 * (scripts/seed-staging-comarketing.mjs) creates exactly that pair. Without
 * them the block skips rather than passing vacuously.
 *
 * Every write below is expected to FAIL, in keeping with the suite's rule that
 * tests do not mutate the dataset. The successful pickup path is exercised
 * through the application against staging, not here.
 */

const MA_EMAIL = process.env.TEST_MA_EMAIL;
const MA_PASSWORD = process.env.TEST_MA_PASSWORD;
const LA_EMAIL = process.env.TEST_LA_EMAIL;
const LA_PASSWORD = process.env.TEST_LA_PASSWORD;

const hasPoolEnv = !!(URL_ && ANON && MA_EMAIL && MA_PASSWORD && LA_EMAIL && LA_PASSWORD);

async function signedIn(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`test sign-in failed for ${email}: ${error.message}`);
  return c;
}

describe.skipIf(!hasPoolEnv)("co-marketing pool (§4, module design §6.2)", () => {
  let ma: SupabaseClient;
  let la: SupabaseClient;
  let maId: string;
  let laId: string;
  /** An offer the MA has NOT picked up, so pickup rules can be exercised. */
  let freeOfferId: string | null = null;
  /** An offer the MA already holds. */
  let heldOfferId: string | null = null;

  beforeAll(async () => {
    ma = await signedIn(MA_EMAIL!, MA_PASSWORD!);
    la = await signedIn(LA_EMAIL!, LA_PASSWORD!);
    maId = (await ma.auth.getUser()).data.user!.id;
    laId = (await la.auth.getUser()).data.user!.id;

    const { data: held } = await ma
      .from("comarketing_engagements")
      .select("offer_id")
      .eq("marketing_agent_id", maId)
      .in("status", ["pending", "active", "paused"]);
    const heldIds = new Set((held ?? []).map((e) => e.offer_id as string));
    heldOfferId = [...heldIds][0] ?? null;

    const { data: offers } = await ma
      .from("comarketing_offers")
      .select("id, listing_agent_id")
      .eq("status", "active")
      .eq("scope", "open_pool");
    freeOfferId =
      (offers ?? []).find((o) => !heldIds.has(o.id) && o.listing_agent_id !== maId)?.id ?? null;
  });

  it("anon cannot read the pool at all", async () => {
    const anon = anonClient();
    const { data: offers } = await anon.from("comarketing_offers").select("id");
    expect(offers ?? []).toHaveLength(0);
    const { data: engagements } = await anon.from("comarketing_engagements").select("id");
    expect(engagements ?? []).toHaveLength(0);
  });

  it("a browsing agent sees the facts a pool card needs via pool_offer_cards (00099)", async () => {
    const { data } = await ma
      .from("pool_offer_cards")
      .select("offer_id, marketing_agent_share_pct, title, price, province_name")
      .limit(1);

    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
    const row = data![0] as unknown as { title: string; price: number };
    // The regression 00041 was written for, one audience earlier: rows present
    // but every field empty.
    expect(row.title).toBeTruthy();
    expect(Number(row.price)).toBeGreaterThan(0);
  });

  it("a browsing agent cannot read other agents' listing rows directly (00099)", async () => {
    // Pool browse on the base table was removed. A marketing agent may read
    // their own listings, and listings they hold a live engagement on (00041).
    // Any other agent's listing must not come back.
    const { data: held } = await ma
      .from("comarketing_engagements")
      .select("offer_id")
      .eq("marketing_agent_id", maId)
      .in("status", ["pending", "active", "paused"]);
    const heldOfferIds = (held ?? []).map((e) => e.offer_id as string);
    const { data: heldOffers } = heldOfferIds.length
      ? await ma.from("comarketing_offers").select("listing_id").in("id", heldOfferIds)
      : { data: [] as { listing_id: string }[] };
    const engagedListingIds = new Set((heldOffers ?? []).map((o) => o.listing_id as string));

    const { data } = await ma.from("listings").select("id, created_by").limit(50);
    for (const r of (data ?? []) as unknown as { id: string; created_by: string }[]) {
      expect(r.created_by === maId || engagedListingIds.has(r.id)).toBe(true);
    }
  });

  it("the pool projection never exposes listing moderation or ownership columns (00099)", async () => {
    const { data, error } = await ma
      .from("pool_offer_cards")
      .select("moderation_reason, created_by, agency_id, moderated_by")
      .limit(1);
    // PostgREST rejects an unknown column, so the select must fail outright.
    expect(error).not.toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("a browsing agent reads only offers they are engaged on, directly (00102)", async () => {
    // The table-level pool read was removed. Only engaged offers come back.
    const { data: held } = await ma
      .from("comarketing_engagements")
      .select("offer_id")
      .eq("marketing_agent_id", maId)
      .in("status", ["pending", "active", "paused"]);
    const heldIds = new Set((held ?? []).map((e) => e.offer_id as string));
    const { data } = await ma
      .from("comarketing_offers")
      .select("id, listing_agent_id")
      .limit(200);
    for (const r of (data ?? []) as { id: string; listing_agent_id: string }[]) {
      // The agent's own offers (as listing agent) are theirs by the owner policy.
      expect(r.listing_agent_id === maId || heldIds.has(r.id)).toBe(true);
    }
  });

  it("a marketing agent never sees the listing agent's confidences", async () => {
    // Not "zero rows": an agent who has published offers of their own owns
    // those private rows by right. What must never appear is a private row
    // belonging to an offer someone ELSE published.
    const { data: offerPrivate } = await ma
      .from("comarketing_offer_private")
      .select("offer_id, comarketing_offers!inner (listing_agent_id)");
    for (const row of (offerPrivate ?? []) as unknown as {
      comarketing_offers: { listing_agent_id: string } | null;
    }[]) {
      expect(row.comarketing_offers?.listing_agent_id).toBe(maId);
    }

    // property_private rows for her OWN properties are hers by right; rows for
    // a property she merely markets or browses must not appear.
    const { data: propPrivate } = await ma
      .from("property_private")
      .select("property_id, properties!inner (agent_id)");
    for (const row of (propPrivate ?? []) as unknown as {
      properties: { agent_id: string } | null;
    }[]) {
      expect(row.properties?.agent_id).toBe(maId);
    }
  });

  it("an agent cannot create an engagement naming someone else", async () => {
    if (!freeOfferId) return;
    // A third party, NOT the listing agent. Naming the LA here would trip
    // "cannot pick up their own offer" in the BEFORE INSERT trigger, which
    // fires ahead of the policy and would prove nothing about the RLS check
    // `marketing_agent_id = auth.uid()` — the thing actually under test.
    const someoneElse = "00000000-0000-4000-8000-0000000009ff";
    const { error } = await ma.from("comarketing_engagements").insert({
      offer_id: freeOfferId,
      marketing_agent_id: someoneElse,
      accepted_terms_version: 1,
      accepted_terms: {},
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  it("the listing agent cannot pick up their own offer", async () => {
    if (!freeOfferId) return;
    const { error } = await la.from("comarketing_engagements").insert({
      offer_id: freeOfferId,
      marketing_agent_id: laId,
      accepted_terms_version: 1,
      accepted_terms: {},
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/cannot pick up their own/i);
  });

  it("an agent cannot pick up the same offer twice", async () => {
    if (!heldOfferId) return;
    const { error } = await ma.from("comarketing_engagements").insert({
      offer_id: heldOfferId,
      marketing_agent_id: maId,
      accepted_terms_version: 1,
      accepted_terms: {},
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/already picked up/i);
  });

  it("accepted terms cannot be rewritten after the fact (§4.2)", async () => {
    const { data: mine } = await ma
      .from("comarketing_engagements")
      .select("id, accepted_terms")
      .eq("marketing_agent_id", maId)
      .limit(1);
    if (!mine?.length) return;

    const { error, data } = await ma
      .from("comarketing_engagements")
      .update({ accepted_terms: { marketing_agent_share_pct: 99 } })
      .eq("id", mine[0].id)
      .select();

    expect(error !== null || (data ?? []).length === 0).toBe(true);
    if (error) expect(error.message).toMatch(/accepted terms cannot be altered/i);
  });

  it("a marketing agent cannot promote their own pending engagement", async () => {
    const { data: mine } = await ma
      .from("comarketing_engagements")
      .select("id, status")
      .eq("marketing_agent_id", maId)
      .limit(1);
    if (!mine?.length) return;

    const { error, data } = await ma
      .from("comarketing_engagements")
      .update({ status: "paused" })
      .eq("id", mine[0].id)
      .select();

    // 'ended' is the only transition the update guard allows them.
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    if (error) expect(error.message).toMatch(/only end their own engagement/i);
  });

  it("an agent cannot offer a listing they do not own (no chain borrowing, §4.7)", async () => {
    const { data: borrowed } = await ma
      .from("comarketing_engagements")
      .select("comarketing_offers (listing_id)")
      .eq("marketing_agent_id", maId)
      .eq("status", "active")
      .limit(1);

    const listingId = (borrowed?.[0] as unknown as {
      comarketing_offers: { listing_id: string } | null;
    })?.comarketing_offers?.listing_id;
    if (!listingId) return;

    const { error } = await ma.from("comarketing_offers").insert({
      listing_id: listingId,
      listing_agent_id: maId,
      marketing_agent_share_pct: 50,
      total_commission_pct: 2,
    });
    expect(error).not.toBeNull();
  });
});
