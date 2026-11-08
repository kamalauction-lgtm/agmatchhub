/**
 * The public marketplace origin, from env only.
 *
 * Returns null when NEXT_PUBLIC_MARKETPLACE_URL is unset, empty, or not an
 * absolute http(s) URL. Callers then withhold share links; the page still
 * renders. Kept free of server imports so it can be unit-tested directly.
 */
export function publicSiteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_MARKETPLACE_URL?.trim();
  if (!raw) return null;
  try {
    const { protocol, origin } = new URL(raw);
    return protocol === "https:" || protocol === "http:" ? origin : null;
  } catch {
    return null;
  }
}
