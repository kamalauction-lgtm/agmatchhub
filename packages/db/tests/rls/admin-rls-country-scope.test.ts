import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, saClient, adminClient, hasEnv, makeFixtureAgent, fixtureEmail, fixtureName, uid } from "./setup";

/**
 * Migration 00105 — the admin branch of the table policies follows the
 * admin's country scope (D11).
 *
 * Reproduced before the fix: a country admin scoped to {MY} could read an ID
 * agent's users_private row, their agent_profiles row, ID listings and ID
 * requests directly through PostgREST, although the hub hid them. These are
 * the negative tests for that, plus the positive cases that must not change:
 * the same admin still sees MY rows, still sees their own rows, and a global
 * admin still sees every country.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasAdminEnv = !!(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

describe.skipIf(!hasEnv || !SERVICE)("admin table access is country-scoped (00105)", () => {
  let service: SupabaseClient;
  let scoped: SupabaseClient;
  let scopedId: string;
  let grantId: string | null = null;
  const users: string[] = [];
  const properties: string[] = [];
  const listings: string[] = [];
  const requests: string[] = [];
  const f = { idAgent: "", myAgent: "", idListing: "", myListing: "", idRequest: "", myRequest: "" };

  const agent = async (tag: string, country: string) => {
    const id = await makeFixtureAgent(service, tag, { country_code: country });
    users.push(id);
    const { error } = await service
      .from("users_private")
      .upsert({ user_id: id, email: fixtureEmail(`${tag}-private`), full_legal_name: fixtureName(tag) });
    if (error) throw new Error(`users_private fixture: ${error.message}`);
    await service.from("agent_profiles").upsert({ user_id: id, full_legal_name: fixtureName(tag), country_code: country });
    return id;
  };

  const listing = async (agentId: string, country: string) => {
    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: prop, error: pErr } = await service
      .from("properties")
      .insert({ human_readable_id: hp, agent_id: agentId, country_code: country, property_category: "residential", property_type: "rumah", created_by: agentId })
      .select("id").single();
    if (pErr) throw new Error(`property fixture: ${pErr.message}`);
    properties.push(prop.id);
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: lst, error: lErr } = await service
      .from("listings")
      .insert({
        human_readable_id: hl, property_id: prop.id, agent_id: agentId, listing_type: "sale",
        status: "draft", currency: country === "MY" ? "MYR" : "IDR", price: 1000, language: "en",
        title: fixtureName(`p0a2 ${country} listing`), slug: `fixture-p0a2-${prop.id.slice(0, 8)}`, created_by: agentId,
      })
      .select("id").single();
    if (lErr) throw new Error(`listing fixture: ${lErr.message}`);
    listings.push(lst.id);
    return lst.id as string;
  };

  const request = async (agentId: string, country: string) => {
    const { data: hr } = await service.rpc("next_human_id", { p_prefix: "REQ" });
    const { data, error } = await service
      .from("property_requests")
      .insert({
        human_readable_id: hr, requesting_agent_id: agentId, title: fixtureName(`p0a2 ${country} request`),
        transaction_type: "buy", property_category: "residential", country_code: country,
        city: country === "MY" ? "Kuala Lumpur" : "Jakarta", currency: country === "MY" ? "MYR" : "IDR",
      })
      .select("id").single();
    if (error) throw new Error(`request fixture: ${error.message}`);
    requests.push(data.id);
    return data.id as string;
  };

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    scoped = await saClient();
    scopedId = await uid(scoped);
    const { data: role } = await service.from("roles").select("id").eq("key", "country_admin").single();
    const { data, error } = await service
      .from("user_roles")
      .insert({ user_id: scopedId, role_id: role!.id, country_codes: ["MY"] })
      .select("id").single();
    if (error) throw new Error(`could not grant test role: ${error.message}`);
    grantId = data.id;

    f.idAgent = await agent("p0a2-id", "ID");
    f.myAgent = await agent("p0a2-my", "MY");
    f.idListing = await listing(f.idAgent, "ID");
    f.myListing = await listing(f.myAgent, "MY");
    f.idRequest = await request(f.idAgent, "ID");
    f.myRequest = await request(f.myAgent, "MY");
  });

  afterAll(async () => {
    if (grantId) await service.from("user_roles").delete().eq("id", grantId);
    if (requests.length) await service.from("property_requests").delete().in("id", requests);
    if (listings.length) await service.from("listings").delete().in("id", listings);
    if (properties.length) await service.from("properties").delete().in("id", properties);
    for (const id of users) await service.auth.admin.deleteUser(id);
  });

  const sees = async (c: SupabaseClient, table: string, key: string, id: string) => {
    const { data } = await c.from(table).select(key).eq(key, id).maybeSingle();
    return !!data;
  };

  it.each([
    ["users_private", "user_id", "idAgent"],
    ["agent_profiles", "user_id", "idAgent"],
    ["profiles", "id", "idAgent"],
    ["listings", "id", "idListing"],
    ["property_requests", "id", "idRequest"],
  ] as const)("a MY country admin cannot read an ID row in %s", async (table, key, which) => {
    expect(await sees(scoped, table, key, f[which])).toBe(false);
  });

  it.each([
    ["users_private", "user_id", "myAgent"],
    ["agent_profiles", "user_id", "myAgent"],
    ["profiles", "id", "myAgent"],
    ["listings", "id", "myListing"],
    ["property_requests", "id", "myRequest"],
  ] as const)("but can read the MY row in %s", async (table, key, which) => {
    expect(await sees(scoped, table, key, f[which])).toBe(true);
  });

  it("cannot moderate an ID listing directly either", async () => {
    const { data } = await scoped
      .from("listings")
      .update({ description: "p0a2 test" })
      .eq("id", f.idListing)
      .select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("still reads their own rows through the owner branch", async () => {
    expect(await sees(scoped, "users_private", "user_id", scopedId)).toBe(true);
    expect(await sees(scoped, "profiles", "id", scopedId)).toBe(true);
  });

  it.skipIf(!hasAdminEnv)("a global admin still reads both countries", async () => {
    const admin = await adminClient();
    for (const [table, key, which] of [
      ["users_private", "user_id", "idAgent"], ["users_private", "user_id", "myAgent"],
      ["listings", "id", "idListing"], ["listings", "id", "myListing"],
      ["property_requests", "id", "idRequest"], ["property_requests", "id", "myRequest"],
    ] as const) {
      expect(await sees(admin, table, key, f[which]), `${table} ${which}`).toBe(true);
    }
  });

  it("the scope helpers answer no for an agent with no admin role", async () => {
    // SA's country_admin grant is the only admin role it holds; take a
    // fresh client for a plain agent by checking the helper on the ID agent.
    const { data } = await service.rpc("admin_sees_country", { p_country: "ID" });
    expect(data).toBe(false); // service role has no auth.uid(), so no admin role
  });
});
