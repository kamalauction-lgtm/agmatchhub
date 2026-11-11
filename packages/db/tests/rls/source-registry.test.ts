import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, hasEnv, fixtureEmail, fixtureName } from "./setup";

/**
 * Migration 00127: the source registry (screen 8).
 *   · registering and mapping need a GLOBAL platform.configure grant;
 *   · the terms status is a legal call: global legal.publish, stamped;
 *   · a MY-scoped admin, an agent and anon cannot write; nobody deletes.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("source registry (00127)", () => {
  let service: SupabaseClient;
  let globalAdmin: SupabaseClient;
  let myAdmin: SupabaseClient;
  let compliance: SupabaseClient;
  let complianceId = "";
  let agent: SupabaseClient;
  const users: string[] = [];
  const grants: string[] = [];
  const sources: string[] = [];
  let seq = 0;
  const key = `fixture-p2c-${Date.now()}`;

  async function person(tag: string, role?: string, countries: string[] = []) {
    const email = fixtureEmail(`p2c-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    await service.from("profiles").upsert({ id: data.user.id, display_name: fixtureName(`p2c ${tag}`), agent_status: "verified", country_code: "MY" });
    if (role) {
      const { data: r } = await service.from("roles").select("id").eq("key", role).single();
      const { data: g } = await service.from("user_roles").insert({ user_id: data.user.id, role_id: r!.id, country_codes: countries }).select("id").single();
      grants.push(g!.id);
    }
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return { id: data.user.id, c };
  }

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    globalAdmin = (await person("global", "admin")).c;
    myAdmin = (await person("my", "admin", ["MY"])).c;
    const co = await person("compliance", "compliance_admin"); compliance = co.c; complianceId = co.id;
    agent = (await person("agent")).c;
  });

  afterAll(async () => {
    if (!service) return;
    if (sources.length) await service.from("listing_sources").delete().in("id", sources);
    if (grants.length) await service.from("user_roles").delete().in("id", grants);
    for (const u of users) await service.auth.admin.deleteUser(u);
  });

  it("a global platform admin registers and maps a source, but cannot review its terms", async () => {
    const { data, error } = await globalAdmin.from("listing_sources").insert({ key, display_name: "Fixture portal", kind: "portal", country_code: "ID" }).select("id, terms_status").single();
    expect(error).toBeNull();
    sources.push(data!.id);
    expect(data!.terms_status).toBe("unreviewed");
    expect((await globalAdmin.from("listing_sources").update({ field_mapping: { luas_tanah: "landSize" } }).eq("id", data!.id).select("id")).data ?? []).toHaveLength(1);
    const { error: tErr } = await globalAdmin.from("listing_sources").update({ terms_status: "allowed" }).eq("id", data!.id);
    expect(tErr?.message).toMatch(/terms_review_requires_legal/);
  });

  it("a legal reviewer sets the terms status, stamped; they cannot change the mapping", async () => {
    const id = sources[0];
    expect((await compliance.from("listing_sources").update({ terms_status: "agent_supplied_only", terms_note: "Portal terms forbid reuse of photos." }).eq("id", id)).error).toBeNull();
    const { data } = await service.from("listing_sources").select("terms_status, terms_reviewed_by, terms_reviewed_at").eq("id", id).single();
    expect(data).toMatchObject({ terms_status: "agent_supplied_only", terms_reviewed_by: complianceId });
    expect(data!.terms_reviewed_at).not.toBeNull();
    const { error } = await compliance.from("listing_sources").update({ field_mapping: { x: "title" } }).eq("id", id);
    expect(error?.message).toMatch(/source_config_requires_platform_configure/);
  });

  it("a MY-scoped admin, an agent and anon cannot write; nobody deletes", async () => {
    expect((await myAdmin.from("listing_sources").insert({ key: `${key}-my`, display_name: "MY try", kind: "portal" })).error).not.toBeNull();
    expect((await myAdmin.from("listing_sources").update({ display_name: "renamed" }).eq("id", sources[0]).select("id")).data ?? []).toHaveLength(0);
    expect((await agent.from("listing_sources").select("id")).data ?? []).toHaveLength(0);
    expect((await agent.from("listing_sources").insert({ key: `${key}-agent`, display_name: "agent try", kind: "portal" })).error).not.toBeNull();
    expect((await anonClient().from("listing_sources").select("id")).data ?? []).toHaveLength(0);
    await globalAdmin.from("listing_sources").delete().eq("id", sources[0]);
    expect((await service.from("listing_sources").select("id").eq("id", sources[0])).data ?? []).toHaveLength(1);
  });
});
