/**
 * DEMO data for testing Admin Platform 2.0 together on STAGING (screens 2, 8
 * and 14, and the screens they feed).
 *
 *   node scripts/seed-staging-admin-demo.mjs --env=staging            # (re)create
 *   node scripts/seed-staging-admin-demo.mjs --env=staging --remove   # delete only DEMO rows
 *
 * What it creates, for Malaysia (MY) and Indonesia (ID):
 *   · four DEMO agents ("[DEMO] …", emails @demo.propertiguru.test, no phone,
 *     no WhatsApp — nothing can be sent to them);
 *   · recruiting prospects at every stage ("[DEMO] …", fictional
 *     +60 12-000 / +62 812-0000 numbers, @example.test emails);
 *   · four registered sources (keys "demo-…") with different terms reviews and
 *     field mappings;
 *   · DEMO listings, assisted import batches with 8 weeks of history
 *     (prepared → handed over → complete / in review / preparing), change
 *     requests with answer times, and invitations (redeemed, pending,
 *     revoked), so /admin/handover/report shows meaningful figures.
 * Notifications, emails and WhatsApp: none. Rows are written directly with the
 * service role, never through the Hub's notify path; completion is set
 * directly, not through the function that notifies the agent.
 * Retention: if MY or ID has no prospect retention period, this sets 90 days
 * (staging only) and marks it, so --remove can unset exactly what it set.
 *
 * Safe to rerun: every run first removes the previous DEMO rows. Refuses any
 * project other than staging (aylzekkeurjsudazzxjv). Prints no passwords.
 */
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./load-env.mjs";

loadEnv();
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/aylzekkeurjsudazzxjv/.test(URL_)) { console.error("Refusing: this seed runs on staging (aylzekkeurjsudazzxjv) only."); process.exit(1); }
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const REMOVE = process.argv.includes("--remove");
const DOMAIN = "demo.propertiguru.test";
const NOW = Date.now();
const ago = (d, h = 0) => new Date(NOW - d * 86_400_000 - h * 3_600_000).toISOString();
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

async function demoUserIds() {
  const ids = [];
  for (let page = 1; page < 20; page++) {
    const { data } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    for (const u of data?.users ?? []) if ((u.email ?? "").endsWith(`@${DOMAIN}`)) ids.push(u.id);
    if (!data || data.users.length < 200) break;
  }
  return ids;
}

async function remove() {
  // Scoped to rows this seed made: its own agents (@demo.propertiguru.test),
  // its own contact addresses and source keys. The marketplace demo seed
  // (seed-staging-demo.mjs) also titles listings "[DEMO]", so titles are
  // never used to select what to delete.
  const users = await demoUserIds();
  const del = async (q, what) => { const r = await q; if (r.error) throw new Error(`remove ${what}: ${r.error.message}`); };
  let lids = [], pids = [], bids = [];
  if (users.length) {
    const { data: listings } = await svc.from("listings").select("id, property_id").in("agent_id", users);
    lids = (listings ?? []).map((l) => l.id);
    pids = (listings ?? []).map((l) => l.property_id).filter(Boolean);
    const { data: batches } = await svc.from("import_batches").select("id").in("agent_id", users);
    bids = (batches ?? []).map((b) => b.id);
  }
  if (lids.length) {
    await del(svc.from("listing_change_requests").delete().in("listing_id", lids), "change requests");
    await del(svc.from("listing_status_history").delete().in("listing_id", lids), "status history");
  }
  if (bids.length) {
    await del(svc.from("import_items").delete().in("batch_id", bids), "import items");
    await del(svc.from("import_batches").delete().in("id", bids), "import batches");
  }
  if (lids.length) await del(svc.from("listings").delete().in("id", lids), "listings");
  if (pids.length) await del(svc.from("properties").delete().in("id", pids), "properties");
  await del(svc.from("agent_invitations").delete().like("email", "demo.invite%@example.test"), "invitations");
  await del(svc.from("agent_prospects").delete().like("email", "demo.prospect%@example.test"), "prospects");
  await del(svc.from("listing_sources").delete().like("key", "demo-%"), "sources");
  for (const code of ["MY", "ID"]) {
    const { data: c } = await svc.from("countries").select("settings").eq("code", code).single();
    const s = { ...(c?.settings ?? {}) };
    if (s.prospect_retention_set_by === "demo-seed") {
      delete s.prospect_retention_days; delete s.prospect_retention_set_by;
      await del(svc.from("countries").update({ settings: s }).eq("code", code), `retention ${code}`);
    }
  }
  for (const id of users) {
    await del(svc.from("notifications").delete().eq("user_id", id), "notifications");
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error) throw new Error(`remove user: ${error.message}`);
  }
  return { users: users.length, listings: lids.length, batches: bids.length };
}

async function preparer(envKey) {
  const email = process.env[envKey];
  for (let page = 1; page < 20; page++) {
    const { data } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    const u = (data?.users ?? []).find((x) => x.email === email);
    if (u) return u.id;
    if (!data || data.users.length < 200) break;
  }
  throw new Error(`standing account ${envKey} not found — run seed-test-users first`);
}

async function agent(tag, name, country, lang) {
  const email = `demo-${tag}@${DOMAIN}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: `Demo!${randomBytes(12).toString("base64url")}`, email_confirm: true });
  if (error) throw new Error(`user ${tag}: ${error.message}`);
  await svc.from("profiles").upsert({ id: data.user.id, display_name: `[DEMO] ${name}`, agent_status: "verified", country_code: country, preferred_language: lang });
  return data.user.id;
}

async function listing(agentId, country, title, i, opts) {
  const { data: hp } = await svc.rpc("next_human_id", { p_prefix: "PRP" });
  const p = must(await svc.from("properties").insert({
    human_readable_id: hp, agent_id: agentId, country_code: country, property_category: "residential",
    property_type: country === "MY" ? "terrace" : "rumah", measurement_unit: country === "MY" ? "sqft" : "sqm",
    bedrooms: 3 + (i % 2), bathrooms: 2, created_by: agentId,
  }).select("id").single(), "property");
  const { data: hl } = await svc.rpc("next_human_id", { p_prefix: "LST" });
  const l = must(await svc.from("listings").insert({
    human_readable_id: hl, property_id: p.id, agent_id: agentId, listing_type: "sale", status: "pending_review", moderation_state: "pending",
    currency: country === "MY" ? "MYR" : "IDR", price: country === "MY" ? 650000 + i * 50000 : 1_500_000_000 + i * 100_000_000,
    language: country === "MY" ? "en" : "id", title: `[DEMO] ${title}`, slug: `demo-${country.toLowerCase()}-${p.id.slice(0, 8)}`, created_by: agentId,
  }).select("id").single(), "listing");
  // History: created opts.created days ago; moderated some hours later.
  const upd = { created_at: ago(opts.created) };
  if (opts.status === "published") Object.assign(upd, { status: "published", moderation_state: "approved", published_at: ago(opts.created, -opts.modHours), moderated_at: ago(opts.created, -opts.modHours) });
  await svc.from("listings").update(upd).eq("id", l.id);
  return { id: l.id, property: p.id };
}

async function seed() {
  const out = await remove();
  console.log(`removed previous DEMO rows: ${out.users} users, ${out.listings} listings, ${out.batches} batches`);

  // Retention for staging only (decision 5 is the owner's; 90 days is the agreed staging value).
  for (const code of ["MY", "ID"]) {
    const { data: c } = await svc.from("countries").select("settings").eq("code", code).single();
    const s = { ...(c?.settings ?? {}) };
    if (!s.prospect_retention_days) { s.prospect_retention_days = 90; s.prospect_retention_set_by = "demo-seed"; await svc.from("countries").update({ settings: s }).eq("code", code); }
  }

  const prepMY = await preparer("TEST_CA_EMAIL");
  const prepID = await preparer("TEST_ADMIN_EMAIL");
  const A = {
    MY1: await agent("my-aina", "Aina Rahman (MY)", "MY", "en"),
    MY2: await agent("my-wei", "Tan Wei Ling (MY)", "MY", "ms"),
    ID1: await agent("id-dimas", "Dimas Pratama (ID)", "ID", "id"),
    ID2: await agent("id-sari", "Sari Wulandari (ID)", "ID", "id"),
  };

  // ---- Prospects (#2) -------------------------------------------------------------------------
  const P = [
    ["MY", "Farid Hakim", "new", "referral", 2], ["MY", "Mei Ling Ong", "contacted", "event", 10], ["MY", "Rajesh Kumar", "interested", "portal_listing", 20],
    ["MY", "Nurul Izzah", "invited", "social", 25], ["MY", "Jason Lim", "declined", "inbound", 40], ["MY", "Siti Aminah", "converted", "referral", 55],
    ["ID", "Andi Saputra", "new", "portal_listing", 1], ["ID", "Rina Kusuma", "contacted", "event", 8], ["ID", "Budi Hartono", "interested", "referral", 18],
    ["ID", "Dewi Lestari", "invited", "social", 30], ["ID", "Agus Salim", "declined", "inbound", 45], ["ID", "Putri Maharani", "converted", "event", 60],
  ];
  let n = 0;
  for (const [cc, name, stage, source, d] of P) {
    n++;
    const phone = cc === "MY" ? `+6012000${String(1000 + n)}` : `+628120000${String(1000 + n)}`;
    must(await svc.from("agent_prospects").insert({
      country_code: cc, full_name: `[DEMO] ${name}`, phone, email: `demo.prospect${n}@example.test`, agency_name: `[DEMO] ${cc === "MY" ? "Klang Valley" : "Jabodetabek"} Realty`,
      source, source_note: "DEMO record", purpose_note: "DEMO: strong local portfolio, worth recruiting.", stage,
      last_contact_at: stage === "new" ? null : ago(d), created_by: cc === "MY" ? prepMY : prepID, owner_admin: cc === "MY" ? prepMY : prepID,
      delete_after: new Date().toISOString(),
    }).select("id").single(), `prospect ${name}`);
  }

  // ---- Sources (#8) ----------------------------------------------------------------------------
  const S = [
    ["demo-iproperty-my", "[DEMO] iProperty MY", "portal", "MY", "allowed", { luas_binaan: "buildingSize", bilik: "bedrooms" }],
    ["demo-mudah-my", "[DEMO] Mudah MY", "portal", "MY", "agent_supplied_only", { size_sqft: "buildingSize" }],
    ["demo-rumah123-id", "[DEMO] Rumah123", "portal", "ID", "unreviewed", { luas_tanah: "landSize", kamar_tidur: "bedrooms" }],
    ["demo-olx-id", "[DEMO] OLX Properti", "portal", "ID", "forbidden", {}],
    ["demo-partner-feed", "[DEMO] Partner feed", "partner_feed", null, "allowed", { price: "price", title: "title" }],
  ];
  for (const [key, display_name, kind, country_code, terms_status, field_mapping] of S) {
    must(await svc.from("listing_sources").insert({
      key, display_name, kind, country_code, terms_status, field_mapping,
      terms_note: terms_status === "unreviewed" ? null : "DEMO review note",
      terms_reviewed_by: terms_status === "unreviewed" ? null : prepID, terms_reviewed_at: terms_status === "unreviewed" ? null : ago(3),
    }).select("id").single(), `source ${key}`);
  }

  // ---- Listings, batches and change requests (#14) --------------------------------------------------
  const plan = [
    // [country, agent, preparer, created days ago, handover after (days), complete after handover (days) | null, state]
    ["MY", A.MY1, prepMY, 50, 2, 6, "complete"], ["MY", A.MY2, prepMY, 38, 1, 20, "complete"], ["MY", A.MY1, prepMY, 20, 3, null, "in_review"], ["MY", A.MY2, prepMY, 4, null, null, "preparing"],
    ["ID", A.ID1, prepID, 55, 3, 9, "complete"], ["ID", A.ID2, prepID, 33, 2, 12, "complete"], ["ID", A.ID1, prepID, 25, 4, null, "in_review"], ["ID", A.ID2, prepID, 6, null, null, "preparing"],
  ];
  let li = 0;
  for (const [cc, agentId, prep, created, hand, done, state] of plan) {
    const b = must(await svc.from("import_batches").insert({
      agent_id: agentId, acting_admin_id: prep, source_kind: "excel", source_portal: cc === "MY" ? "demo-iproperty-my" : "demo-rumah123-id",
      source_label: `[DEMO] ${cc} batch prepared ${created} days ago`, status: "ready",
    }).select("id").single(), "batch");
    const items = [];
    for (let k = 0; k < 3; k++) {
      li++;
      const imported = state === "complete" ? k < 2 : state === "in_review" ? k === 0 : false;
      const skipped = state === "complete" && k === 2;
      let lst = null;
      if (imported) lst = await listing(agentId, cc, `${cc === "MY" ? "Terrace" : "Rumah"} #${li}`, li, { created: created - (hand ?? 0) - 1, status: "published", modHours: 6 + (li % 5) * 7 });
      items.push({ batch_id: b.id, source_url: `https://example.test/demo/${b.id.slice(0, 8)}/${k}`, status: imported ? "imported" : skipped ? "skipped" : "ready",
        extracted: { title: `[DEMO] ${cc} property ${li}` }, listing_id: lst?.id ?? null, property_id: lst?.property ?? null });
      if (lst) {
        // A change request with an answer time, for the trend.
        const opened = ago(Math.max(1, created - (hand ?? 0) - 1) - 1);
        await svc.from("listing_change_requests").insert({
          listing_id: lst.id, kind: k === 0 ? "correction" : "photo_original", field: k === 0 ? "price" : "photos", body: "[DEMO] Please check this detail.",
          status: "resolved", opened_by: prep, opened_at: opened, answer: "[DEMO] Done.", answered_at: new Date(Date.parse(opened) + (4 + li * 3) * 3_600_000).toISOString(),
          answered_by: agentId, closed_by: prep, closed_at: new Date(Date.parse(opened) + (30 + li) * 3_600_000).toISOString(),
        });
      }
    }
    must(await svc.from("import_items").insert(items), "items");
    // History set directly (operator path): no notification is sent.
    const upd = { created_at: ago(created) };
    if (hand !== null) upd.handed_over_at = ago(created - hand);
    upd.agent_review_state = state;
    upd.agent_review_completed_at = done !== null ? ago(created - hand - done) : null;
    must(await svc.from("import_batches").update(upd).eq("id", b.id), "batch history");
  }

  // ---- Invitations (14-day activation) --------------------------------------------------------------
  const I = [["MY", 40, 5], ["MY", 35, 20], ["MY", 30, null], ["MY", 3, null], ["MY", 28, "revoked"], ["ID", 45, 3], ["ID", 38, 9], ["ID", 33, null], ["ID", 26, 25], ["ID", 2, null]];
  let j = 0;
  for (const [cc, created, redeemed] of I) {
    j++;
    const revoked = redeemed === "revoked";
    must(await svc.from("agent_invitations").insert({
      token_hash: createHash("sha256").update(`demo-invite-${j}-${NOW}`).digest("hex"), country_code: cc,
      full_name: `[DEMO] Invited agent ${j}`, email: `demo.invite${j}@example.test`, preferred_language: cc === "MY" ? "en" : "id",
      status: revoked ? "revoked" : typeof redeemed === "number" ? "redeemed" : "pending",
      expires_at: new Date(Date.parse(ago(created)) + 14 * 86_400_000).toISOString(), invited_by: cc === "MY" ? prepMY : prepID,
      created_at: ago(created), redeemed_at: typeof redeemed === "number" ? ago(created - redeemed) : null,
      revoked_at: revoked ? ago(created - 2) : null, revoke_reason: revoked ? "[DEMO] duplicate" : null, revoked_by: revoked ? prepMY : null,
    }).select("id").single(), `invitation ${j}`);
  }
  console.log(`seeded DEMO: 4 agents, ${P.length} prospects, ${S.length} sources, ${plan.length} batches, ${li} items, ${I.length} invitations (MY and ID)`);
}

try {
  if (REMOVE) { const r = await remove(); console.log(`removed DEMO rows: ${r.users} users, ${r.listings} listings, ${r.batches} batches (plus prospects, sources, invitations; demo retention unset)`); }
  else await seed();
} catch (e) {
  console.error(`DEMO seed failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
