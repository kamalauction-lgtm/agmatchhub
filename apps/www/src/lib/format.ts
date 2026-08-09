/**
 * Indonesian formatting. Rupiah figures are long, so prices are abbreviated
 * the way Indonesian listings actually write them — "Rp2,15 miliar", not
 * "Rp2.150.000.000" — with the exact figure kept for the detail page.
 */

const RUPIAH = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatPriceExact(value: number | null, currency = "IDR"): string {
  if (value == null) return "—";
  if (currency !== "IDR") {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  }
  // Intl renders "Rp 2.150.000.000"; Indonesian convention (and every property
  // portal here) writes it closed up as "Rp2.150.000.000". The separator Intl
  // inserts is a non-breaking space, so match both.
  return RUPIAH.format(value).replace(/^Rp[\s ]+/, "Rp");
}

/**
 * Join place names without repeating one. Agents type a general address that
 * often already contains the district or city, so naive joining produces
 * "Blok M, Jakarta Selatan, Jakarta Selatan, DKI Jakarta". Comparison is
 * case-insensitive and ignores a segment already contained in an earlier one.
 */
export function joinPlaceParts(parts: Array<string | null | undefined>): string {
  const kept: string[] = [];
  for (const raw of parts) {
    const part = raw?.trim();
    if (!part) continue;
    const lower = part.toLowerCase();
    const duplicate = kept.some((k) => {
      const kl = k.toLowerCase();
      return kl === lower || kl.includes(lower);
    });
    if (!duplicate) kept.push(part);
  }
  return kept.join(", ");
}

/** Compact form for cards and search results. */
export function formatPriceShort(value: number | null, currency = "IDR"): string {
  if (value == null) return "—";
  if (currency !== "IDR") return formatPriceExact(value, currency);

  const units: Array<[number, string]> = [
    [1_000_000_000_000, "triliun"],
    [1_000_000_000, "miliar"],
    [1_000_000, "juta"],
    [1_000, "ribu"],
  ];

  for (const [size, label] of units) {
    if (value >= size) {
      const n = value / size;
      // Indonesian uses a comma as the decimal separator.
      const text = (n >= 100 ? Math.round(n) : Number(n.toFixed(2))).toLocaleString("id-ID");
      return `Rp${text} ${label}`;
    }
  }
  return RUPIAH.format(value);
}

export function formatRentPeriod(period: string | null): string {
  if (period === "monthly") return "/bulan";
  if (period === "yearly") return "/tahun";
  return "";
}

export function formatArea(value: number | null, unit = "sqm"): string {
  if (value == null) return "—";
  const n = value % 1 === 0 ? value : Number(value.toFixed(1));
  return `${n.toLocaleString("id-ID")} ${unit === "sqft" ? "sqft" : "m²"}`;
}

export function formatCount(value: number | null): string {
  return value == null ? "—" : value.toLocaleString("id-ID");
}

/** "3 hari lalu" — relative time for listing freshness. */
export function formatRelativeDate(iso: string | null, locale = "id"): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (days < 1) return rtf.format(0, "day");
  if (days < 30) return rtf.format(-days, "day");
  if (days < 365) return rtf.format(-Math.floor(days / 30), "month");
  return rtf.format(-Math.floor(days / 365), "year");
}

/**
 * Public storage URL for a listing image. Media lives in a public bucket;
 * anything private is served through signed URLs by the hub, never here.
 */
export function mediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  // A leading slash means an asset served by this site (`/banners/x.svg`), not
  // a storage object. Without this the path is rewritten into a storage URL
  // that 404s, and because the caller draws a gradient over the image the
  // failure is invisible — the artwork simply never appears.
  if (path.startsWith("/")) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${path.replace(/^\/+/, "")}`;
}
