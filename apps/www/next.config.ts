import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // Cloudflare Workers has no Next image optimizer; media is optimised on
  // upload and served from storage/CDN.
  images: {
    unoptimized: true,
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  // Monorepo: dependencies hoist to the workspace root, so tracing must start
  // there or the OpenNext bundle drops them.
  outputFileTracingRoot: path.join(process.cwd(), "..", ".."),
};

export default withNextIntl(nextConfig);
