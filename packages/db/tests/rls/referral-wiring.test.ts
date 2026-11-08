import { it, expect } from "vitest";

/**
 * The referral loop, end to end, against the live database.
 *
 * Every other growth test exercises one function. This one walks the whole
 * path a real agent takes — issue a code, share it, someone signs up with it,
 * they verify, they publish, the referrer gets paid — because the parts can
 * each be correct while the wiring between them is missing, which is exactly
 * what was true before migration 00064: the engine could score and pay, and
 * nothing ever called it.
 *
 * It also pins the two refusals that protect a free-capacity campaign: a
 * signup cannot be claimed twice, and nobody can refer themselves.
 */
import { createClient } from "@supabase/supabase-js";
import { fixtureEmail, fixtureName } from "./setup";

// The harness import above already loaded PG_ENV_FILE into process.env; this
// file used to read `.env.production` by name, which is exactly the hard-coded
// target the staging move removes.
const env = process.env as Record<string, string>;

it("referral wiring: code → join → attribute → activate → pay", async () => {
  const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  const mk = async (tag: string) => {
    // Marked, so tests/teardown.ts can sweep it if this test dies mid-walk —
    // which matters more here than anywhere else, because this is the one test
    // that deliberately runs the whole funnel and has the most to leave behind.
    const email = fixtureEmail(`wire-${tag}`);
    const pw = `Wire!${Date.now()}aA`;
    const { data, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (error) throw new Error(error.message);
    await svc.from("profiles")
      .upsert({ id: data.user.id, display_name: fixtureName(`wire ${tag}`), agent_status: "draft" });
    return { id: data.user.id, email, pw };
  };

  const referrer = await mk("referrer");
  const invitee = await mk("invitee");
  const cleanup: string[] = [];

  try {
    // 1. Referrer asks for their code (as themselves).
    const rc = anon();
    await rc.auth.signInWithPassword({ email: referrer.email, password: referrer.pw });
    const { data: code, error: ce } = await rc.rpc("ensure_referral_code");
    expect(ce).toBeNull();
    expect(String(code)).toMatch(/^[A-Z2-9]{7}$/);

    // Idempotent.
    const { data: again } = await rc.rpc("ensure_referral_code");
    expect(again).toBe(code);

    // 2. Invitee attaches it (as themselves), simulating signUp.
    const ic = anon();
    await ic.auth.signInWithPassword({ email: invitee.email, password: invitee.pw });
    const { data: attached } = await ic.rpc("attach_referral", { p_code: code });
    expect(attached).toBe(true);

    // 3. Cannot be claimed twice.
    const { data: twice } = await ic.rpc("attach_referral", { p_code: code });
    expect(twice).toBe(false);

    // 4. Self-referral refused.
    const { data: self } = await rc.rpc("attach_referral", { p_code: code });
    expect(self).toBe(false);

    const before = Number((await svc.rpc("resolve_entitlement_int", { p_user: referrer.id, p_key: "listing.active_limit" })).data);

    // 5. Verification alone does not pay — the trigger fires, nothing happens.
    await svc.from("profiles").update({ agent_status: "verified" }).eq("id", invitee.id);
    const midStage = (await svc.from("referrals").select("stage").eq("referred_id", invitee.id).single()).data?.stage;
    expect(midStage).toBe("VERIFIED");
    expect(Number((await svc.rpc("resolve_entitlement_int", { p_user: referrer.id, p_key: "listing.active_limit" })).data)).toBe(before);

    // 6. A published listing fires the other trigger and pays.
    const { data: hidP } = await svc.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: prop } = await svc.from("properties").insert({
      human_readable_id: hidP, agent_id: invitee.id, country_code: "ID",
      property_category: "residential", property_type: "rumah",
      measurement_unit: "sqm", created_by: invitee.id,
    }).select("id").single();
    const { data: hidL } = await svc.rpc("next_human_id", { p_prefix: "LST" });
    const { data: lst } = await svc.from("listings").insert({
      human_readable_id: hidL, property_id: prop!.id, agent_id: invitee.id,
      listing_type: "sale", status: "published", moderation_state: "approved",
      currency: "IDR", price: 1e8, language: "id", title: "wire", description: "wire",
      slug: `wire-${Date.now()}`, created_by: invitee.id,
    }).select("id").single();
    cleanup.push(lst!.id);

    const finalStage = (await svc.from("referrals").select("stage").eq("referred_id", invitee.id).single()).data?.stage;
    expect(finalStage).toBe("ACTIVATED");

    const after = Number((await svc.rpc("resolve_entitlement_int", { p_user: referrer.id, p_key: "listing.active_limit" })).data);
    expect(after).toBe(before + 5);
    console.log(`WIRED code=${code} capacity ${before} → ${after}`);

    // 7. The agent's own summary reflects it.
    const { data: sum } = await rc.rpc("my_growth_summary");
    expect(Number((sum as { activated: number }[])[0].activated)).toBe(1);
  } finally {
    for (const id of cleanup) await svc.from("listings").delete().eq("id", id);
    await svc.from("properties").delete().eq("agent_id", invitee.id);
    await svc.from("referrals").delete().eq("referred_id", invitee.id);
    const { data: rw } = await svc.from("referral_rewards").select("id, grant_id").eq("user_id", referrer.id);
    for (const r of rw ?? []) {
      if (r.grant_id) await svc.from("entitlement_grants").delete().eq("id", r.grant_id);
      await svc.from("referral_rewards").delete().eq("id", r.id);
    }
    await svc.from("referral_codes").delete().eq("user_id", referrer.id);
    await svc.auth.admin.deleteUser(referrer.id);
    await svc.auth.admin.deleteUser(invitee.id);
  }
}, 90000);
