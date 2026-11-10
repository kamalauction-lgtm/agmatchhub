import sweepFixtures from "./teardown";
import { loadTestEnv } from "./env";
import { acquireRunLock, releaseRunLock } from "./run-lock";

/**
 * Runs once around the whole suite.
 *
 * `setup` says which database is about to be tested, by project ref, before
 * the first assertion rather than after a stray row. The target comes from
 * `PG_ENV_FILE` (see tests/env.ts); production is named in capitals so it
 * cannot be mistaken for the staging run `npm test` performs.
 *
 * `teardown` sweeps fixtures — see tests/teardown.ts for why it fails the run
 * rather than cleaning up quietly.
 *
 * Between the two, this run holds the database's suite lock (tests/run-lock.ts)
 * so two runs — a laptop and CI, or CI on two branches — queue instead of
 * corrupting each other's fixtures and global flags.
 */

const PRODUCTION_REF = "jokyyhvtahiypuzmfydp";

export async function setup() {
  const { ref, file } = loadTestEnv();
  if (ref === PRODUCTION_REF) {
    console.log(
      `\n  RLS suite target: PRODUCTION (${ref})\n` +
        `  Fixtures are tagged and swept after the run.\n`
    );
  } else {
    console.log(`\n  RLS suite target: ${ref}  (${file})\n`);
  }
  await acquireRunLock(ref);
}

export async function teardown() {
  try {
    await sweepFixtures();
  } finally {
    await releaseRunLock();
  }
}
