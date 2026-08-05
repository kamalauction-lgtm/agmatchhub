/**
 * Central brand configuration (master spec §70).
 * Components must import from here — never hard-code the application name,
 * company name, tagline, colours or logo paths.
 *
 * Values here are env-backed fallbacks; Super Admin overrides stored in the
 * `brand_settings` table take precedence at runtime via getBrand().
 */

export type BrandLogo = {
  /** Path or URL. Placeholder assets until official files are approved. */
  src: string;
  alt: string;
  /** Official files must not be redrawn/recoloured/cropped (§70). */
  isPlaceholder: boolean;
};

/**
 * The platform is the agent operating system. MatchHub is one module inside
 * it, not the product (Kamal, 4 Aug 2026) — so the application name is
 * platform-level and module names live in `messages/*`, never here.
 *
 * These remain working names pending the brand decision (risk R1); every one
 * is env-backed so a rename is a config change, not a code change.
 */
export const brand = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "IQI AG Agent Platform",
  appShortName: process.env.NEXT_PUBLIC_APP_SHORT_NAME ?? "Agent Platform",
  tagline:
    process.env.NEXT_PUBLIC_APP_TAGLINE ??
    "One platform for your whole property business.",
  companyName: "IQI AG",
  supportEmail: "",
  supportPhone: "",
  websiteUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",

  colors: {
    crimson: "#B11226",
    charcoal: "#1F1F1F",
    silver: "#C0C0C0",
    white: "#FFFFFF",
  },

  logos: {
    iqi: {
      // Stylised IQI sphere supplied by the owner (18 Jul 2026), extracted
      // from the approved MatchHub banner set with transparency.
      src: "/brand/iqi-mark.png",
      alt: "IQI logo",
      isPlaceholder: false,
    },
    agTeam: {
      src: "/brand/ag-mark.png",
      alt: "AG Team logo",
      isPlaceholder: false,
    },
    /** Same mark with a charcoal halo so the silver G reads on light bg. */
    agTeamLight: {
      src: "/brand/ag-mark-light.png",
      alt: "AG Team logo",
      isPlaceholder: false,
    },
  } satisfies Record<string, BrandLogo>,

  /** Full marketing banner (dark). Login hero, email headers, covers. */
  bannerDark: "/brand/banner-dark-v1.webp",

  socialLinks: [] as { platform: string; url: string; label: string }[],
} as const;

export type Brand = typeof brand;
