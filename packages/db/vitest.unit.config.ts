import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Database-free unit tests.
 *
 * The main vitest.config.ts runs a global setup that sweeps fixtures from the
 * target database, so it cannot run a unit file without touching a database.
 * This config has no globalSetup and no teardown, and it includes only
 * tests/unit. Use it for pure logic that needs no Supabase and no PG_ENV_FILE:
 *
 *   npm run test:unit
 *
 * Do not add a test here that connects to a database. RLS and integration
 * tests belong under tests/rls, which runs through scripts/test.mjs.
 */
export default defineConfig({
  // Same aliases as vitest.config.ts, so unit files resolve the same modules.
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("../../apps/www/src", import.meta.url)),
      "@pg/ai": fileURLToPath(new URL("../ai/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
