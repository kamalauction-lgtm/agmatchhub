import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { runAi, type DeniedReason } from "./engine";

/**
 * The Listing Researcher: comparable published listings around a search
 * (country, kind, property type, regency, bedrooms) with the price statistics
 * the catalogue already computes (00083) and the listings themselves (00098).
 * The model only summarises the set it is given.
 */
export type ResearchQuery = {
  country: string; listingType: "sale" | "rent"; propertyType: string; regency: string | null; bedrooms: number | null; excludeId?: string | null;
};

export type Comparable = {
  id: string; human_readable_id: string; title: string; slug: string; price: number; currency: string; rent_period: string | null;
  bedrooms: number | null; bathrooms: number | null; building_size: number | null; land_size: number | null;
  regency_name: string | null; district_name: string | null; published_at: string | null; mine: boolean;
};

export type ResearchResult = {
  stats: { n: number; median: number | null; perSqm: number | null; min: number | null; max: number | null };
  comparables: Comparable[];
  summary: string | null;
  typicalRange: string | null;
  drivers: string[];
  caution: string | null;
  source: "ai" | "rules";
  reason?: DeniedReason | "failed";
  model?: string;
};

const schema = z.object({
  summary: z.string().min(40).max(1200),
  typical_range: z.string().max(80),
  drivers: z.array(z.string().max(120)).max(4).default([]),
  caution: z.string().max(240).default(""),
});

export async function researchComparables(q: ResearchQuery, ctx: { userId: string; locale: string; withAi: boolean }): Promise<ResearchResult> {
  const supabase = await createClient();
  const args = { p_country: q.country, p_listing_type: q.listingType, p_property_type: q.propertyType, p_regency: q.regency, p_bedrooms: q.bedrooms, p_exclude: q.excludeId ?? null };
  const [{ data: statRows }, { data: list }] = await Promise.all([
    supabase.rpc("listing_comparables", args),
    supabase.rpc("listing_comparables_list", { ...args, p_limit: 12 }),
  ]);
  const s = (Array.isArray(statRows) ? statRows[0] : statRows) as { n: number; median_price: number | null; median_per_sqm: number | null; min_price: number | null; max_price: number | null } | undefined;
  const num = (v: unknown) => (v == null ? null : Number(v));
  const stats = { n: Number(s?.n ?? 0), median: num(s?.median_price), perSqm: num(s?.median_per_sqm), min: num(s?.min_price), max: num(s?.max_price) };
  const comparables = ((list ?? []) as Record<string, unknown>[]).map((r) => ({
    ...r, price: Number(r.price), bedrooms: num(r.bedrooms), bathrooms: num(r.bathrooms), building_size: num(r.building_size), land_size: num(r.land_size),
  })) as Comparable[];

  const base: ResearchResult = { stats, comparables, summary: null, typicalRange: null, drivers: [], caution: null, source: "rules" };
  if (!ctx.withAi || stats.n === 0) return base;

  const res = await runAi(
    "listing_research",
    {
      search: { country: q.country, listing_type: q.listingType, property_type: q.propertyType, regency: q.regency, bedrooms: q.bedrooms },
      stats: { count: stats.n, median_price: stats.median, median_price_per_sqm: stats.perSqm, min_price: stats.min, max_price: stats.max, currency: comparables[0]?.currency ?? null },
      comparables: comparables.map((c) => ({ price: c.price, currency: c.currency, rent_period: c.rent_period, bedrooms: c.bedrooms, bathrooms: c.bathrooms, building_size_sqm: c.building_size, land_size_sqm: c.land_size, district: c.district_name, published: c.published_at?.slice(0, 10) ?? null })),
    },
    schema,
    { userId: ctx.userId, locale: ctx.locale, refType: "research", redactInput: false },
  );
  if (res.ok) {
    return { ...base, summary: res.output.summary, typicalRange: res.output.typical_range || null, drivers: res.output.drivers, caution: res.output.caution || null, source: "ai", model: `${res.provider}/${res.model}` };
  }
  return { ...base, reason: res.kind === "denied" ? res.reason : "failed" };
}
