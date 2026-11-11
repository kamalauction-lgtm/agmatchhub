import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, hasEnv, fixtureEmail, fixtureName } from "./setup";

/**
 * Screen 13 (P1-f-1):
 *   00122 (D14) configuration tables follow the capability split — global
 *         settings need a GLOBAL grant; per-country rows need the capability
 *         in that country; reads are unchanged;
 *   00123 reading the audit trail needs audit.view (global roles only);
 *   00124 admin search returns only what the admin's countries cover.
 * Writes are no-op updates on existing rows (value set to itself), so nothing
 * real changes; refusals are proven by zero rows or an error.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("security scope (00122–00124)", () => {
  let service: SupabaseClient;
  const users: string[] = [];
  const grants: string[] = [];
  let seq = 0;
  let globalAdmin: SupabaseClient;      // role admin, no country list
  let myAdmin: SupabaseClient;          // role admin, MY only
  let myCountryAdmin: SupabaseClient;   // role country_admin, MY only
  let compliance: SupabaseClient;       // role compliance_admin, global
  let idAgentName = "";

  async function person(tag: string, country = "MY") {
    const email = fixtureEmail(`p1f1-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    const name = fixtureName(`p1f1 ${tag} ${Date.now()}`);
    await service.from("profiles").upsert({ id: data.user.id, display_name: name, agent_status: "verified", country_code: country });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return { id: data.user.id, c, name };
  }
  async function grant(userId: string, role: string, countries: string[] | null) {
    const { data: r } = await service.from("roles").select("id").eq("key", role).single();
    const { data, error } = await service.from("user_roles").insert({ user_id: userId, role_id: r!.id, country_codes: countries ?? [] }).select("id").single();
    if (error) throw new Error(error.message);
    grants.push(data!.id);
  }
  // A no-op update: zero rows back means RLS refused it; one row means allowed.
  const touch = async (c: SupabaseClient, table: string, key: string, value: unknown, col: string) => {
    const { data: row } = await service.from(table).select(col).eq(key, value).limit(1).single();
    const { data, error } = await c.from(table).update({ [col]: (row as Record<string, unknown>)[col] }).eq(key, value).select(key);
    return error ? 0 : (data ?? []).length;
  };

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    const g = await person("global-admin"); globalAdmin = g.c; await grant(g.id, "admin", null);
    const m = await person("my-admin"); myAdmin = m.c; await grant(m.id, "admin", ["MY"]);
    const ca = await person("my-country-admin"); myCountryAdmin = ca.c; await grant(ca.id, "country_admin", ["MY"]);
    const co = await person("compliance"); compliance = co.c; await grant(co.id, "compliance_admin", null);
    idAgentName = (await person("id-agent", "ID")).name;
  });

  afterAll(async () => {
    if (!service) return;
    if (grants.length) await service.from("user_roles").delete().in("id", grants);
    for (const u of users) await service.auth.admin.deleteUser(u);
  });

  it("D14: global settings need a global grant", async () => {
    const { data: brand } = await service.from("brand_settings").select("id").limit(1).single();
    expect(await touch(globalAdmin, "brand_settings", "id", brand!.id, "updated_at")).toBe(1);
    expect(await touch(myAdmin, "brand_settings", "id", brand!.id, "updated_at")).toBe(0);
    expect(await touch(myCountryAdmin, "brand_settings", "id", brand!.id, "updated_at")).toBe(0);
    const { data: guide } = await service.from("training_guides").select("id").limit(1).maybeSingle();
    if (guide) {
      expect(await touch(globalAdmin, "training_guides", "id", guide.id, "updated_at")).toBe(1);
      expect(await touch(myAdmin, "training_guides", "id", guide.id, "updated_at")).toBe(0);
    }
  });

  it("D14: countries and locations follow the country", async () => {
    expect(await touch(myAdmin, "countries", "code", "MY", "updated_at")).toBe(1);
    expect(await touch(myAdmin, "countries", "code", "ID", "updated_at")).toBe(0);
    expect(await touch(myCountryAdmin, "countries", "code", "MY", "updated_at")).toBe(0); // no platform.configure
    const { data: myLoc } = await service.from("locations").select("id").eq("country_code", "MY").limit(1).single();
    const { data: idLoc } = await service.from("locations").select("id").eq("country_code", "ID").limit(1).single();
    expect(await touch(myAdmin, "locations", "id", myLoc!.id, "name")).toBe(1);
    expect(await touch(myAdmin, "locations", "id", idLoc!.id, "name")).toBe(0);
  });

  it("D14: legal text needs legal.publish — an admin is refused, compliance is allowed", async () => {
    const { data: dv } = await service.from("declaration_versions").select("id").limit(1).single();
    expect(await touch(globalAdmin, "declaration_versions", "id", dv!.id, "active")).toBe(0);
    expect(await touch(compliance, "declaration_versions", "id", dv!.id, "active")).toBe(1);
    // Reads are unchanged for admins.
    expect(((await globalAdmin.from("brand_settings").select("id")).data ?? []).length).toBeGreaterThan(0);
  });

  it("00123: the audit trail is readable only with a global audit.view", async () => {
    expect(((await globalAdmin.from("audit_logs").select("id").limit(1)).data ?? []).length).toBe(1);
    expect(((await compliance.from("audit_logs").select("id").limit(1)).data ?? []).length).toBe(1);
    expect(((await myCountryAdmin.from("audit_logs").select("id").limit(1)).data ?? []).length).toBe(0);
    expect(((await myAdmin.from("audit_logs").select("id").limit(1)).data ?? []).length).toBe(0);
  });

  it("00124: admin search stays inside the admin's countries", async () => {
    const term = idAgentName.split(" ").slice(-1)[0]; // the unique timestamp suffix
    const g = (await globalAdmin.rpc("admin_search", { p_query: term, p_limit: 8 })).data as { kind: string; label: string }[] | null;
    const m = (await myCountryAdmin.rpc("admin_search", { p_query: term, p_limit: 8 })).data as { kind: string; label: string }[] | null;
    expect((g ?? []).some((r) => r.kind === "agent" && r.label === idAgentName)).toBe(true);
    expect((m ?? []).some((r) => r.kind === "agent" && r.label === idAgentName)).toBe(false);
  });
});
