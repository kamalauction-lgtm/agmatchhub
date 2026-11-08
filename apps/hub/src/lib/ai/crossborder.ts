import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/listings/format";
import { runAi, type DeniedReason } from "./engine";

/**
 * The Cross-border Researcher: what a buyer from the other market needs to
 * know before enquiring. The FACTS come from `market_facts` (00098), seeded
 * as draft and verified by an admin; the model may only arrange and tailor
 * them to one listing. A draft fact is always shown as "to be confirmed".
 */
export type MarketFact = { id: string; topic: string; text: string; status: "draft" | "verified"; sourceUrl: string | null };

export type CrossborderBrief = {
  listingCountry: string;
  buyerCountry: string;
  listing: { id: string; title: string; price: string; propertyType: string; place: string } | null;
  facts: MarketFact[];
  headline: string | null;
  points: { topic: string; text: string; status: "verified" | "draft" }[];
  nextSteps: string[];
  mustCheck: string[];
  allVerified: boolean;
  source: "ai" | "rules";
  reason?: DeniedReason | "failed";
  model?: string;
};

const schema = z.object({
  headline: z.string().min(10).max(160),
  points: z.array(z.object({ topic: z.string().max(60), text: z.string().min(10).max(400), status: z.enum(["verified", "draft"]) })).max(8),
  next_steps: z.array(z.string().max(200)).max(4).default([]),
  must_check: z.array(z.string().max(200)).max(4).default([]),
});

export async function loadMarketFacts(country: string, locale: string, audience = "foreign_buyer"): Promise<MarketFact[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("market_facts").select("id, topic, body, status, source_url, position")
    .eq("country_code", country).eq("audience", audience).neq("status", "retired").order("position");
  return ((data ?? []) as { id: string; topic: string; body: Record<string, string>; status: "draft" | "verified"; source_url: string | null }[])
    .map((f) => ({ id: f.id, topic: f.topic, text: f.body[locale] ?? f.body.en ?? Object.values(f.body)[0] ?? "", status: f.status, sourceUrl: f.source_url }));
}

export async function crossborderBrief(input: { listingId: string | null; listingCountry: string; buyerCountry: string; userId: string; locale: string; withAi: boolean }): Promise<CrossborderBrief> {
  const supabase = await createClient();
  const [facts, listingRow] = await Promise.all([
    loadMarketFacts(input.listingCountry, input.locale),
    input.listingId
      ? supabase.from("public_agent_listings").select("id, title, price, currency, rent_period, property_type, regency_name, province_name, ownership_type, building_size, land_size, bedrooms").eq("id", input.listingId).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
  ]);
  const l = listingRow as { id: string; title: string; price: number; currency: string; rent_period: string | null; property_type: string; regency_name: string | null; province_name: string | null; ownership_type: string | null; building_size: number | null; land_size: number | null; bedrooms: number | null } | null;
  const listing = l ? { id: l.id, title: l.title, price: money(l.currency, Number(l.price), l.rent_period), propertyType: l.property_type, place: [l.regency_name, l.province_name].filter(Boolean).join(", ") } : null;
  const base: CrossborderBrief = {
    listingCountry: input.listingCountry, buyerCountry: input.buyerCountry, listing, facts,
    headline: null, points: facts.map((f) => ({ topic: f.topic, text: f.text, status: f.status })), nextSteps: [], mustCheck: [],
    allVerified: facts.length > 0 && facts.every((f) => f.status === "verified"), source: "rules",
  };
  if (!input.withAi || !facts.length) return base;

  const res = await runAi(
    "crossborder_brief",
    {
      buyer_country: input.buyerCountry, listing_country: input.listingCountry,
      listing: l ? { title: l.title, price: Number(l.price), currency: l.currency, rent_period: l.rent_period, property_type: l.property_type, ownership_type: l.ownership_type, building_size_sqm: l.building_size, land_size_sqm: l.land_size, bedrooms: l.bedrooms, place: listing?.place } : "no specific listing — general brief",
      facts: facts.map((f) => ({ topic: f.topic, status: f.status, text: f.text })),
    },
    schema,
    { userId: input.userId, locale: input.locale, refType: "crossborder", refId: input.listingId ?? undefined, redactInput: false },
  );
  if (res.ok) {
    const o = res.output;
    // A point the model calls verified must rest on a verified fact; otherwise it is draft.
    const verifiedTopics = new Set(facts.filter((f) => f.status === "verified").map((f) => f.topic));
    return {
      ...base, headline: o.headline,
      points: o.points.map((p) => ({ ...p, status: p.status === "verified" && verifiedTopics.has(p.topic) ? "verified" : "draft" })),
      nextSteps: o.next_steps, mustCheck: o.must_check, source: "ai", model: `${res.provider}/${res.model}`,
    };
  }
  return { ...base, reason: res.kind === "denied" ? res.reason : "failed" };
}
