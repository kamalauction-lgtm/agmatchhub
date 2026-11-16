import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, hasEnv, fixtureEmail, FIXTURE_PREFIX } from "./setup";

/**
 * Migration 00130: agency directory; AG Hero only for partner agencies.
 *
 *   · an agent adds their company as 'unconfirmed' in their own country; the
 *     same name is reused, not duplicated; at most 3 unconfirmed each;
 *   · an agent picks a company in their own country only, and the profile's
 *     agency name follows;
 *   · an agent cannot write agencies directly (no partner flag, no confirm);
 *   · the Hero partner check is true only for a confirmed partner agency;
 *   · an agent without access cannot add a company.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("agency directory and Hero partners (00130)", () => {
  let service: SupabaseClient;
  const users: string[] = [];
  const agencies: string[] = [];
  let seq = 0;
  const name = (label: string) => `${FIXTURE_PREFIX} a130 ${label} ${Date.now()}-${seq++}`;

  async function person(tag: string, country = "MY") {
    const email = fixtureEmail(`a130-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { display_name: `a130 ${tag}`, country_code: country },
    });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error: e2 } = await c.auth.signInWithPassword({ email, password });
    if (e2) throw new Error(e2.message);
    return { id: data.user.id, c };
  }
  async function add(c: SupabaseClient, n: string) {
    const { data } = await c.rpc("agent_add_agency", { p_name: n });
    const r = data as { ok: boolean; agency?: string; created?: boolean; error?: string };
    if (r?.agency) agencies.push(r.agency);
    return r;
  }

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    if (!service) return;
    if (users.length) await service.from("agent_profiles").delete().in("user_id", users);
    if (agencies.length) await service.from("agencies").delete().in("id", [...new Set(agencies)]);
    for (const u of users) {
      const { error } = await service.auth.admin.deleteUser(u);
      if (error) console.error(`agency-directory cleanup: ${u}: ${error.message}`);
    }
  });

  it("an agent adds their company: unconfirmed, own country, not duplicated", async () => {
    const a = await person("add");
    const n = name("Realty");
    const r1 = await add(a.c, n);
    expect(r1).toMatchObject({ ok: true, created: true });
    const { data: row } = await service.from("agencies").select("status, country_code, created_by, hero_partner").eq("id", r1.agency!).single();
    expect(row).toMatchObject({ status: "unconfirmed", country_code: "MY", created_by: a.id, hero_partner: false });
    const r2 = await add(a.c, `  ${n.toUpperCase()} `);
    expect(r2).toMatchObject({ ok: true, created: false, agency: r1.agency });
  });

  it("at most 3 unconfirmed companies per agent", async () => {
    const a = await person("many");
    for (let i = 0; i < 3; i++) expect((await add(a.c, name(`many ${i}`))).ok).toBe(true);
    expect(await add(a.c, name("many 4"))).toMatchObject({ ok: false, error: "too_many" });
  });

  it("an agent picks a company in their own country only; the profile follows", async () => {
    const a = await person("pick");
    const { data: my } = await service.from("agencies").insert({ name: name("MY co"), country_code: "MY" }).select("id, name").single();
    const { data: id } = await service.from("agencies").insert({ name: name("ID co"), country_code: "ID" }).select("id").single();
    agencies.push(my!.id, id!.id);
    expect((await a.c.rpc("agent_set_agency", { p_agency: id!.id })).data).toMatchObject({ ok: false, error: "other_country" });
    expect((await a.c.rpc("agent_set_agency", { p_agency: my!.id })).data).toMatchObject({ ok: true });
    const { data: ap } = await service.from("agent_profiles").select("agency_id, agency_name").eq("user_id", a.id).single();
    expect(ap).toMatchObject({ agency_id: my!.id, agency_name: my!.name });
  });

  it("an agent cannot write agencies directly: no partner flag, no confirming", async () => {
    const a = await person("direct");
    const r = await add(a.c, name("Direct"));
    expect((await a.c.from("agencies").update({ hero_partner: true, status: "confirmed" }).eq("id", r.agency!).select("id")).data ?? []).toHaveLength(0);
    const { data: row } = await service.from("agencies").select("status, hero_partner").eq("id", r.agency!).single();
    expect(row).toMatchObject({ status: "unconfirmed", hero_partner: false });
    expect((await a.c.from("agencies").insert({ name: name("Insert"), country_code: "MY", hero_partner: true })).error).not.toBeNull();
  });

  it("the Hero partner check is true only for a confirmed partner agency", async () => {
    const a = await person("hero");
    const { data: ag } = await service.from("agencies").insert({ name: name("Partner"), country_code: "MY" }).select("id").single();
    agencies.push(ag!.id);
    await a.c.rpc("agent_set_agency", { p_agency: ag!.id });
    expect((await a.c.rpc("agency_is_hero_partner")).data).toBe(false);
    await service.from("agencies").update({ hero_partner: true, status: "unconfirmed" }).eq("id", ag!.id);
    expect((await a.c.rpc("agency_is_hero_partner")).data).toBe(false);
    await service.from("agencies").update({ status: "confirmed" }).eq("id", ag!.id);
    expect((await a.c.rpc("agency_is_hero_partner")).data).toBe(true);
    const other = await person("hero-peek");
    expect((await other.c.rpc("agency_is_hero_partner", { p_user: a.id })).data).toBe(false);
  });

  it("an agent without access cannot add a company", async () => {
    const a = await person("banned");
    await service.from("profiles").update({ agent_status: "banned" }).eq("id", a.id);
    expect(await add(a.c, name("Banned"))).toMatchObject({ ok: false, error: "not_allowed" });
  });
});
