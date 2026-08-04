import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every test file signs in as the seeded test users. Running files in
    // parallel fires six concurrent sign-ins at Supabase Auth, which rate-limits
    // and produces spurious failures. Sequential files keep the suite honest —
    // a failure here must mean a policy regression, never a flaky login.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
