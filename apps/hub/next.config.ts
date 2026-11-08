import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Workers runtime has no Next image optimizer; media already ships as
  // optimised uploads + signed URLs, so serve images unmodified.
  images: { unoptimized: true },
  // Monorepo: node_modules are hoisted to the workspace root, so file tracing
  // must start there or the OpenNext bundle drops hoisted dependencies.
  outputFileTracingRoot: path.join(process.cwd(), "..", ".."),
  // Workspace package shipped as TypeScript source; Next compiles it in.
  transpilePackages: ["@pg/ai"],

  experimental: {
    /**
     * Server Actions cap request bodies at 1MB by default, and every upload in
     * this app is a form posted to a Server Action. A phone photo is 2–6MB, so
     * uploading one produced `Error: Body exceeded 1 MB limit.` — surfacing to
     * the agent as a bare "This page couldn't load", with the per-file checks
     * in the action never reached because Next rejects the request first.
     *
     * The number has to cover the largest single form, which is the trust
     * profile: photo (3MB) + name card front (5MB) + name card back (5MB).
     * 16MB leaves room for the multipart overhead without inviting anything
     * unbounded — the action still enforces its own per-file limits, and
     * storage rejects what it does not like.
     *
     * Also covers the listing spreadsheet import, capped at 5MB.
     */
    serverActions: { bodySizeLimit: "16mb" },
  },
};

export default withNextIntl(nextConfig);
