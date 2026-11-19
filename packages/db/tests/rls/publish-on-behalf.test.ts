import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, hasEnv, fixtureEmail, fixtureName } from "./setup";

/**
 * Migration 00133: an admin publishes an agent's prepared import on their
 * behalf, with the agent's recorded consent (lifts D-2).
 *
 *   · without a publish_on_behalf consent the admin cannot commit;
 *   · with it, admin_import_batch_commit_authorise stamps the consent and the
 *     admin once, audits and notifies the agent; a second call is refused;
 *   · another country's admin cannot; nobody can stamp the columns by hand;
 *   · the preparing admin may approve a listing committed on behalf, but not
 *     after the agent withdraws consent, and never for an ordinary prepared
 *     batch (separation of duties unchanged).
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("admin publishes on the agent's behalf (00133)", () => {
  let service: SupabaseClient;
  const users: string[] = [];
  const grants: string[] = [];
  const batches: string[] = [];
  const listings: string[] = [];
  const props: string[] = [];
  let seq = 0;

  async function person(tag: string) {
    const email = fixtureEmail(`b133-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { display_name: fixtureName(`b133 ${tag}`), country_code: "ID" },
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
  async function preparedBatch(adm: SupabaseClient, agentId: string) {
    const { data: b, error } = await adm.rpc("admin_import_batch_create", {
      p_agent: agentId, p_source_kind: "excel", p_source_portal: "spreadsheet", p_source_label: fixtureName("b133 batch"), p_status: "ready",
    });
    if (error) throw new Error(`batch: ${error.message}`);
    batches.push(b as string);
    const { error: iErr } = await adm.from("import_items").insert({ batch_id: b, source_url: `https://example.test/b133-${Date.now()}-${seq++}`, status: "ready", extracted: { title: "Rumah uji", price: 1000000000 } });
    if (iErr) throw new Error(`item: ${iErr.message}`);
    return b as string;
  }
  /** A pending_review listing linked to the batch, as the Hub's commit would write it. */
  async function listingFrom(batchId: string, agentId: string) {
    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: p } = await service.from("properties").insert({ human_readable_id: hp, agent_id: agentId, country_code: "ID", property_category: "residential", property_type: "rumah", measurement_unit: "sqm", created_by: agentId }).select("id").single();
    props.push(p!.id);
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: l, error } = await service.from("listings").insert({ human_readable_id: hl, property_id: p!.id, agent_id: agentId, listing_type: "sale", status: "pending_review", moderation_state: "pending", currency: "IDR", price: 1000000000, language: "id", title: fixtureName("b133 listing"), slug: `fixture-b133-${p!.id.slice(0, 8)}`, created_by: agentId, creation_source: "import" }).select("id").single();
    if (error) throw new Error(error.message);
    listings.push(l!.id);
    await service.from("import_items").update({ status: "imported", listing_id: l!.id, property_id: p!.id }).eq("batch_id", batchId);
    return l!.id as string;
  }
  const consent = (userId: string, scopes: string[], status = "given") => service.from("agent_onboarding_consents").insert({
    user_id: userId, country_code: "ID", method: "phone_call", consented_at: new Date().toISOString(), scopes,
    wording: "The agent agreed that the platform may: test.", language: "en", status,
  });
  const approve = (c: SupabaseClient, id: string) =>
    c.from("listings").update({ moderation_state: "approved", status: "published", published_at: new Date().toISOString() }).eq("id", id).select("id");

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    if (!service) return;
    if (batches.length) {
      await service.from("import_items").delete().in("batch_id", batches);
      await service.from("import_batches").delete().in("id", batches);
    }
    for (const l of listings) {
      await service.from("listing_status_history").delete().eq("listing_id", l);
      await service.from("listings").delete().eq("id", l);
    }
    for (const p of props) await service.from("properties").delete().eq("id", p);
    if (users.length) await service.from("agent_onboarding_consents").delete().in("user_id", users);
    for (const g of grants) await service.from("user_roles").delete().eq("id", g);
    for (const u of users) {
      await service.from("notifications").delete().eq("user_id", u);
      const { error } = await service.auth.admin.deleteUser(u);
      if (error) console.error(`publish-on-behalf cleanup: ${u}: ${error.message}`);
    }
  });

  it("without the agent's consent the admin cannot commit", async () => {
    const adm = await admin("noconsent-admin", ["ID"]);
    const agent = await person("noconsent-agent");
    const b = await preparedBatch(adm.c, agent.id);
    await consent(agent.id, ["open_account", "import_listings"]);
    expect((await adm.c.rpc("admin_can_commit_for_batch", { p_batch: b })).data).toBe(false);
    expect((await adm.c.rpc("admin_import_batch_commit_authorise", { p_batch: b })).data).toMatchObject({ ok: false, error: "no_consent" });
  });

  it("with consent: stamped once, audited, agent notified; another country's admin is refused", async () => {
    const adm = await admin("ok-admin", ["ID"]);
    const myAdm = await admin("ok-my-admin", ["MY"]);
    const agent = await person("ok-agent");
    const b = await preparedBatch(adm.c, agent.id);
    await consent(agent.id, ["open_account", "publish_on_behalf"]);
    expect((await myAdm.c.rpc("admin_import_batch_commit_authorise", { p_batch: b })).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await adm.c.rpc("admin_can_commit_for_batch", { p_batch: b })).data).toBe(true);
    expect((await adm.c.rpc("admin_import_batch_commit_authorise", { p_batch: b })).data).toMatchObject({ ok: true, agent: agent.id });
    const { data: row } = await service.from("import_batches").select("on_behalf_consent_id, committed_on_behalf_by").eq("id", b).single();
    expect(row?.on_behalf_consent_id).toBeTruthy();
    expect(row?.committed_on_behalf_by).toBe(adm.id);
    expect((await adm.c.rpc("admin_import_batch_commit_authorise", { p_batch: b })).data).toMatchObject({ ok: false, error: "already_committed" });
    const { data: audit } = await service.from("audit_logs").select("actor_id").eq("action", "listing_import.assisted_committed_on_behalf").eq("entity_id", b);
    expect(audit?.[0]?.actor_id).toBe(adm.id);
    expect(((await service.from("notifications").select("id").eq("user_id", agent.id).eq("kind", "listing_import.committed_on_behalf")).data ?? []).length).toBe(1);
  });

  it("nobody can stamp the on-behalf columns by hand", async () => {
    const adm = await admin("hand-admin", ["ID"]);
    const agent = await person("hand-agent");
    const b = await preparedBatch(adm.c, agent.id);
    const { data: c } = await consent(agent.id, ["open_account", "publish_on_behalf"]).select("id").single();
    const r1 = await adm.c.from("import_batches").update({ on_behalf_consent_id: c!.id, committed_on_behalf_by: adm.id }).eq("id", b).select("id");
    expect(r1.error !== null || (r1.data ?? []).length === 0).toBe(true);
    const r2 = await agent.c.from("import_batches").update({ on_behalf_consent_id: c!.id }).eq("id", b).select("id");
    expect(r2.error !== null || (r2.data ?? []).length === 0).toBe(true);
    expect((await service.from("import_batches").select("on_behalf_consent_id").eq("id", b).single()).data?.on_behalf_consent_id).toBeNull();
  });

  it("the preparing admin may approve an on-behalf listing, until consent is withdrawn", async () => {
    const adm = await admin("sod-admin", ["ID"]);
    const agent = await person("sod-agent");
    // An ordinary prepared batch: the two-person rule still applies.
    const plain = await preparedBatch(adm.c, agent.id);
    const plainListing = await listingFrom(plain, agent.id);
    expect((await approve(adm.c, plainListing)).error?.message ?? "").toMatch(/separation_of_duties/);
    // Committed on the agent's behalf: the same admin may approve.
    await consent(agent.id, ["open_account", "publish_on_behalf"]);
    const b = await preparedBatch(adm.c, agent.id);
    expect((await adm.c.rpc("admin_import_batch_commit_authorise", { p_batch: b })).data).toMatchObject({ ok: true });
    const l1 = await listingFrom(b, agent.id);
    expect((await approve(adm.c, l1)).error).toBeNull();
    // After the agent withdraws consent, the rule is back.
    const b2 = await preparedBatch(adm.c, agent.id);
    expect((await adm.c.rpc("admin_import_batch_commit_authorise", { p_batch: b2 })).data).toMatchObject({ ok: true });
    const l2 = await listingFrom(b2, agent.id);
    await new Promise((r) => setTimeout(r, 20));
    await consent(agent.id, ["publish_on_behalf"], "withdrawn");
    expect((await approve(adm.c, l2)).error?.message ?? "").toMatch(/separation_of_duties/);
  });

  it("an agent can withdraw or mark sold a live listing (00051 notice trigger fix), but cannot call the notifier directly", async () => {
    const agent = await person("live");
    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: p } = await service.from("properties").insert({ human_readable_id: hp, agent_id: agent.id, country_code: "ID", property_category: "residential", property_type: "rumah", measurement_unit: "sqm", created_by: agent.id }).select("id").single();
    props.push(p!.id);
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: l } = await service.from("listings").insert({ human_readable_id: hl, property_id: p!.id, agent_id: agent.id, listing_type: "sale", status: "published", moderation_state: "approved", currency: "IDR", price: 1000, language: "id", title: fixtureName("b133 live"), slug: `fixture-b133-live-${p!.id.slice(0, 8)}`, created_by: agent.id }).select("id").single();
    listings.push(l!.id);
    const r = await agent.c.from("listings").update({ status: "withdrawn" }).eq("id", l!.id).select("id");
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1);
    expect((await agent.c.rpc("notify_comarketing_agents", { p_listing_id: l!.id, p_kind: "x", p_payload: {} })).error).not.toBeNull();
  });
});
