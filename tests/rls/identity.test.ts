import { describe, it, expect } from "vitest";
import { hasEnv, anonClient, raClient, saClient, uid } from "./setup";

describe.skipIf(!hasEnv)("identity & roles (§42–43, §52)", () => {
  it("anon cannot read profiles or private identity", async () => {
    const anon = anonClient();
    const { data: profiles } = await anon.from("profiles").select("id");
    expect(profiles ?? []).toHaveLength(0);
    const { data: priv } = await anon.from("users_private").select("user_id");
    expect(priv ?? []).toHaveLength(0);
  });

  it("agent sees only own + collaborator profiles, never the whole directory", async () => {
    const ra = await raClient();
    const { data } = await ra.from("profiles").select("id");
    // own + collaborating SA (+ nothing else, e.g. not the admins)
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
    expect((data ?? []).length).toBeLessThanOrEqual(2);
  });

  it("agent cannot escalate own verification status", async () => {
    const ra = await raClient();
    const me = await uid(ra);
    const { error, data } = await ra
      .from("profiles")
      .update({ agent_status: "banned" })
      .eq("id", me)
      .select();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it("agent cannot read or write the audit log", async () => {
    const sa = await saClient();
    const { data } = await sa.from("audit_logs").select("id");
    expect(data ?? []).toHaveLength(0);
    const { error } = await sa.from("audit_logs").insert({
      action: "forged", entity_type: "x",
    });
    expect(error).not.toBeNull();
  });

  it("agent cannot grant themselves a role", async () => {
    const sa = await saClient();
    const me = await uid(sa);
    const { data: roles } = await sa.from("roles").select("id, key");
    const superAdmin = roles?.find((r) => r.key === "super_admin");
    expect(superAdmin).toBeTruthy();
    const { error } = await sa
      .from("user_roles")
      .insert({ user_id: me, role_id: superAdmin!.id });
    expect(error).not.toBeNull();
  });

  it("agent cannot read another user's verification documents folder", async () => {
    const sa = await saClient();
    const ra = await raClient();
    const raId = await uid(ra);
    const { data } = await sa.storage.from("agent-verification-private").list(raId);
    expect(data ?? []).toHaveLength(0);
  });
});
