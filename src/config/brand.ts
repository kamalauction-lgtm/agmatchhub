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

export const brand = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "IQI AG MatchHub",
  appShortName: process.env.NEXT_PUBLIC_APP_SHORT_NAME ?? "MatchHub",
  tagline:
    process.env.NEXT_PUBLIC_APP_TAGLINE ??
    "One Requirement. Multiple Opportunities. Controlled Collaboration.",
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
    wordmarkDark: {
      src: "/brand/wordmark-dark.svg",
      alt: "IQI AG MatchHub",
      isPlaceholder: false,
    },
    wordmarkLight: {
      src: "/brand/wordmark-light.svg",
      alt: "IQI AG MatchHub",
      isPlaceholder: false,
    },
  } satisfies Record<string, BrandLogo>,

  /** Full marketing banner (dark). Login hero, email headers, covers. */
  bannerDark: "/brand/banner-dark-v1.webp",

  socialLinks: [] as { platform: string; url: string; label: string }[],
} as const;

export type Brand = typeof brand;
