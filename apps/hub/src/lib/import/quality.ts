/**
 * Batch Review quality (P1-a, storyboard screen 6). Pure: no imports.
 *
 * For one import item, from what was extracted and what the admin or agent
 * changed (`overrides` win, as at commit):
 *
 *   · completeness — the fields a listing needs, filled or missing, as a score;
 *   · changes      — every field whose value differs from the source, with both
 *                    values, so a reviewer sees exactly what was edited.
 *
 * This is a rule count, not a prediction. After commit the listing has its
 * own database quality score (00083), which the screen shows instead.
 */

export const QUALITY_FIELDS = [
  "title", "price", "listingType", "propertyType", "location", "size", "bedrooms", "description", "photos",
] as const;
export type QualityField = (typeof QUALITY_FIELDS)[number];

const EDITABLE = ["title", "price", "listingType", "propertyType", "bedrooms", "bathrooms", "buildingSize", "landSize", "description"] as const;

type Item = { extracted?: Record<string, unknown> | null; overrides?: Record<string, unknown> | null };

function filled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function itemQuality(item: Item): { score: number; missing: QualityField[] } {
  const src = { ...(item.extracted ?? {}), ...(item.overrides ?? {}) } as Record<string, unknown>;
  const has: Record<QualityField, boolean> = {
    title: filled(src.title),
    price: typeof src.price === "number" ? src.price > 0 : filled(src.price),
    listingType: filled(src.listingType),
    propertyType: filled(src.propertyType),
    location: filled(src.city) || filled(src.province) || filled(src.district),
    size: filled(src.buildingSize) || filled(src.landSize),
    bedrooms: filled(src.bedrooms),
    description: typeof src.description === "string" && src.description.trim().length >= 120,
    photos: Array.isArray(src.imageUrls) && src.imageUrls.length > 0,
  };
  const missing = QUALITY_FIELDS.filter((f) => !has[f]);
  return { score: Math.round((100 * (QUALITY_FIELDS.length - missing.length)) / QUALITY_FIELDS.length), missing };
}

export function itemChanges(item: Item): { field: string; from: unknown; to: unknown }[] {
  const ex = item.extracted ?? {};
  const ov = item.overrides ?? {};
  const out: { field: string; from: unknown; to: unknown }[] = [];
  for (const f of EDITABLE) {
    if (!(f in ov)) continue;
    const a = ex[f] ?? null;
    const b = ov[f] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: f, from: a, to: b });
  }
  return out;
}
