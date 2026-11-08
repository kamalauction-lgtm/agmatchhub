/**
 * Brand configuration (§4, §70).
 *
 * The public name is an internal working name pending trademark clearance, so
 * nothing here may be hard-coded in a component. Renaming the platform must be
 * an environment change, not a code change.
 */
export const brand = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "PropertiGuru",
  shortName: process.env.NEXT_PUBLIC_APP_SHORT_NAME ?? "PropertiGuru",
  /* hubUrl moved to `@/config/market`: where agents sign in differs per
     market, and a single brand-level constant made the Malaysian site send
     Malaysian agents to the Indonesian domain. */
  siteUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8152",
  /** Working name is unresolved, so the UI must not present it as final. */
  isWorkingName: process.env.NEXT_PUBLIC_BRAND_FINAL !== "true",
} as const;
