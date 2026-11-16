import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, hasEnv, fixtureEmail, fixtureName } from "./setup";

/**
 * Migration 00126: the Agent Acquisition Pipeline (screen 2).
 *   · no prospect is stored in a country without a retention period
 *     (owner decision 5); delete_after = last activity + that period;
 *   · agent.invite IN the country: a MY country admin manages MY prospects,
 *     not ID ones; agents and anon see and write nothing;
 *   · the purge removes only expired rows and is service-only.
 * The test sets MY's retention on staging for its duration and restores it.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("agent prospects (00126)", () => {
  let service: SupabaseClient;
  let myAdmin: SupabaseClient;
  let myAdminId = "";
  let agent: SupabaseClient;
  const users: string[] = [];
  const grants: string[] = [];
  const prospects: string[] = [];
  let seq = 0;
  let mySettingsBefore: Record<string, unknown> = {};
  let idSettingsBefore: Record<string, unknown> = {};
  const row = (over: Record<string, unknown> = {}) => ({
    country_code: "MY", full_name: fixtureName("p2a prospect"), phone: "+60123456789", source: "referral",
    purpose_note: "Strong rental portfolio in Mont Kiara.", created_by: myAdminId, delete_after: new Date().toISOString(), ...over,
  });

  async function person(tag: string) {
    const email = fixtureEmail(`p2a-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    await service.from("profiles").upsert({ id: data.user.id, display_name: fixtureName(`p2a ${tag}`), agent_status: "verified", country_code: "MY" });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return { id: data.user.id, c };
  }

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    mySettingsBefore = ((await service.from("countries").select("settings").eq("code", "MY").single()).data!.settings ?? {}) as Record<string, unknown>;
    idSettingsBefore = ((await service.from("countries").select("settings").eq("code", "ID").single()).data!.settings ?? {}) as Record<string, unknown>;
    const { prospect_retention_days: _drop, ...idClean } = idSettingsBefore;
    await service.from("countries").update({ settings: idClean }).eq("code", "ID");
    await service.from("countries").update({ settings: { ...mySettingsBefore, prospect_retention_days: 90 } }).eq("code", "MY");
    const m = await person("my-admin"); myAdmin = m.c; myAdminId = m.id;
    const { data: r } = await service.from("roles").select("id").eq("key", "country_admin").single();
    const { data: g } = await service.from("user_roles").insert({ user_id: m.id, role_id: r!.id, country_codes: ["MY"] }).select("id").single();
    grants.push(g!.id);
    agent = (await person("agent")).c;
  });

  afterAll(async () => {
    if (!service) return;
    if (prospects.length) await service.from("agent_prospects").delete().in("id", prospects);
    await service.from("countries").update({ settings: mySettingsBefore }).eq("code", "MY");
    await service.from("countries").update({ settings: idSettingsBefore }).eq("code", "ID");
    if (grants.length) await service.from("user_roles").delete().in("id", grants);
    for (const u of users) await service.auth.admin.deleteUser(u);
  });

  it("a MY admin stores a MY prospect, with delete_after = now + the retention period", async () => {
    const { data, error } = await myAdmin.from("agent_prospects").insert(row()).select("id, delete_after").single();
    expect(error).toBeNull();
    prospects.push(data!.id);
    const days = (Date.parse(data!.delete_after) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThan(90.1);
  });

  it("no prospect is stored in a country without a retention period (decision 5)", async () => {
    const { error } = await service.from("agent_prospects").insert(row({ country_code: "ID", phone: "+6281234567890" })).select("id").single();
    expect(error?.message).toMatch(/retention_not_set/);
  });

  it("a MY admin cannot store or see an ID prospect; agents and anon get nothing", async () => {
    await service.from("countries").update({ settings: { ...idSettingsBefore, prospect_retention_days: 60 } }).eq("code", "ID");
    const { data: idRow } = await service.from("agent_prospects").insert(row({ country_code: "ID", phone: "+6281234567890" })).select("id").single();
    prospects.push(idRow!.id);
    expect((await myAdmin.from("agent_prospects").insert(row({ country_code: "ID", phone: "+6281234567891" }))).error).not.toBeNull();
    expect((await myAdmin.from("agent_prospects").select("id").eq("id", idRow!.id)).data ?? []).toHaveLength(0);
    expect((await agent.from("agent_prospects").select("id")).data ?? []).toHaveLength(0);
    expect((await agent.from("agent_prospects").insert(row())).error).not.toBeNull();
    expect((await anonClient().from("agent_prospects").select("id")).data ?? []).toHaveLength(0);
  });

  it("a contact resets the retention clock; the country cannot change", async () => {
    const id = prospects[0];
    const later = new Date(Date.now() + 5 * 86_400_000).toISOString();
    await myAdmin.from("agent_prospects").update({ last_contact_at: later, stage: "contacted" }).eq("id", id);
    const { data } = await service.from("agent_prospects").select("delete_after, stage").eq("id", id).single();
    expect(Math.round((Date.parse(data!.delete_after) - Date.parse(later)) / 86_400_000)).toBe(90);
    expect(data!.stage).toBe("contacted");
    expect((await myAdmin.from("agent_prospects").update({ country_code: "ID" }).eq("id", id).select("id")).error).not.toBeNull();
  });

  it("the purge deletes only expired prospects and is service-only", async () => {
    const { data: old } = await service.from("agent_prospects").insert(row({ phone: "+60123456700" })).select("id").single();
    prospects.push(old!.id);
    // Make it expired directly (operator path), bypassing the trigger's recompute via last_contact_at in the past.
    await service.from("agent_prospects").update({ last_contact_at: new Date(Date.now() - 200 * 86_400_000).toISOString() }).eq("id", old!.id);
    expect((await myAdmin.rpc("purge_expired_prospects")).error).not.toBeNull();
    const { data: n } = await service.rpc("purge_expired_prospects");
    expect(Number(n)).toBeGreaterThanOrEqual(1);
    expect((await service.from("agent_prospects").select("id").eq("id", old!.id)).data ?? []).toHaveLength(0);
    expect((await service.from("agent_prospects").select("id").eq("id", prospects[0])).data ?? []).toHaveLength(1);
  });
});
