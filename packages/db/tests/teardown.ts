import { createClient } from "@supabase/supabase-js";
import { loadTestEnv } from "./env";

/**
 * Global teardown: sweep anything the suite created out of the live database.
 *
 * WHY THIS EXISTS
 *   The RLS suite runs against production because that is the only database
 *   with the schema. Most of it reads; some of it must create an agent and
 *   publish a listing to prove an entitlement fires. Per-test `afterAll`
 *   cleanup is necessary but not sufficient — it has already failed once, in
 *   the way these things always fail: the delete ran in the wrong FK order,
 *   Postgres refused it, nobody read the error, and seven orphan agencies sat
 *   in the live database for weeks.
 *
 *   So this runs after everything, deletes by MARKER rather than by a list of
 *   ids some test remembered to keep, and FAILS THE RUN if it found anything.
 *   A green suite that quietly leaves rows behind is the failure mode; a red
 *   one that names the leak is the fix.
 *
 * WHY IT IS SAFE
 *   Every predicate matches only strings this suite writes: the RFC 2606
 *   `.invalid` fixture domain, and the `[fixture]` name prefix. Neither can
 *   occur on a real agent, a real organisation or a real listing. Nothing here
 *   deletes by date, by "recent", or by any heuristic that could widen.
 */

const FIXTURE_DOMAIN = "@fixture.propertiguru.invalid";
const FIXTURE_PREFIX = "[fixture]";

/** Legacy markers from before the convention existed, swept for the same reason. */
const LEGACY_EMAIL_PATTERNS = ["flagtest.%@example.test", "%@staging.propertiguru.invalid"];
const LEGACY_NAME_PATTERNS = [
  "Test Org for precedence%", "Flag referrer", "Flag invitee",
  // lifecycle.test.ts cancelled (could not delete) one of these per run before
  // it carried the fixture marker; production holds 32 of them.
  "Lifecycle test requirement",
];

export default async function teardown() {
  loadTestEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;               // suite was skipped; nothing ran

  const db = createClient(url, key, { auth: { persistSession: false } });
  const removed: Record<string, number> = {};
  const note = (what: string, n: number | null) => {
    if (n) removed[what] = (removed[what] ?? 0) + n;
  };

  /* Accounts, and everything hanging off them. Deleted in FK order — the
   * order is the part that went wrong last time, so it is written out
   * explicitly rather than relying on cascades that may not all exist. */
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  const fixtureUsers = (users?.users ?? []).filter(
    (u) =>
      u.email?.endsWith(FIXTURE_DOMAIN) ||
      LEGACY_EMAIL_PATTERNS.some((p) =>
        new RegExp(`^${p.replace(/[.]/g, "\\.").replace(/%/g, ".*")}$`).test(u.email ?? "")
      )
  );

  for (const u of fixtureUsers) {
    const { data: listings } = await db.from("listings").select("id").eq("agent_id", u.id);
    const listingIds = (listings ?? []).map((l) => l.id);
    if (listingIds.length) {
      note("listing_media", (await db.from("listing_media").delete({ count: "exact" }).in("listing_id", listingIds)).count);
      note("listings", (await db.from("listings").delete({ count: "exact" }).in("id", listingIds)).count);
    }
    note("properties", (await db.from("properties").delete({ count: "exact" }).eq("agent_id", u.id)).count);

    // Growth rows reference each other; grants are pointed at by rewards.
    const { data: rewards } = await db
      .from("referral_rewards").select("id, grant_id").eq("user_id", u.id);
    for (const r of rewards ?? []) {
      await db.from("referral_rewards").delete({ count: "exact" }).eq("id", r.id);
      if (r.grant_id) await db.from("entitlement_grants").delete({ count: "exact" }).eq("id", r.grant_id);
      note("referral_rewards", 1);
    }
    note("entitlement_grants", (await db.from("entitlement_grants").delete({ count: "exact" }).eq("user_id", u.id)).count);
    note("referrals", (await db.from("referrals").delete({ count: "exact" }).eq("referrer_id", u.id)).count);
    note("referrals", (await db.from("referrals").delete({ count: "exact" }).eq("referred_id", u.id)).count);
    note("referral_codes", (await db.from("referral_codes").delete({ count: "exact" }).eq("user_id", u.id)).count);
    note("subscriptions", (await db.from("subscriptions").delete({ count: "exact" }).eq("user_id", u.id)).count);
    note("announcement_reads", (await db.from("announcement_reads").delete({ count: "exact" }).eq("user_id", u.id)).count);

    /* agent_profiles before agencies, and both before the profile — the exact
     * ordering the orphan-agency incident got wrong. */
    note("agent_profiles", (await db.from("agent_profiles").delete({ count: "exact" }).eq("user_id", u.id)).count);
    note("profiles", (await db.from("profiles").delete({ count: "exact" }).eq("id", u.id)).count);

    const { error } = await db.auth.admin.deleteUser(u.id);
    if (error) console.error(`teardown: could not delete ${u.email}: ${error.message}`);
    else note("auth_users", 1);
  }

  /* Named rows with no owning account: organisations, announcements, flags. */
  for (const pattern of [`${FIXTURE_PREFIX}%`, ...LEGACY_NAME_PATTERNS]) {
    note("agencies", (await db.from("agencies").delete({ count: "exact" }).like("name", pattern)).count);
    note("announcements", (await db.from("announcements").delete({ count: "exact" }).like("title", pattern)).count);
    note("growth_campaigns", (await db.from("growth_campaigns").delete({ count: "exact" }).like("name", pattern)).count);

    // Requirements an agent created and could only cancel. Private companion
    // row first — the FK points at the request.
    const { data: reqs } = await db.from("property_requests").select("id").like("title", pattern);
    const reqIds = (reqs ?? []).map((r) => r.id);
    if (reqIds.length) {
      await db.from("property_request_private").delete().in("request_id", reqIds);
      note("property_requests", (await db.from("property_requests").delete({ count: "exact" }).in("id", reqIds)).count);
    }
  }

  const total = Object.values(removed).reduce((a, b) => a + b, 0);
  if (total > 0) {
    console.error("\nFixtures survived their own tests and were swept here:");
    console.table(removed);

    /* Both, and the exit code is the one that matters. Vitest reports a throw
     * from globalSetup teardown as "error during close" and still exits 0 —
     * verified by planting a row deliberately — so on CI the run would go
     * green with a leak reported only in scrollback. Setting exitCode makes
     * the leak fail the build; the throw makes it visible to a human. */
    process.exitCode = 1;
    const ref = (url.match(/https:\/\/([a-z0-9]+)\./)?.[1] ?? "the target database").toUpperCase();
    throw new Error(
      `Teardown removed ${total} leftover fixture row(s) from ${ref}. ` +
        `Some test did not clean up after itself — fix its afterAll rather than relying on this sweep.`
    );
  }
}
