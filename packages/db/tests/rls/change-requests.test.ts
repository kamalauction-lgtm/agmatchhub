import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, hasEnv, fixtureEmail, fixtureName, saClient, uid } from "./setup";

/**
 * Migration 00115: change requests between moderation and the agent (P1-b).
 *
 *   · RLS is on; no client may insert, update or delete a request directly;
 *   · only a moderator in the listing's country can open or close one — an MY
 *     country admin on an Indonesian listing gets "not found" (negative);
 *   · only the listing's own agent can answer — another agent cannot, and
 *     cannot even read it (negative); anon can do nothing;
 *   · open → answered → resolved, or withdrawn; a closed request takes no more
 *     answers; every step is audited.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("listing change requests (00115)", () => {
  let service: SupabaseClient;
  let mod: SupabaseClient;        // SA + country_admin {MY}
  let owner: SupabaseClient;
  let other: SupabaseClient;
  const users: string[] = [];
  const grants: string[] = [];
  const props: string[] = [];
  const listings: string[] = [];
  let myListing = "";
  let idListing = "";
  let reqId = "";
  let seq = 0;

  async function person(tag: string, country: string) {
    const email = fixtureEmail(`p1b-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    await service.from("profiles").upsert({ id: data.user.id, display_name: fixtureName(`p1b ${tag}`), agent_status: "verified", country_code: country });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return { id: data.user.id, c };
  }
  async function listing(agentId: string, country: string) {
    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: p } = await service.from("properties").insert({
      human_readable_id: hp, agent_id: agentId, country_code: country, property_category: "residential",
      property_type: country === "MY" ? "terrace" : "rumah", measurement_unit: country === "MY" ? "sqft" : "sqm", created_by: agentId,
    }).select("id").single();
    props.push(p!.id);
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: l } = await service.from("listings").insert({
      human_readable_id: hl, property_id: p!.id, agent_id: agentId, listing_type: "sale", status: "pending_review", moderation_state: "pending",
      currency: country === "MY" ? "MYR" : "IDR", price: 1000, language: "en", title: fixtureName("p1b listing"), slug: `fixture-p1b-${p!.id.slice(0, 8)}`, created_by: agentId,
    }).select("id").single();
    listings.push(l!.id);
    return l!.id as string;
  }

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    mod = await saClient();
    const modId = await uid(mod);
    const { data: r } = await service.from("roles").select("id").eq("key", "country_admin").single();
    const { data: g, error } = await service.from("user_roles").insert({ user_id: modId, role_id: r!.id, country_codes: ["MY"] }).select("id").single();
    if (error) throw new Error(error.message);
    grants.push(g!.id);
    const o = await person("owner", "MY");
    owner = o.c;
    other = (await person("other", "MY")).c;
    const idAgent = await person("id", "ID");
    myListing = await listing(o.id, "MY");
    idListing = await listing(idAgent.id, "ID");
  });

  afterAll(async () => {
    if (!service) return;
    for (const l of listings) {
      await service.from("listing_change_requests").delete().eq("listing_id", l);
      await service.from("listings").delete().eq("id", l);
    }
    for (const p of props) await service.from("properties").delete().eq("id", p);
    for (const u of users) await service.auth.admin.deleteUser(u);
    if (grants.length) await service.from("user_roles").delete().in("id", grants);
  });

  it("no client can write a request directly", async () => {
    const row = { listing_id: myListing, kind: "correction", body: "direct insert", opened_by: (await owner.auth.getUser()).data.user!.id };
    const { error: e1 } = await owner.from("listing_change_requests").insert(row);
    expect(e1).not.toBeNull();
    const { error: e2 } = await mod.from("listing_change_requests").insert(row);
    expect(e2).not.toBeNull();
    const { error: e3 } = await anonClient().from("listing_change_requests").insert(row);
    expect(e3).not.toBeNull();
  });

  it("only a moderator in the listing's country can open one", async () => {
    const { data: agentTry } = await owner.rpc("admin_request_change", { p_listing: myListing, p_kind: "correction", p_field: "", p_body: "please" });
    expect(agentTry).toMatchObject({ ok: false, error: "not_found" });
    const { data: crossCountry } = await mod.rpc("admin_request_change", { p_listing: idListing, p_kind: "correction", p_field: "", p_body: "please fix" });
    expect(crossCountry).toMatchObject({ ok: false, error: "not_found" });
    const { data: noBody } = await mod.rpc("admin_request_change", { p_listing: myListing, p_kind: "correction", p_field: "", p_body: " " });
    expect(noBody).toMatchObject({ ok: false, error: "body_required" });
    const { data } = await mod.rpc("admin_request_change", { p_listing: myListing, p_kind: "correction", p_field: "price", p_body: "The price looks one zero short." });
    expect(data).toMatchObject({ ok: true });
    reqId = (data as { id: string }).id;
    const { data: count } = await service.from("listing_change_requests").select("id").eq("listing_id", idListing);
    expect(count ?? []).toHaveLength(0);
  });

  it("the owner and the scoped moderator can read it; another agent and anon cannot", async () => {
    expect((await owner.from("listing_change_requests").select("id").eq("id", reqId)).data ?? []).toHaveLength(1);
    expect((await mod.from("listing_change_requests").select("id").eq("id", reqId)).data ?? []).toHaveLength(1);
    expect((await other.from("listing_change_requests").select("id").eq("id", reqId)).data ?? []).toHaveLength(0);
    expect((await anonClient().from("listing_change_requests").select("id").eq("id", reqId)).data ?? []).toHaveLength(0);
  });

  it("only the listing's agent can answer", async () => {
    expect((await other.rpc("agent_answer_change", { p_request: reqId, p_answer: "not mine" })).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await mod.rpc("agent_answer_change", { p_request: reqId, p_answer: "moderator pretending" })).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await owner.rpc("agent_answer_change", { p_request: reqId, p_answer: "Fixed: it is 1,650,000." })).data).toMatchObject({ ok: true });
    const { data: r } = await service.from("listing_change_requests").select("status, answer").eq("id", reqId).single();
    expect(r).toMatchObject({ status: "answered", answer: "Fixed: it is 1,650,000." });
  });

  it("the moderator resolves it; then it takes no more answers; every step is audited", async () => {
    expect((await owner.rpc("admin_close_change", { p_request: reqId, p_outcome: "resolved" })).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await mod.rpc("admin_close_change", { p_request: reqId, p_outcome: "resolved" })).data).toMatchObject({ ok: true });
    expect((await owner.rpc("agent_answer_change", { p_request: reqId, p_answer: "late" })).data).toMatchObject({ ok: false, error: "closed" });
    expect((await mod.rpc("admin_close_change", { p_request: reqId, p_outcome: "withdrawn" })).data).toMatchObject({ ok: false, error: "closed" });
    const { data: audit } = await service.from("audit_logs").select("action").eq("entity_id", myListing).like("action", "listing.change_%");
    expect(new Set((audit ?? []).map((a) => a.action))).toEqual(new Set(["listing.change_requested", "listing.change_answered", "listing.change_resolved"]));
  });

  it("a request can be withdrawn", async () => {
    const { data } = await mod.rpc("admin_request_change", { p_listing: myListing, p_kind: "photo_original", p_field: "photos", p_body: "Please send the original of photo 2." });
    const id = (data as { id: string }).id;
    expect((await mod.rpc("admin_close_change", { p_request: id, p_outcome: "withdrawn" })).data).toMatchObject({ ok: true });
    const { data: r } = await service.from("listing_change_requests").select("status, kind").eq("id", id).single();
    expect(r).toMatchObject({ status: "withdrawn", kind: "photo_original" });
  });
});
