import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // The importer's parsers are marked "server-only", which is a build-time
      // guard for Next and a hard failure in a plain Node test process. Stubbing
      // it lets the pure functions be tested where they belong rather than
      // being duplicated into the test and drifting.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      // The marketplace's own alias, so its pure helpers (price and area
      // formatting, market config) can be tested here. Safe to point at www:
      // every hub module these tests import uses relative paths, none use `@/`.
      "@": fileURLToPath(new URL("../../apps/www/src", import.meta.url)),
      // The AI package ships as TypeScript source; point straight at it so
      // vitest transforms it instead of treating the symlinked node_module as
      // pre-built JavaScript.
      "@pg/ai": fileURLToPath(new URL("../ai/src/index.ts", import.meta.url)),
    },
  },
  test: {
    // Every RLS test file signs in as the seeded test users. Running files in
    // parallel fires six concurrent sign-ins at Supabase Auth, which rate-limits
    // and produces spurious failures. Sequential files keep the suite honest —
    // a failure here must mean a policy regression, never a flaky login.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // The suite runs against the live database. Announce it, and sweep any
    // fixture that outlived its own test — see tests/teardown.ts.
    globalSetup: ["./tests/global.ts"],
    teardownTimeout: 60_000,
  },
});
