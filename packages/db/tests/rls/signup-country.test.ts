import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, hasEnv, fixtureEmail } from "./setup";

/**
 * Migration 00128: the country is chosen at signup, and licence types are
 * per-country configuration (owner, 13 Nov 2026).
 *
 *   · handle_new_user keeps the signup country only if it is an active
 *     country; anything else leaves it empty;
 *   · an agent may set their own country once (from empty, active only), but
 *     can never move themselves to another country afterwards;
 *   · an admin with agent.verify, and the service role, can change it;
 *   · MY offers REN; ID does not.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("signup country and licence types (00128)", () => {
  let service: SupabaseClient;
  const users: string[] = [];
  const grants: string[] = [];
  let seq = 0;

  async function person(tag: string, meta: Record<string, unknown>) {
    const email = fixtureEmail(`c128-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error: signInError } = await c.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(signInError.message);
    return { id: data.user.id, c };
  }
  const countryOf = async (id: string) =>
    (await service.from("profiles").select("country_code").eq("id", id).single()).data?.country_code ?? null;

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    if (!service) return;
    for (const g of grants) await service.from("user_roles").delete().eq("id", g);
    for (const u of users) await service.auth.admin.deleteUser(u);
  });

  it("keeps an active signup country and drops an inactive or invalid one", async () => {
    expect(await countryOf((await person("my", { display_name: "c128", country_code: "MY" })).id)).toBe("MY");
    expect(await countryOf((await person("lower", { display_name: "c128", country_code: "id" })).id)).toBe("ID");
    expect(await countryOf((await person("inactive", { display_name: "c128", country_code: "FR" })).id)).toBeNull();
    expect(await countryOf((await person("junk", { display_name: "c128", country_code: "x'); drop" })).id)).toBeNull();
    expect(await countryOf((await person("none", { display_name: "c128" })).id)).toBeNull();
  });

  it("an agent may set their own country once, to an active country only", async () => {
    const a = await person("set", { display_name: "c128" });
    expect((await a.c.from("profiles").update({ country_code: "FR" }).eq("id", a.id)).error).not.toBeNull();
    expect(await countryOf(a.id)).toBeNull();
    expect((await a.c.from("profiles").update({ country_code: "ID" }).eq("id", a.id)).error).toBeNull();
    expect(await countryOf(a.id)).toBe("ID");
  });

  it("an agent cannot move themselves to another country, or clear it", async () => {
    const a = await person("move", { display_name: "c128", country_code: "MY" });
    expect((await a.c.from("profiles").update({ country_code: "ID" }).eq("id", a.id)).error).not.toBeNull();
    expect((await a.c.from("profiles").update({ country_code: null }).eq("id", a.id)).error).not.toBeNull();
    expect(await countryOf(a.id)).toBe("MY");
    // Other profile edits still work.
    expect((await a.c.from("profiles").update({ display_name: "c128 renamed" }).eq("id", a.id)).error).toBeNull();
  });

  it("an admin with agent.verify, and the service role, can change it", async () => {
    const a = await person("admin-target", { display_name: "c128", country_code: "MY" });
    const admin = await person("admin", { display_name: "c128" });
    const { data: role } = await service.from("roles").select("id").eq("key", "admin").single();
    const { data: grant, error } = await service
      .from("user_roles").insert({ user_id: admin.id, role_id: role!.id, country_codes: [] }).select("id").single();
    if (error) throw new Error(`could not grant test role: ${error.message}`);
    grants.push(grant.id);

    expect((await admin.c.from("profiles").update({ country_code: "ID" }).eq("id", a.id)).error).toBeNull();
    expect(await countryOf(a.id)).toBe("ID");
    expect((await service.from("profiles").update({ country_code: "MY" }).eq("id", a.id)).error).toBeNull();
    expect(await countryOf(a.id)).toBe("MY");
  });

  it("licence types are per country: REN for Malaysia, not for Indonesia", async () => {
    const { data } = await service.from("countries").select("code, terminology").in("code", ["MY", "ID"]);
    const lf = (code: string) => (data?.find((c) => c.code === code)?.terminology as { licence_fields?: string[] } | null)?.licence_fields ?? [];
    expect(lf("MY")).toContain("REN");
    expect(lf("ID")).not.toContain("REN");
    expect(lf("ID").length).toBeGreaterThan(0);
  });
});
