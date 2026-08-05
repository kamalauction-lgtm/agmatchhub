import "server-only";

/**
 * Listing copy advisor.
 *
 * Two layers, and the first one matters more than it sounds:
 *
 * 1. **Rules** — deterministic checks on the title and description that need
 *    no model, cost nothing, and are right every time. Most weak Indonesian
 *    property listings fail on the same handful of things: no location in the
 *    title, no bedroom count, a title that is shouty or truncated, a
 *    description under two lines, no nearby landmark, no call to action.
 * 2. **Generation** — a model writes the title and description. Wired behind
 *    a provider that is not configured yet, so it degrades to layer 1 rather
 *    than failing (§12: AI-assisted, not AI-dependent).
 *
 * The agent always edits before publishing. Nothing here writes to a listing.
 */

export type Advice = {
  /** Translation key under `listings.advisor.` */
  key: string;
  severity: "fix" | "improve" | "good";
  /** Values interpolated into the message. */
  values?: Record<string, string | number>;
};

export type AdvisorInput = {
  title: string;
  description: string;
  propertyType?: string;
  bedrooms?: number | null;
  regency?: string | null;
  district?: string | null;
  price?: number | null;
  listingType?: "sale" | "rent";
};

const IDEAL_TITLE_MIN = 30;
const IDEAL_TITLE_MAX = 90;
const IDEAL_DESC_MIN = 120;

/** Words that make a title look like spam in this market. */
const SHOUTY = /(!!!|MURAH BANGET|WAJIB|BURUAN|CEPAT!!)/i;

export function adviseListing(input: AdvisorInput): Advice[] {
  const out: Advice[] = [];
  const title = (input.title ?? "").trim();
  const desc = (input.description ?? "").trim();
  const lower = title.toLowerCase();

  // --- title -----------------------------------------------------------------
  if (title.length < IDEAL_TITLE_MIN) {
    out.push({ key: "titleTooShort", severity: "fix", values: { min: IDEAL_TITLE_MIN } });
  } else if (title.length > IDEAL_TITLE_MAX) {
    out.push({ key: "titleTooLong", severity: "improve", values: { max: IDEAL_TITLE_MAX } });
  }

  if (title === title.toUpperCase() && title.length > 12) {
    out.push({ key: "titleAllCaps", severity: "improve" });
  }
  if (SHOUTY.test(title)) {
    out.push({ key: "titleShouty", severity: "improve" });
  }

  const place = (input.district ?? input.regency ?? "").toLowerCase();
  if (place && !lower.includes(place.split(" ")[0])) {
    out.push({
      key: "titleNoLocation",
      severity: "fix",
      values: { place: input.district ?? input.regency ?? "" },
    });
  }

  if (input.bedrooms && !/\d\s*(kt|br|kamar|bed)/i.test(title)) {
    out.push({ key: "titleNoBedrooms", severity: "improve", values: { n: input.bedrooms } });
  }

  // --- description -----------------------------------------------------------
  if (desc.length < IDEAL_DESC_MIN) {
    out.push({ key: "descTooShort", severity: "fix", values: { min: IDEAL_DESC_MIN } });
  }
  if (desc && !/(dekat|menit|akses|sekolah|stasiun|mrt|krl|tol|mall|rumah sakit)/i.test(desc)) {
    out.push({ key: "descNoLandmark", severity: "improve" });
  }
  if (desc && !/(hubungi|whatsapp|wa |chat|jadwal|survey|viewing)/i.test(desc)) {
    out.push({ key: "descNoCta", severity: "improve" });
  }
  if (/\b(08\d{8,}|\+62\d{8,})\b/.test(desc)) {
    // Contact details in the body bypass lead capture and the response SLA.
    out.push({ key: "descHasPhone", severity: "fix" });
  }

  if (!out.some((a) => a.severity === "fix")) {
    out.unshift({ key: "looksGood", severity: "good" });
  }
  return out;
}

/**
 * Title suggestions, built from the structured fields the agent already
 * entered. Deterministic, instant, and good enough that the model version is
 * an upgrade rather than a rescue.
 */
export function suggestTitles(input: AdvisorInput, typeLabel: string): string[] {
  const place = input.district ?? input.regency ?? "";
  const beds = input.bedrooms ? `${input.bedrooms}KT ` : "";
  const rent = input.listingType === "rent";

  const out = [
    `${typeLabel} ${beds}di ${place}, siap huni`,
    `Dijual cepat: ${typeLabel} ${beds}${place} — lokasi strategis`,
    `${typeLabel} ${beds}${place}, dekat akses utama & fasilitas lengkap`,
  ];
  if (rent) {
    out[1] = `Disewakan: ${typeLabel} ${beds}${place} — bisa langsung huni`;
  }
  return out
    .map((s) => s.replace(/\s+/g, " ").replace(" di , ", " ").trim())
    .filter((s) => s.length > 15);
}

/**
 * Share caption for WhatsApp, Telegram and social. Kept short because these
 * are read on a phone, in a chat, at a glance.
 */
export function shareCaption(opts: {
  title: string;
  price: string;
  place: string;
  url: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  size?: number | null;
}): string {
  const specs = [
    opts.bedrooms ? `${opts.bedrooms} KT` : null,
    opts.bathrooms ? `${opts.bathrooms} KM` : null,
    opts.size ? `${opts.size} m²` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    `🏡 ${opts.title}`,
    ``,
    `📍 ${opts.place}`,
    specs ? `📐 ${specs}` : null,
    `💰 ${opts.price}`,
    ``,
    `Selengkapnya: ${opts.url}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
