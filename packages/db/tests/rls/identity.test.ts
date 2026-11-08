import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { hasEnv, anonClient, raClient, saClient, uid } from "./setup";

describe.skipIf(!hasEnv)("identity & roles (§42–43, §52)", () => {
  it("anon cannot read profiles or private identity", async () => {
    const anon = anonClient();
    const { data: profiles } = await anon.from("profiles").select("id");
    expect(profiles ?? []).toHaveLength(0);
    const { data: priv } = await anon.from("users_private").select("user_id");
    expect(priv ?? []).toHaveLength(0);
  });

  it("agent sees only own + collaborator + pool-lister profiles, never the whole directory", async () => {
    const ra = await raClient();
    const sa = await saClient();
    const me = await uid(ra);
    const saId = await uid(sa);
    const { data } = await ra.from("profiles").select("id");
    const visible = new Set((data ?? []).map((r) => r.id));

    // Who RA MUST see: self, and the SA they collaborate with.
    expect(visible.has(me)).toBe(true);
    expect(visible.has(saId)).toBe(true);

    // Who RA must NEVER see: an admin (no relation), and an agent with no
    // collaboration and no open-pool offer. Every visible row must be
    // explained by one of the four read policies — self, collaborator,
    // co-marketing partner, open-pool lister — so the check is by exclusion of
    // unrelated accounts, not by a row count: a count depends on how many
    // listers happen to have an active pool offer in the dataset (00044).
    //
    // The admin is the unrelated account. The MA test agent is NOT: the
    // staging scenario (seed-staging-scenario.mjs, E6) gives them an active
    // open-pool offer, so their visibility is the pool-lister policy at work —
    // asserted below as the explanation rather than treated as a leak.
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { data: adminRow } = await service.from("users_private").select("user_id").eq("email", process.env.TEST_ADMIN_EMAIL!).single();
    expect(adminRow?.user_id).toBeTruthy();
    expect(visible.has(adminRow!.user_id)).toBe(false);

    if (process.env.TEST_MA_EMAIL) {
      const { data: maRow } = await service.from("users_private").select("user_id").eq("email", process.env.TEST_MA_EMAIL).single();
      const { data: pool } = await service
        .from("comarketing_offers").select("id").eq("listing_agent_id", maRow!.user_id).eq("status", "active").eq("scope", "open_pool").limit(1);
      // Visible if and only if they have an active open-pool offer.
      expect(visible.has(maRow!.user_id)).toBe((pool ?? []).length > 0);
    }
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
