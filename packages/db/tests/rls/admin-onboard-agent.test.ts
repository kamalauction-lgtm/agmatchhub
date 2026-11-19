import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, hasEnv, fixtureEmail } from "./setup";

/**
 * Migration 00132: an admin opens an account for an agent, with recorded
 * consent and a temporary password the agent must change.
 *
 *   · an agent cannot clear their own must_change_password flag (only the
 *     server after a real password change, or an admin with agent.invite);
 *   · nobody but the server writes onboarding consents — not the agent, not
 *     an admin directly;
 *   · the agent reads their own consents; an admin of another country cannot;
 *   · agent_allows() follows the latest row: a withdrawal turns a scope off.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("admin onboards an agent (00132)", () => {
  let service: SupabaseClient;
  const users: string[] = [];
  const grants: string[] = [];
  let seq = 0;

  async function person(tag: string, country = "ID") {
    const email = fixtureEmail(`o132-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { display_name: `o132 ${tag}`, country_code: country },
    });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error: e2 } = await c.auth.signInWithPassword({ email, password });
    if (e2) throw new Error(e2.message);
    return { id: data.user.id, c };
  }
  async function admin(tag: string, countries: string[]) {
    const a = await person(tag);
    const { data: role } = await service.from("roles").select("id").eq("key", "country_admin").single();
    const { data, error } = await service.from("user_roles").insert({ user_id: a.id, role_id: role!.id, country_codes: countries }).select("id").single();
    if (error) throw new Error(`grant: ${error.message}`);
    grants.push(data.id);
    return a;
  }
  const consent = (userId: string, scopes: string[], status = "given") => ({
    user_id: userId, country_code: "ID", method: "phone_call", consented_at: new Date().toISOString(),
    scopes, wording: "The agent agreed that the platform may: open an account.", language: "en", status,
  });

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    if (!service) return;
    if (users.length) await service.from("agent_onboarding_consents").delete().in("user_id", users);
    for (const g of grants) await service.from("user_roles").delete().eq("id", g);
    for (const u of users) {
      const { error } = await service.auth.admin.deleteUser(u);
      if (error) console.error(`admin-onboard-agent cleanup: ${u}: ${error.message}`);
    }
  });

  it("an agent cannot clear their own must_change_password; the server and an inviting admin can", async () => {
    const a = await person("flag");
    await service.from("profiles").update({ must_change_password: true }).eq("id", a.id);
    expect((await a.c.from("profiles").update({ must_change_password: false }).eq("id", a.id)).error).not.toBeNull();
    expect((await service.from("profiles").select("must_change_password").eq("id", a.id).single()).data?.must_change_password).toBe(true);
    const adm = await admin("flag-admin", ["ID"]);
    expect((await adm.c.from("profiles").update({ must_change_password: false }).eq("id", a.id)).error).toBeNull();
    expect((await service.from("profiles").select("must_change_password").eq("id", a.id).single()).data?.must_change_password).toBe(false);
  });

  it("only the server writes consents — not the agent, not an admin directly", async () => {
    const a = await person("write");
    const adm = await admin("write-admin", ["ID"]);
    expect((await a.c.from("agent_onboarding_consents").insert(consent(a.id, ["open_account"]))).error).not.toBeNull();
    expect((await adm.c.from("agent_onboarding_consents").insert(consent(a.id, ["open_account"]))).error).not.toBeNull();
    expect((await service.from("agent_onboarding_consents").insert(consent(a.id, ["open_account"]))).error).toBeNull();
    expect((await service.from("agent_onboarding_consents").insert(consent(a.id, ["something_else"]))).error).not.toBeNull();
  });

  it("the agent and their country's admin read the consent; another country's admin cannot", async () => {
    const a = await person("read");
    const idAdmin = await admin("read-id", ["ID"]);
    const myAdmin = await admin("read-my", ["MY"]);
    await service.from("agent_onboarding_consents").insert(consent(a.id, ["open_account", "import_listings"]));
    expect(((await a.c.from("agent_onboarding_consents").select("id").eq("user_id", a.id)).data ?? []).length).toBe(1);
    expect(((await idAdmin.c.from("agent_onboarding_consents").select("id").eq("user_id", a.id)).data ?? []).length).toBe(1);
    expect(((await myAdmin.c.from("agent_onboarding_consents").select("id").eq("user_id", a.id)).data ?? []).length).toBe(0);
  });

  it("agent_allows follows the latest row; a withdrawal turns the scope off", async () => {
    const a = await person("allows");
    expect((await service.rpc("agent_allows", { p_user: a.id, p_scope: "publish_on_behalf" })).data).toBe(false);
    await service.from("agent_onboarding_consents").insert(consent(a.id, ["open_account", "publish_on_behalf"]));
    expect((await service.rpc("agent_allows", { p_user: a.id, p_scope: "publish_on_behalf" })).data).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    await service.from("agent_onboarding_consents").insert(consent(a.id, ["publish_on_behalf"], "withdrawn"));
    expect((await service.rpc("agent_allows", { p_user: a.id, p_scope: "publish_on_behalf" })).data).toBe(false);
    expect((await service.rpc("agent_allows", { p_user: a.id, p_scope: "open_account" })).data).toBe(true);
  });
});
