import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, adminClient, laClient, raClient, uid, hasEnv, hasPairEnv } from "./setup";

/**
 * Migration 00095 — the WhatsApp rules, without Meta.
 *
 * Uses the seeded lead LEAD-2026-900001 (Listing Agent, contact +6281200009901).
 * What must hold: nothing sends while the flag is off; the agent cannot write
 * messages or opt-outs; the account must be on and the number must be a test
 * recipient in test mode; a session text needs an inbound message within 24 h;
 * an inbound message (service) opens the window, attaches to the lead and
 * notifies the agent; STOP opts the number out permanently; outside the window
 * only an approved template passes, and a marketing one needs consent + the
 * marketing switch; statuses update the sent row and never regress; the
 * thread is visible to the lead's agent and admin only. State restored.
 */
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PHONE_NUMBER_ID = "900000000000001";   // fixture; never a real Meta id

describe.skipIf(!hasEnv || !hasPairEnv || !SERVICE)("WhatsApp Cloud scaffold (00095)", () => {
  let service: SupabaseClient; let admin: SupabaseClient; let la: SupabaseClient; let ra: SupabaseClient;
  let laId: string; let leadId: string; let contactId: string; let phone: string; let acctId: string; let country: string;
  const made = { targets: [] as string[], templates: [] as string[], wamids: [] as string[] };
  let acctBefore: { mode: string; phone_number_id: string | null; test_recipients: string[] } | null = null;
  let contactBefore: { wa_last_inbound_at: string | null; marketing_consent: boolean } | null = null;
  let leadBefore: { first_responded_at: string | null; status: string } | null = null;
  let flagsBefore: { key: string; enabled: boolean; targeted: boolean }[] = [];

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    admin = await adminClient(); la = await laClient(); ra = await raClient();
    laId = await uid(la);
    // The cases start from "channel off" whatever staging holds; the prior state comes back in afterAll.
    flagsBefore = ((await service.from("feature_flags").select("key, enabled, targeted").in("key", ["whatsapp_cloud", "whatsapp_marketing"])).data ?? []) as typeof flagsBefore;
    await service.from("feature_flags").update({ enabled: false }).in("key", ["whatsapp_cloud", "whatsapp_marketing"]);
    const { data: lead } = await service.from("leads").select("id, contact_id, first_responded_at, status, contacts(phone, wa_last_inbound_at, marketing_consent)").eq("agent_id", laId).order("created_at", { ascending: false }).limit(1).single();
    leadId = lead!.id; contactId = lead!.contact_id;
    const c = (Array.isArray(lead!.contacts) ? lead!.contacts[0] : lead!.contacts) as { phone: string; wa_last_inbound_at: string | null; marketing_consent: boolean };
    phone = c.phone; contactBefore = { wa_last_inbound_at: c.wa_last_inbound_at, marketing_consent: c.marketing_consent };
    leadBefore = { first_responded_at: lead!.first_responded_at, status: lead!.status };
    const { data: prof } = await service.from("profiles").select("country_code").eq("id", laId).single();
    country = prof!.country_code;
    const { data: acct } = await service.from("wa_accounts").select("id, mode, phone_number_id, test_recipients").eq("country_code", country).single();
    acctId = acct!.id; acctBefore = { mode: acct!.mode, phone_number_id: acct!.phone_number_id, test_recipients: acct!.test_recipients };
  });

  afterAll(async () => {
    for (const w of made.wamids) await service.from("wa_messages").delete().eq("wa_message_id", w);
    await service.from("wa_messages").delete().eq("lead_id", leadId);
    await service.from("lead_events").delete().eq("lead_id", leadId).like("kind", "whatsapp.%");
    await service.from("lead_events").delete().eq("lead_id", leadId).eq("kind", "lead.responded").eq("detail->>via", "whatsapp");
    await service.from("notifications").delete().eq("user_id", laId).eq("kind", "whatsapp_received");
    await service.from("wa_opt_outs").delete().eq("phone", phone);
    for (const id of made.templates) await service.from("wa_templates").delete().eq("id", id);
    for (const id of made.targets) await service.from("feature_flag_targets").delete().eq("id", id);
    for (const f of flagsBefore) await service.from("feature_flags").update({ enabled: f.enabled, targeted: f.targeted }).eq("key", f.key);
    if (acctBefore) await service.from("wa_accounts").update(acctBefore).eq("id", acctId);
    if (contactBefore) await service.from("contacts").update(contactBefore).eq("id", contactId);
    if (leadBefore) await service.from("leads").update(leadBefore).eq("id", leadId);
  });

  const check = (c: SupabaseClient, kind: string, template: string | null = null) =>
    c.rpc("wa_send_check", { p_lead: leadId, p_kind: kind, p_template: template }).then((r) => r.data as string);

  it("flag off → feature_off; an agent cannot write messages, opt-outs or accounts", async () => {
    expect(await check(la, "session")).toBe("feature_off");
    expect((await la.from("wa_messages").insert({ account_id: acctId, direction: "out", kind: "session", from_phone: "x", to_phone: phone })).error).not.toBeNull();
    expect((await la.from("wa_opt_outs").insert({ phone: "+60100000000", source: "agent" })).error).not.toBeNull();
    expect((await la.from("wa_accounts").update({ mode: "live" }).eq("id", acctId).select("id")).data ?? []).toHaveLength(0);
    expect((await la.rpc("wa_record_inbound", { p_phone_number_id: PHONE_NUMBER_ID, p_from: phone, p_wa_message_id: "forged", p_kind: "text", p_body: "x", p_media_type: null, p_ts: new Date().toISOString() })).error).not.toBeNull();
  });

  it("flag on for the agent: no account → no_account; test account without the number → not_test_recipient; then window_closed", async () => {
    const { data: tgt } = await service.from("feature_flag_targets").insert({ flag_key: "whatsapp_cloud", target_type: "user", user_id: laId }).select("id").single();
    made.targets.push(tgt!.id);
    await service.from("feature_flags").update({ enabled: true, targeted: true }).eq("key", "whatsapp_cloud");
    await service.from("wa_accounts").update({ mode: "off", phone_number_id: null, test_recipients: [] }).eq("id", acctId);
    expect(await check(la, "session")).toBe("no_account");

    const { error } = await admin.from("wa_accounts").update({ mode: "test", phone_number_id: PHONE_NUMBER_ID, test_recipients: [] }).eq("id", acctId);
    expect(error).toBeNull();
    expect(await check(la, "session")).toBe("not_test_recipient");

    await admin.from("wa_accounts").update({ test_recipients: [phone] }).eq("id", acctId);
    await service.from("contacts").update({ wa_last_inbound_at: null }).eq("id", contactId);
    expect(await check(la, "session")).toBe("window_closed");
    expect(await check(ra, "session")).toBe("not_your_lead");
  });

  it("an inbound message opens the window, attaches to the lead, notifies the agent; a redelivery is a duplicate", async () => {
    const wamid = `wamid.test.${Date.now()}`;
    made.wamids.push(wamid);
    const { data: out, error } = await service.rpc("wa_record_inbound", { p_phone_number_id: PHONE_NUMBER_ID, p_from: phone, p_wa_message_id: wamid, p_kind: "text", p_body: "Boleh viewing Sabtu?", p_media_type: null, p_ts: new Date().toISOString() });
    expect(error, error?.message).toBeNull();
    expect(out).toBe("matched");
    expect((await service.rpc("wa_record_inbound", { p_phone_number_id: PHONE_NUMBER_ID, p_from: phone, p_wa_message_id: wamid, p_kind: "text", p_body: "again", p_media_type: null, p_ts: new Date().toISOString() })).data).toBe("duplicate");
    expect((await service.rpc("wa_record_inbound", { p_phone_number_id: "000", p_from: phone, p_wa_message_id: "x" + wamid, p_kind: "text", p_body: "x", p_media_type: null, p_ts: null })).data).toBe("unknown_account");
    // A number nobody knows is recorded with no lead for the admin inbox, and nobody is messaged (00096).
    const strangerId = `wamid.stranger.${Date.now()}`;
    made.wamids.push(strangerId);
    const { data: stranger, error: sErr } = await service.rpc("wa_record_inbound", { p_phone_number_id: PHONE_NUMBER_ID, p_from: "+60199990000", p_wa_message_id: strangerId, p_kind: "text", p_body: "Still available?", p_media_type: null, p_ts: null });
    expect(sErr, sErr?.message).toBeNull();
    expect(stranger).toBe("unmatched");
    expect((await admin.from("wa_messages").select("lead_id, contact_id").eq("wa_message_id", strangerId).single()).data).toMatchObject({ lead_id: null, contact_id: null });

    const { data: msg } = await la.from("wa_messages").select("direction, kind, body, lead_id, agent_id, status").eq("wa_message_id", wamid).single();
    expect(msg).toMatchObject({ direction: "in", kind: "text", lead_id: leadId, agent_id: laId, status: "received" });
    expect((await ra.from("wa_messages").select("id").eq("wa_message_id", wamid)).data ?? []).toHaveLength(0);
    expect((await admin.from("wa_messages").select("id").eq("wa_message_id", wamid)).data).toHaveLength(1);
    const { data: n } = await la.from("notifications").select("id").eq("kind", "whatsapp_received").eq("user_id", laId);
    expect((n ?? []).length).toBeGreaterThanOrEqual(1);
    expect(await check(la, "session")).toBe("ok");
  });

  it("recording a send stamps the first response and the status webhook updates it without regressing", async () => {
    await service.from("leads").update({ first_responded_at: null, status: "new" }).eq("id", leadId);
    const wamid = `wamid.out.${Date.now()}`;
    made.wamids.push(wamid);
    const { data: id, error } = await service.rpc("wa_record_outbound", { p_lead: leadId, p_kind: "session", p_template: null, p_body: "Boleh, Sabtu jam 10?", p_wa_message_id: wamid, p_status: "sent", p_error: null });
    expect(error, error?.message).toBeNull();
    expect(id).toBeTruthy();
    const { data: lead } = await service.from("leads").select("first_responded_at, status").eq("id", leadId).single();
    expect(lead!.first_responded_at).toBeTruthy();
    expect(lead!.status).toBe("contacted");

    expect((await service.rpc("wa_record_status", { p_wa_message_id: wamid, p_status: "read", p_error: null, p_pricing: "service", p_conversation: "c1", p_ts: null })).data).toBe("updated");
    expect((await service.rpc("wa_record_status", { p_wa_message_id: wamid, p_status: "delivered", p_error: null, p_pricing: null, p_conversation: null, p_ts: null })).data).toBe("updated");
    const { data: m } = await la.from("wa_messages").select("status, pricing_category, conversation_id").eq("wa_message_id", wamid).single();
    expect(m).toMatchObject({ status: "read", pricing_category: "service", conversation_id: "c1" });   // late 'delivered' did not regress 'read'
    expect((await service.rpc("wa_record_status", { p_wa_message_id: "wamid.nobody", p_status: "sent", p_error: null, p_pricing: null, p_conversation: null, p_ts: null })).data).toBe("unknown_message");
  });

  it("outside the window: template rules — unknown, not approved, approved utility ok, marketing needs switch + consent", async () => {
    await service.from("contacts").update({ wa_last_inbound_at: new Date(Date.now() - 25 * 3_600_000).toISOString(), marketing_consent: false }).eq("id", contactId);
    expect(await check(la, "session")).toBe("window_closed");

    const { data: t1 } = await admin.from("wa_templates").insert({ account_id: acctId, name: "fx_viewing_reminder", language: "id", category: "utility", status: "pending", body: "Halo {{1}}, kunjungan {{2}} dikonfirmasi.", variables: 2 }).select("id").single();
    made.templates.push(t1!.id);
    expect(await check(la, "template", "00000000-0000-0000-0000-000000000000")).toBe("template_unknown");
    expect(await check(la, "template", t1!.id)).toBe("template_not_approved");
    // An agent cannot see a pending template, only an approved one.
    expect((await la.from("wa_templates").select("id").eq("id", t1!.id)).data ?? []).toHaveLength(0);
    await admin.from("wa_templates").update({ status: "approved" }).eq("id", t1!.id);
    expect((await la.from("wa_templates").select("id").eq("id", t1!.id)).data).toHaveLength(1);
    expect(await check(la, "template", t1!.id)).toBe("ok");

    const { data: t2 } = await admin.from("wa_templates").insert({ account_id: acctId, name: "fx_new_launch", language: "id", category: "marketing", status: "approved", body: "Proyek baru {{1}} dibuka, {{2}}.", variables: 2 }).select("id").single();
    made.templates.push(t2!.id);
    expect(await check(la, "template", t2!.id)).toBe("marketing_not_approved");
    await service.from("feature_flags").update({ enabled: true, targeted: false }).eq("key", "whatsapp_marketing");
    expect(await check(la, "template", t2!.id)).toBe("no_marketing_consent");
    await service.from("contacts").update({ marketing_consent: true }).eq("id", contactId);
    expect(await check(la, "template", t2!.id)).toBe("ok");
    await service.from("feature_flags").update({ enabled: false }).eq("key", "whatsapp_marketing");
    expect(await check(la, "template", t2!.id)).toBe("marketing_not_approved");
  });

  it("STOP opts the number out permanently: everything is refused afterwards, and nobody can undo it through the API", async () => {
    const wamid = `wamid.stop.${Date.now()}`;
    made.wamids.push(wamid);
    expect((await service.rpc("wa_record_inbound", { p_phone_number_id: PHONE_NUMBER_ID, p_from: phone, p_wa_message_id: wamid, p_kind: "text", p_body: " stop ", p_media_type: null, p_ts: new Date().toISOString() })).data).toBe("opted_out");
    expect(await check(la, "session")).toBe("opted_out");
    expect(await check(la, "template", made.templates[0])).toBe("opted_out");
    const { data: rows } = await admin.from("wa_opt_outs").select("phone, source").eq("phone", phone);
    expect(rows?.[0]).toMatchObject({ source: "inbound_stop" });
    expect((await admin.from("wa_opt_outs").delete().eq("phone", phone).select("phone")).data ?? []).toHaveLength(0);   // no delete policy, even for admin
    expect((await ra.from("wa_opt_outs").select("phone")).data ?? []).toHaveLength(0);
  });
});
