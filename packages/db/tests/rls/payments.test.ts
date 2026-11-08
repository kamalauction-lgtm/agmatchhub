import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, adminClient, laClient, raClient, uid, hasEnv, hasPairEnv } from "./setup";

/**
 * Migration 00094 — the payments scaffold, without a gateway.
 *
 * What must hold: nothing is for sale while the `payments` flag is off; an
 * agent cannot write an intent, an amount, an event, or settle anything; the
 * amount comes from the price list; a sandbox gateway cannot be made live
 * under FREE_LAUNCH; a settled subscription intent replaces the live agent
 * plan and writes subscription_events; a settled top-up grants exactly the
 * pack's credits through the wallet; settling twice is a no-op; an amount
 * that does not match is refused; the webhook log is admin-only.
 *
 * Staging state is restored afterwards: flag target removed, Midtrans back to
 * 'off', the fixture subscription and intents deleted, credits spent back.
 */
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !hasPairEnv || !SERVICE)("payments scaffold (00094)", () => {
  let service: SupabaseClient;
  let admin: SupabaseClient;
  let la: SupabaseClient;
  let ra: SupabaseClient;
  let laId: string;
  let laCountry: string | null = null;
  let midtransModeBefore = "off";
  let proIdr: string;                      // current IDR version of the Pro plan
  const made = { intents: [] as string[], subs: [] as string[], targets: [] as string[], packPrice: false };

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    admin = await adminClient();
    la = await laClient();
    ra = await raClient();
    laId = await uid(la);
    const { data: prof } = await service.from("profiles").select("country_code").eq("id", laId).single();
    laCountry = prof?.country_code ?? null;
    await service.from("profiles").update({ country_code: "ID" }).eq("id", laId);   // IDR → Midtrans
    const { data: pv } = await service.from("plan_versions").select("id, plans!inner(key)").eq("currency", "IDR").eq("is_current", true).eq("plans.key", "gold").single();
    proIdr = pv!.id;
    const { data: prov } = await service.from("payment_providers").select("mode").eq("key", "midtrans").single();
    midtransModeBefore = prov!.mode;
  });

  afterAll(async () => {
    for (const id of made.subs) await service.from("subscriptions").delete().eq("id", id);
    for (const id of made.intents) await service.from("payment_events").delete().eq("intent_id", id);
    for (const id of made.intents) await service.from("payment_intents").delete().eq("id", id);
    for (const id of made.targets) await service.from("feature_flag_targets").delete().eq("id", id);
    if (made.packPrice) await service.from("credit_pack_prices").delete().eq("pack_key", "ai_25").eq("currency", "IDR");
    await service.from("payment_providers").update({ mode: midtransModeBefore }).eq("key", "midtrans");
    await service.from("profiles").update({ country_code: laCountry }).eq("id", laId);
    const { data: w } = await service.from("credit_wallets").select("balance").eq("agent_id", laId).eq("kind", "ai").maybeSingle();
    if (w && w.balance > 0) await service.rpc("credit_spend", { p_agent: laId, p_kind: "ai", p_amount: w.balance, p_reason: "adjustment", p_note: "test cleanup" });
  });

  it("with the flag off nothing can be bought, and no gateway is offered", async () => {
    const { data: flag } = await service.from("feature_flags").select("enabled, targeted").eq("key", "payments").single();
    expect(flag).toMatchObject({ enabled: false });                     // production default, untouched
    const { error } = await la.rpc("payment_intent_create", { p_kind: "subscription", p_plan_version_id: proIdr, p_cadence: "monthly", p_pack_key: null });
    expect(error?.message).toMatch(/not enabled/);
    const { data: prov } = await la.rpc("payment_provider_for", { p_user: laId });
    expect(prov ?? []).toHaveLength(0);
  });

  it("an agent cannot write intents, events or provider modes; a sandbox gateway cannot go live under FREE_LAUNCH", async () => {
    const { error: ins } = await la.from("payment_intents").insert({ user_id: laId, provider_key: "midtrans", mode: "sandbox", kind: "topup", pack_key: "ai_25", currency: "IDR", amount: 1 });
    expect(ins).not.toBeNull();
    const { error: ev } = await la.from("payment_events").insert({ provider_key: "midtrans", event_type: "x", signature_valid: true, outcome: "forged" });
    expect(ev).not.toBeNull();
    const { error: settle } = await la.rpc("payment_intent_settle", { p_intent: laId, p_status: "paid", p_amount: 1, p_currency: "IDR" });
    expect(settle).not.toBeNull();
    const { data: upd } = await la.from("payment_providers").update({ mode: "sandbox" }).eq("key", "midtrans").select("mode");
    expect(upd ?? []).toHaveLength(0);                                   // RLS: no row updated

    const { data: billing } = await service.from("commercial_settings").select("billing_mode").single();
    expect(billing?.billing_mode).toBe("FREE_LAUNCH");
    const { error: live } = await admin.from("payment_providers").update({ mode: "live" }).eq("key", "midtrans");
    expect(live?.message).toMatch(/LIVE_BILLING/);
    const { error: sandbox } = await admin.from("payment_providers").update({ mode: "sandbox" }).eq("key", "midtrans");
    expect(sandbox).toBeNull();
  });

  it("flag on for this agent + sandbox gateway → an intent priced from the list; an unpriced pack is refused", async () => {
    const { data: tgt } = await service.from("feature_flag_targets").insert({ flag_key: "payments", target_type: "user", user_id: laId }).select("id").single();
    made.targets.push(tgt!.id);
    await service.from("feature_flags").update({ enabled: true, targeted: true }).eq("key", "payments");
    try {
      expect((await la.rpc("is_feature_enabled", { p_key: "payments", p_user: laId })).data).toBe(true);
      expect((await ra.rpc("is_feature_enabled", { p_key: "payments", p_user: await uid(ra) })).data).toBe(false);   // targeted: not for others

      const { data: prov } = await la.rpc("payment_provider_for", { p_user: laId });
      expect(prov?.[0]).toMatchObject({ key: "midtrans", mode: "sandbox", currency: "IDR" });

      const { data: id, error } = await la.rpc("payment_intent_create", { p_kind: "subscription", p_plan_version_id: proIdr, p_cadence: "annual", p_pack_key: null });
      expect(error, error?.message).toBeNull();
      made.intents.push(id as string);
      const { data: pv } = await service.from("plan_versions").select("annual_price").eq("id", proIdr).single();
      const { data: intent } = await la.from("payment_intents").select("*").eq("id", id as string).single();
      expect(intent).toMatchObject({ status: "created", mode: "sandbox", provider_key: "midtrans", currency: "IDR", kind: "subscription", cadence: "annual" });
      expect(Number(intent!.amount)).toBe(Number(pv!.annual_price));
      expect(intent!.human_readable_id).toMatch(/^PAY-\d{4}-\d{6}$/);

      // Another agent sees nothing of it.
      const { data: theirs } = await ra.from("payment_intents").select("id").eq("id", id as string);
      expect(theirs ?? []).toHaveLength(0);
      // Admin does.
      const { data: forAdmin } = await admin.from("payment_intents").select("id").eq("id", id as string);
      expect(forAdmin).toHaveLength(1);

      const { error: unpriced } = await la.rpc("payment_intent_create", { p_kind: "topup", p_plan_version_id: null, p_cadence: "monthly", p_pack_key: "ai_25" });
      expect(unpriced?.message).toMatch(/not priced/);
      const { error: wrongCur } = await la.rpc("payment_intent_create", {
        p_kind: "subscription", p_cadence: "monthly", p_pack_key: null,
        p_plan_version_id: (await service.from("plan_versions").select("id").eq("currency", "USD").eq("is_current", true).limit(1).single()).data!.id,
      });
      expect(wrongCur?.message).toMatch(/not a current agent plan in IDR/);
    } finally {
      // leave the flag ON + targeted for the remaining cases; restored in the last test
    }
  });

  it("settling: wrong amount refused; paid once replaces the plan and writes events; paid twice is a no-op", async () => {
    const intentId = made.intents[0];
    const { data: intent } = await service.from("payment_intents").select("amount, plan_version_id, user_id").eq("id", intentId).single();

    const { data: mismatch } = await service.rpc("payment_intent_settle", { p_intent: intentId, p_status: "paid", p_amount: 1, p_currency: "IDR" });
    expect(mismatch).toBe("amount_mismatch");
    expect((await service.from("payment_intents").select("status").eq("id", intentId).single()).data?.status).toBe("created");

    const livBefore = (await service.from("subscriptions").select("id").eq("user_id", laId).eq("family", "agent").in("status", ["trial", "active", "complimentary", "grace"])).data ?? [];
    const { data: paid, error } = await service.rpc("payment_intent_settle", { p_intent: intentId, p_status: "paid", p_amount: Number(intent!.amount), p_currency: "idr", p_provider_ref: "tx-fixture-1" });
    expect(error, error?.message).toBeNull();
    expect(paid).toBe("paid");

    const { data: after } = await service.from("payment_intents").select("status, paid_at, fulfilled_at, subscription_id, provider_ref").eq("id", intentId).single();
    expect(after).toMatchObject({ status: "paid", provider_ref: "tx-fixture-1" });
    expect(after!.subscription_id).toBeTruthy();
    made.subs.push(after!.subscription_id!);

    const { data: sub } = await la.from("subscriptions").select("status, plan_version_id, cadence, renews_at, source_label, family").eq("id", after!.subscription_id!).single();
    expect(sub).toMatchObject({ status: "active", plan_version_id: intent!.plan_version_id, cadence: "annual", family: "agent" });
    expect(sub!.source_label).toMatch(/sandbox/);
    expect(Date.parse(sub!.renews_at!) - Date.now()).toBeGreaterThan(360 * 86_400_000);
    for (const old of livBefore) expect((await service.from("subscriptions").select("status").eq("id", old.id).single()).data?.status).toBe("cancelled");

    const { data: events } = await admin.from("subscription_events").select("event").eq("subscription_id", after!.subscription_id!);
    expect(events?.map((e) => e.event)).toContain("created");
    // The resolver now answers from the bought plan.
    expect((await la.rpc("current_plan_version", { p_user: laId })).data).toBe(intent!.plan_version_id);

    const { data: again } = await service.rpc("payment_intent_settle", { p_intent: intentId, p_status: "paid", p_amount: Number(intent!.amount), p_currency: "IDR" });
    expect(again).toBe("already_paid");
    expect((await service.from("subscriptions").select("id").eq("user_id", laId).eq("status", "active")).data).toHaveLength(1);
  });

  it("a priced pack → top-up intent; settling grants exactly the pack's credits, once", async () => {
    await admin.from("credit_pack_prices").upsert({ pack_key: "ai_25", currency: "IDR", price: 99000 });
    made.packPrice = true;
    const before = Number((await la.rpc("credit_balance", { p_agent: laId, p_kind: "ai" })).data);
    const { data: id, error } = await la.rpc("payment_intent_create", { p_kind: "topup", p_plan_version_id: null, p_cadence: "monthly", p_pack_key: "ai_25" });
    expect(error, error?.message).toBeNull();
    made.intents.push(id as string);
    expect(Number((await la.from("payment_intents").select("amount").eq("id", id as string).single()).data?.amount)).toBe(99000);

    // The owner can abandon it; a stranger cannot.
    const { data: notMine } = await ra.rpc("payment_intent_cancel", { p_intent: id as string });
    expect(notMine).toBe(false);

    expect((await service.rpc("payment_intent_settle", { p_intent: id as string, p_status: "paid", p_amount: 99000, p_currency: "IDR" })).data).toBe("paid");
    expect(Number((await la.rpc("credit_balance", { p_agent: laId, p_kind: "ai" })).data)).toBe(before + 25);
    const { data: tx } = await la.from("credit_transactions").select("reason, delta, ref_type, ref_id").eq("agent_id", laId).eq("kind", "ai").order("created_at", { ascending: false }).limit(1);
    expect(tx?.[0]).toMatchObject({ reason: "topup", delta: 25, ref_type: "payment_intent", ref_id: id });
    expect((await service.rpc("payment_intent_settle", { p_intent: id as string, p_status: "paid", p_amount: 99000, p_currency: "IDR" })).data).toBe("already_paid");
    expect(Number((await la.rpc("credit_balance", { p_agent: laId, p_kind: "ai" })).data)).toBe(before + 25);
  });

  it("a pending intent can fail or expire but never be paid after; the event log is admin-only; the flag is put back", async () => {
    const { data: id } = await la.rpc("payment_intent_create", { p_kind: "topup", p_plan_version_id: null, p_cadence: "monthly", p_pack_key: "ai_25" });
    made.intents.push(id as string);
    await service.rpc("payment_intent_checkout", { p_intent: id, p_provider_ref: "snap-token-1", p_checkout_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/x", p_failure: null });
    expect((await service.from("payment_intents").select("status").eq("id", id as string).single()).data?.status).toBe("pending");
    expect((await service.rpc("payment_intent_settle", { p_intent: id, p_status: "expired", p_amount: null, p_currency: null })).data).toBe("expired");
    expect((await service.rpc("payment_intent_settle", { p_intent: id, p_status: "paid", p_amount: 99000, p_currency: "IDR" })).data).toBe("not_pending");

    // Time-based expiry closes a stale open intent.
    const { data: stale } = await la.rpc("payment_intent_create", { p_kind: "topup", p_plan_version_id: null, p_cadence: "monthly", p_pack_key: "ai_25" });
    made.intents.push(stale as string);
    await service.from("payment_intents").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", stale as string);
    expect(Number((await service.rpc("payment_intents_expire")).data)).toBeGreaterThanOrEqual(1);
    expect((await service.from("payment_intents").select("status").eq("id", stale as string).single()).data?.status).toBe("expired");
    const { error: agentExpire } = await la.rpc("payment_intents_expire");
    expect(agentExpire).not.toBeNull();

    await service.from("payment_events").insert({ provider_key: "midtrans", provider_event_id: `fx-${Date.now()}`, intent_id: id, event_type: "transaction.expire", signature_valid: true, outcome: "expired" });
    expect((await la.from("payment_events").select("id").eq("intent_id", id as string)).data ?? []).toHaveLength(0);
    expect((await admin.from("payment_events").select("id").eq("intent_id", id as string)).data).toHaveLength(1);

    await service.from("feature_flags").update({ enabled: false, targeted: false }).eq("key", "payments");
    expect((await service.from("feature_flags").select("enabled").eq("key", "payments").single()).data?.enabled).toBe(false);
  });
});
