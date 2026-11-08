/**
 * Drain leads with ghl_sync_pending into GHL (§13 event flow, steps 5–6).
 *
 * Design constraints, in order:
 *   - The platform database is the source of truth; GHL receives copies.
 *   - An inquiry must never fail because GHL is down — that is why this is a
 *     drainer over a pending flag rather than a call inside the inquiry path.
 *   - Idempotent: contact upsert dedupes on phone inside GHL; opportunity
 *     creation is guarded by ghl_opportunity_id already being set.
 *   - Bounded retries: attempts capped, errors recorded on the row, and rows
 *     that keep failing surface in the report instead of looping forever.
 *
 * Dry-run (default, GHL_LIVE!=true): the full pipeline runs and records
 * synthetic "dryrun:" ids. When live mode first runs, dryrun-synced rows are
 * automatically reset to pending so the real sync replays them.
 *
 * Usage:
 *   node scripts/ghl-drain.mjs --env=production            # dry-run
 *   node scripts/ghl-drain.mjs --env=production --limit=50
 */
import pg from "pg";
import { loadEnv, restArgs } from "./load-env.mjs";
import { GhlClient } from "./ghl-client.mjs";

const { url } = loadEnv();
const args = restArgs();
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.slice(8) ?? 25);
const MAX_ATTEMPTS = 5;

const live = process.env.GHL_LIVE === "true";
const ghl = new GhlClient({
  live,
  token: process.env.GHL_TOKEN,
  locationId: process.env.GHL_LOCATION_ID,
  base: process.env.GHL_API_BASE,
  version: process.env.GHL_API_VERSION,
  pipelineId: process.env.GHL_PIPELINE_ID,
});

console.log(`GHL drain — mode: ${live ? "LIVE" : "dry-run"}, batch limit ${LIMIT}\n`);

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();

// First live run after a dry-run period: replay everything the dry run
// "synced" so the real GHL account gets the full history.
if (live) {
  const reset = await db.query(`
    update public.leads
       set ghl_sync_pending = true, ghl_attempts = 0, ghl_last_error = null
     where ghl_opportunity_id like 'dryrun:%'
     returning id`);
  if (reset.rowCount) console.log(`Reset ${reset.rowCount} dry-run-synced lead(s) for live replay.\n`);
}

const { rows: pending } = await db.query(
  `select l.id, l.human_readable_id, l.status, l.message, l.inquiry_type, l.locale,
          l.ghl_opportunity_id, l.ghl_attempts,
          c.id as contact_id, c.full_name, c.phone, c.email, c.ghl_contact_id,
          li.title as listing_title, li.human_readable_id as listing_ref,
          li.price, li.currency
     from public.leads l
     join public.contacts c on c.id = l.contact_id
     join public.listings li on li.id = l.listing_id
    where l.ghl_sync_pending
      and l.ghl_attempts < $1
    order by l.created_at
    limit $2`,
  [MAX_ATTEMPTS, LIMIT]
);

if (!pending.length) {
  console.log("Queue empty — nothing pending under the attempt cap.");
}

let ok = 0;
let failed = 0;

for (const lead of pending) {
  process.stdout.write(`${lead.human_readable_id}  ${lead.phone}  `);
  try {
    // 1. Contact: reuse the id recorded on OUR contact row if this person has
    //    synced before; otherwise upsert (GHL dedupes on phone internally too).
    let contactId = lead.ghl_contact_id;
    if (!contactId || (live && contactId.startsWith("dryrun:"))) {
      const res = await ghl.upsertContact({
        name: lead.full_name,
        phone: lead.phone,
        email: lead.email,
        source: "marketplace",
        tags: ["marketplace-lead", lead.listing_ref],
      });
      contactId = res.contactId;
      await db.query(`update public.contacts set ghl_contact_id = $1 where id = $2`, [
        contactId,
        lead.contact_id,
      ]);
    }

    // 2. Opportunity — only if this lead does not already carry one.
    let opportunityId = lead.ghl_opportunity_id;
    if (!opportunityId || (live && opportunityId.startsWith("dryrun:"))) {
      const res = await ghl.createOpportunity({
        contactId,
        name: `${lead.human_readable_id} · ${lead.listing_title}`,
        stageName: "New Inquiry",
        monetaryValue: lead.price != null ? Number(lead.price) : undefined,
      });
      opportunityId = res.opportunityId;
    }

    // 3. Mark synced + trail. (Guard trigger allows this context per 00035.)
    await db.query(
      `update public.leads
          set ghl_sync_pending = false,
              ghl_opportunity_id = $1,
              ghl_last_error = null,
              ghl_attempts = ghl_attempts + 1
        where id = $2`,
      [opportunityId, lead.id]
    );
    await db.query(
      `insert into public.lead_events (lead_id, kind, detail)
       values ($1, 'ghl.synced', $2)`,
      [lead.id, JSON.stringify({ mode: live ? "live" : "dry-run", opportunityId })]
    );
    ok++;
    console.log(`-> synced (${opportunityId.slice(0, 40)})`);
  } catch (e) {
    failed++;
    const message = String(e.message ?? e).slice(0, 500);
    await db.query(
      `update public.leads
          set ghl_attempts = ghl_attempts + 1, ghl_last_error = $1
        where id = $2`,
      [message, lead.id]
    );
    await db.query(
      `insert into public.lead_events (lead_id, kind, detail)
       values ($1, 'ghl.sync_failed', $2)`,
      [lead.id, JSON.stringify({ error: message })]
    );
    console.log(`-> FAILED: ${message}`);
  }
}

// Rows stuck at the attempt cap need a human — surface them every run.
const { rows: dead } = await db.query(
  `select human_readable_id, ghl_attempts, ghl_last_error
     from public.leads
    where ghl_sync_pending and ghl_attempts >= $1`,
  [MAX_ATTEMPTS]
);

console.log(`\nDone: ${ok} synced, ${failed} failed this run.`);
if (dead.length) {
  console.log(`DEAD-LETTER (${dead.length}) — at attempt cap, needs manual re-sync:`);
  for (const d of dead) console.log(`  ${d.human_readable_id}: ${d.ghl_last_error}`);
}

await db.end();
process.exit(failed > 0 && ok === 0 ? 1 : 0);
