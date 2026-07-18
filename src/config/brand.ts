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
      src: "/brand/placeholder-iqi.svg",
      alt: "IQI logo (placeholder — awaiting official asset)",
      isPlaceholder: true,
    },
    agTeam: {
      src: "/brand/placeholder-ag-team.svg",
      alt: "AG Team logo (placeholder — awaiting official asset)",
      isPlaceholder: true,
    },
  } satisfies Record<string, BrandLogo>,

  socialLinks: [] as { platform: string; url: string; label: string }[],
} as const;

export type Brand = typeof brand;
