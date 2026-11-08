import { describe, it, expect, afterAll } from "vitest";
import { hasEnv, raClient, adminClient } from "./setup";

/**
 * 00097 — the AI Workforce cast. Every role has a default character with a
 * portrait and words in three languages; an agent can read the cast and
 * change nothing; an admin can add a per-country variant, and only one row
 * per (role, country) may exist.
 */
describe.skipIf(!hasEnv)("AI role personas (00097)", () => {
  afterAll(async () => {
    const admin = await adminClient();
    await admin.from("ai_role_personas").delete().eq("role_key", "ai_manager").eq("country_code", "MY").like("name", "[fixture]%");
  });

  it("every role has a default character with a portrait and three-language words", async () => {
    const ra = await raClient();
    const { data: roles } = await ra.from("ai_roles").select("key");
    const { data: personas, error } = await ra.from("ai_role_personas").select("role_key, country_code, name, tagline, skills, portrait_path, avatar_path").is("country_code", null);
    expect(error).toBeNull();
    const byRole = new Map((personas ?? []).map((p) => [p.role_key, p]));
    for (const r of roles ?? []) {
      const p = byRole.get(r.key);
      expect(p, `no character for ${r.key}`).toBeTruthy();
      expect(p!.name.length).toBeGreaterThan(1);
      expect(p!.portrait_path).toMatch(/^\/ai\/characters\/[a-z_]+\.webp$/);
      for (const l of ["en", "ms", "id"]) {
        expect((p!.tagline as Record<string, string>)[l]?.length ?? 0, `${r.key} tagline ${l}`).toBeGreaterThan(10);
        expect(((p!.skills as Record<string, string[]>)[l] ?? []).length, `${r.key} skills ${l}`).toBe(3);
      }
    }
    expect(byRole.get("ai_manager")?.name).toBe("Astra");
  });

  it("an agent cannot rename, add or remove a character; an admin can add one per country, once", async () => {
    const ra = await raClient();
    const admin = await adminClient();
    expect((await ra.from("ai_role_personas").update({ name: "Hacked" }).eq("role_key", "ai_manager").select("id")).data ?? []).toHaveLength(0);
    expect((await ra.from("ai_role_personas").insert({ role_key: "ai_manager", country_code: "MY", name: "Nope" })).error).not.toBeNull();
    expect((await ra.from("ai_role_personas").delete().eq("role_key", "ai_manager").select("id")).data ?? []).toHaveLength(0);

    const { error } = await admin.from("ai_role_personas").insert({ role_key: "ai_manager", country_code: "MY", name: "[fixture] Aina", portrait_path: "/ai/characters/ai_manager.webp" });
    expect(error, error?.message).toBeNull();
    const { error: dup } = await admin.from("ai_role_personas").insert({ role_key: "ai_manager", country_code: "MY", name: "[fixture] Twice" });
    expect(dup?.code).toBe("23505");
    // Agents see the variant alongside the default; the page picks by country.
    const { data: both } = await ra.from("ai_role_personas").select("country_code, name").eq("role_key", "ai_manager");
    expect(both?.map((p) => p.country_code).sort()).toEqual([null, "MY"].sort());
  });
});
