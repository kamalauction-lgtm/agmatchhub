import { describe, it, expect, afterAll } from "vitest";
import { hasEnv, hasPairEnv, raClient, laClient, adminClient, uid } from "./setup";

/**
 * Migration 00088. The Hero API itself is not called here (no key on CI);
 * what is proven is everything around it: who may record a result, what a
 * "found + logged in" record does to entitlements, what unlinking undoes,
 * and that another agent can neither see nor forge any of it.
 */
describe.skipIf(!hasEnv || !hasPairEnv)("AG Hero link (00088)", () => {
  afterAll(async () => {
    const la = await laClient();
    const me = await uid(la);
    await la.rpc("hero_unlink", { p_user: me });
  });

  const record = (result: "found" | "not_found" | "error", firstLogin: string | null) => ({
    p_method: "email", p_hash: "testhash", p_result: result, p_account_created: "2026-10-14T02:02:00Z",
    p_first_login: firstLogin, p_last_login: firstLogin, p_country: null, p_membership: null, p_error: null,
  });

  it("found + logged in → linked, and the launch benefits appear in the entitlement resolver", async () => {
    const la = await laClient();
    const me = await uid(la);
    const before = Number((await la.rpc("resolve_entitlement_int", { p_user: me, p_key: "ai.monthly_usage" })).data);

    const { data: status, error } = await la.rpc("hero_link_record", { p_user: me, ...record("found", "2026-10-14T02:05:00Z") });
    expect(error, error?.message).toBeNull();
    expect(status).toBe("linked");

    const { data: link } = await la.from("hero_links").select("status, method, linked_at").eq("user_id", me).single();
    expect(link?.status).toBe("linked");
    expect(link?.linked_at).toBeTruthy();

    const { data: grants } = await la.from("entitlement_grants").select("entitlement_key, int_value, effective_until").eq("source", "hero_benefit").is("revoked_at", null);
    const keys = (grants ?? []).map((g) => g.entitlement_key);
    expect(keys).toEqual(expect.arrayContaining(["listing.active_limit", "ai.monthly_usage", "ai.poster_exports_monthly", "matchhub.enabled", "ai.roles"]));

    const { data: benefits } = await la.from("hero_benefits").select("ai_monthly_usage, expires_at").single();
    const after = Number((await la.rpc("resolve_entitlement_int", { p_user: me, p_key: "ai.monthly_usage" })).data);
    expect(after).toBe(before + benefits!.ai_monthly_usage);
    expect(new Date(grants![0].effective_until).toISOString()).toBe(new Date(benefits!.expires_at).toISOString());
  });

  it("a second record replaces rather than stacks; an error keeps the state; not-found starts the grace period", async () => {
    const la = await laClient();
    const me = await uid(la);
    await la.rpc("hero_link_record", { p_user: me, ...record("found", "2026-10-14T02:05:00Z") });
    const { data: active } = await la.from("entitlement_grants").select("id").eq("source", "hero_benefit").is("revoked_at", null).eq("entitlement_key", "ai.monthly_usage");
    expect(active).toHaveLength(1);

    const { data: afterError } = await la.rpc("hero_link_record", { p_user: me, ...record("error", null), p_error: "upstream 503" });
    expect(afterError).toBe("linked");

    const { data: afterMissing } = await la.rpc("hero_link_record", { p_user: me, ...record("not_found", null) });
    expect(afterMissing).toBe("stale");
    const { data: g } = await la.from("entitlement_grants").select("effective_until").eq("source", "hero_benefit").is("revoked_at", null).eq("entitlement_key", "ai.monthly_usage").single();
    const { data: b } = await la.from("hero_benefits").select("grace_days").single();
    const daysLeft = (Date.parse(g!.effective_until) - Date.now()) / 86_400_000;
    expect(daysLeft).toBeLessThanOrEqual(b!.grace_days + 0.01);
    expect(daysLeft).toBeGreaterThan(b!.grace_days - 1);
  });

  it("another agent sees nothing and cannot record, grant or unlink for someone else; an admin can read", async () => {
    const la = await laClient();
    const ra = await raClient();
    const admin = await adminClient();
    const me = await uid(la);
    const { data: theirs } = await ra.from("hero_links").select("status").eq("user_id", me);
    expect(theirs ?? []).toHaveLength(0);
    for (const call of [
      ra.rpc("hero_link_record", { p_user: me, ...record("found", "2026-10-14T02:05:00Z") }),
      ra.rpc("grant_hero_benefits", { p_user: me }),
      ra.rpc("hero_unlink", { p_user: me }),
    ]) {
      const { error } = await call;
      expect(error).not.toBeNull();
    }
    const { data: forAdmin } = await admin.from("hero_links").select("status").eq("user_id", me);
    expect(forAdmin).toHaveLength(1);
  });

  it("unlinking ends the benefits now", async () => {
    const la = await laClient();
    const me = await uid(la);
    await la.rpc("hero_link_record", { p_user: me, ...record("found", "2026-10-14T02:05:00Z") });
    const { error } = await la.rpc("hero_unlink", { p_user: me });
    expect(error).toBeNull();
    const { data: live } = await la.from("entitlement_grants").select("id").eq("source", "hero_benefit").is("revoked_at", null).gt("effective_until", new Date().toISOString());
    expect(live ?? []).toHaveLength(0);
    const { data: link } = await la.from("hero_links").select("status").eq("user_id", me).single();
    expect(link?.status).toBe("unlinked");
  });
});
