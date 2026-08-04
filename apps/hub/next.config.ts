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
};

export default withNextIntl(nextConfig);
