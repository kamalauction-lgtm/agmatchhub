import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, hasEnv, fixtureEmail, fixtureName } from "./setup";

/**
 * Migration 00125: admins create and edit agencies (screen 11).
 *   · commercial.manage in the agency's country; an agency needs a country;
 *   · a MY-only admin cannot create or edit an ID agency, nor move one to ID;
 *   · an agent and anon cannot write; nobody deletes.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("agency admin (00125)", () => {
  let service: SupabaseClient;
  let myAdmin: SupabaseClient;
  let agent: SupabaseClient;
  const users: string[] = [];
  const grants: string[] = [];
  const agencies: string[] = [];
  let seq = 0;
  let idAgency = "";

  async function person(tag: string) {
    const email = fixtureEmail(`p1g1-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    await service.from("profiles").upsert({ id: data.user.id, display_name: fixtureName(`p1g1 ${tag}`), agent_status: "verified", country_code: "MY" });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return { id: data.user.id, c };
  }

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    const m = await person("my-admin"); myAdmin = m.c;
    const { data: r } = await service.from("roles").select("id").eq("key", "admin").single();
    const { data: g } = await service.from("user_roles").insert({ user_id: m.id, role_id: r!.id, country_codes: ["MY"] }).select("id").single();
    grants.push(g!.id);
    agent = (await person("agent")).c;
    const { data: a } = await service.from("agencies").insert({ name: fixtureName("p1g1 ID agency"), country_code: "ID" }).select("id").single();
    idAgency = a!.id; agencies.push(idAgency);
  });

  afterAll(async () => {
    if (!service) return;
    if (agencies.length) await service.from("agencies").delete().in("id", agencies);
    if (grants.length) await service.from("user_roles").delete().in("id", grants);
    for (const u of users) await service.auth.admin.deleteUser(u);
  });

  it("a MY admin creates and edits a MY agency", async () => {
    const { data, error } = await myAdmin.from("agencies").insert({ name: fixtureName("p1g1 MY agency"), country_code: "MY", registration_number: "E (1) 0001" }).select("id").single();
    expect(error).toBeNull();
    agencies.push(data!.id);
    const up = await myAdmin.from("agencies").update({ registration_number: "E (1) 0002" }).eq("id", data!.id).select("id");
    expect(up.data ?? []).toHaveLength(1);
    // …but cannot move it to another country, or drop its country.
    expect((await myAdmin.from("agencies").update({ country_code: "ID" }).eq("id", data!.id).select("id")).error).not.toBeNull();
    expect((await myAdmin.from("agencies").update({ country_code: null }).eq("id", data!.id).select("id")).error).not.toBeNull();
  });

  it("a MY admin cannot create or edit an ID agency, nor one without a country", async () => {
    expect((await myAdmin.from("agencies").insert({ name: fixtureName("p1g1 ID by MY"), country_code: "ID" })).error).not.toBeNull();
    expect((await myAdmin.from("agencies").insert({ name: fixtureName("p1g1 no country") })).error).not.toBeNull();
    expect((await myAdmin.from("agencies").update({ name: "renamed" }).eq("id", idAgency).select("id")).data ?? []).toHaveLength(0);
  });

  it("an agent and anon cannot write, and nobody deletes", async () => {
    expect((await agent.from("agencies").insert({ name: fixtureName("p1g1 agent"), country_code: "MY" })).error).not.toBeNull();
    expect((await anonClient().from("agencies").insert({ name: fixtureName("p1g1 anon"), country_code: "MY" })).error).not.toBeNull();
    await myAdmin.from("agencies").delete().eq("id", agencies[agencies.length - 1]);
    expect(((await service.from("agencies").select("id").eq("id", agencies[agencies.length - 1])).data ?? []).length).toBe(1);
  });
});
