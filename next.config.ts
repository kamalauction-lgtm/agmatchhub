import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Workers runtime has no Next image optimizer; media already ships as
  // optimised uploads + signed URLs, so serve images unmodified.
  images: { unoptimized: true },
};

export default withNextIntl(nextConfig);
