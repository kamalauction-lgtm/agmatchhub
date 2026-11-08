import sweepFixtures from "./teardown";
import { loadTestEnv } from "./env";

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
}

export const teardown = sweepFixtures;
