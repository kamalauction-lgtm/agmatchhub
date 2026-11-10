import pg from "pg";

/**
 * One suite run at a time per database.
 *
 * WHY. Staging is shared by every developer machine and by CI on every
 * branch. Some tests cannot be isolated per run because what they prove is
 * global: the payments feature flag, a gateway's mode, a pack price. Others
 * mutate the standing test accounts' balances. And the teardown sweep deletes
 * by marker, so a second run's sweep removes the first run's live fixtures.
 * On 10 Nov 2026 two overlapping runs produced three different red results on
 * a commit whose code was fine (submissions count 3 ≠ 1, referral capacity
 * 360 ≠ 345, credits 45 ≠ 25).
 *
 * HOW. A session-level Postgres advisory lock, taken in global setup and held
 * until the teardown sweep has finished. A second run waits and says so; it
 * never skips or weakens a test. If a run dies the session ends and Postgres
 * releases the lock by itself, so a crashed run cannot wedge the queue.
 *
 * Needs DATABASE_URL on a session connection (the 5432 pooler or direct), the
 * same URL the migration runner uses.
 */

/** Arbitrary but fixed: every run of this suite contends on the same key. */
const LOCK_KEY = 7_351_001;
const WAIT_LIMIT_MS = 25 * 60_000;
const POLL_MS = 5_000;

let client: pg.Client | null = null;

export async function acquireRunLock(label: string): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set for the test target. The suite takes a database lock " +
        "so concurrent runs cannot corrupt each other's fixtures; it needs the session URL."
    );
  }
  client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const started = Date.now();
  let announced = false;
  for (;;) {
    const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [LOCK_KEY]);
    if (rows[0]?.ok) {
      if (announced) console.log(`  Lock acquired after ${Math.round((Date.now() - started) / 1000)} s.`);
      return;
    }
    if (!announced) {
      console.log(`\n  Another test run holds the ${label} suite lock. Waiting for it to finish…`);
      announced = true;
    }
    if (Date.now() - started > WAIT_LIMIT_MS) {
      await client.end().catch(() => {});
      client = null;
      throw new Error(`Gave up waiting ${WAIT_LIMIT_MS / 60_000} min for the suite lock on ${label}.`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export async function releaseRunLock(): Promise<void> {
  if (!client) return;
  try {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]);
  } finally {
    await client.end().catch(() => {});
    client = null;
  }
}
