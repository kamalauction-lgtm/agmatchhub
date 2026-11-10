import { describe, it, expect } from "vitest";
import { hasEnv, saClient } from "../rls/setup";
import { IDENTITY_3D } from "../../../../apps/hub/src/components/ai/office3d/identity";

/**
 * The 3D Live Office must carry every one of the 36 original AI characters —
 * none missing, duplicated, renamed or substituted (owner directive,
 * 2026-11-10). The authoritative roster is `ai_roles` + `ai_role_personas`;
 * the owner's six reference groups are the character sheets.
 */
const SHEETS: Record<string, string[]> = {
  "Administration & Leads": ["Astra", "Nova", "Lyra", "Zayn", "Vex", "Echo"],
  "Messaging & Marketing": ["Mira", "Tempo", "Orion", "Luna", "Kira", "Atlas"],
  "Matching & Appointments": ["Vega", "Sora", "Niko", "Kael", "Ivy", "Piper"],
  "Research & Property Management": ["Scout", "Raya", "Quinn", "Halo", "Pixel", "Flux"],
  "Social, Sales & Closing": ["Juno", "Neo", "Solis", "Titan", "Clara", "Finn"],
  "Teams & Global Collaboration": ["Aria", "Rio", "Prism", "Cosmo", "Mila", "Link"],
};

describe.skipIf(!hasEnv)("AI Live Office roster", () => {
  it("36 live roles each have exactly one persona, all names unique", async () => {
    const sb = await saClient();
    const [{ data: roles, error: e1 }, { data: personas, error: e2 }] = await Promise.all([
      sb.from("ai_roles").select("key, category").neq("status", "hidden"),
      sb.from("ai_role_personas").select("role_key, name, portrait_path, avatar_path"),
    ]);
    expect(e1).toBeNull();
    expect(e2).toBeNull();
    expect(roles).toHaveLength(36);
    expect(personas).toHaveLength(36);
    const names = personas!.map((p) => p.name);
    expect(new Set(names).size).toBe(36);
    const roleKeys = new Set(roles!.map((r) => r.key));
    for (const p of personas!) {
      expect(roleKeys.has(p.role_key), `persona ${p.name} has no live role`).toBe(true);
      expect(p.portrait_path || p.avatar_path, `persona ${p.name} has no portrait`).toBeTruthy();
    }
    // Twelve operational departments, not six: the sheets are reference groups.
    expect(new Set(roles!.map((r) => r.category)).size).toBe(12);
  });

  it("matches the owner's six character sheets name for name", async () => {
    const sb = await saClient();
    const { data: personas } = await sb.from("ai_role_personas").select("role_key, name");
    const byName = new Map(personas!.map((p) => [p.name, p.role_key]));
    const seen = new Set<string>();
    for (const [sheet, list] of Object.entries(SHEETS)) {
      for (const n of list) {
        expect(byName.has(n), `${sheet}: ${n} missing from ai_role_personas`).toBe(true);
        expect(seen.has(n), `${n} listed twice`).toBe(false);
        seen.add(n);
      }
    }
    expect(seen.size).toBe(36);
    // Nothing in the database is left out of the sheets either.
    for (const p of personas!) expect(seen.has(p.name), `${p.name} not on any sheet`).toBe(true);
  });

  it("3D identity sheets point at the right persona", async () => {
    const sb = await saClient();
    const { data: personas } = await sb.from("ai_role_personas").select("role_key, name");
    const byKey = new Map(personas!.map((p) => [p.role_key, p.name]));
    for (const [key, id] of Object.entries(IDENTITY_3D)) {
      expect(byKey.get(key), `identity ${key}`).toBe(id.persona);
    }
  });
});
