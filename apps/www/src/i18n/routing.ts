import { defineRouting } from "next-intl/routing";

/**
 * Unlike the hub — a private tool that resolves locale from a cookie — the
 * marketplace is an SEO surface, so locale must live in the URL. One URL, one
 * language, so a search engine can index both without seeing the same address
 * serve different content to different visitors.
 *
 * Bahasa Indonesia is the default and carries no prefix: `/properti/...` is
 * the canonical Indonesian URL, `/en/properti/...` the English one.
 */
export const routing = defineRouting({
  locales: ["id", "en"],
  defaultLocale: "id",
  localePrefix: "as-needed",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
