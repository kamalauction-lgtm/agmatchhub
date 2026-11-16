import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { runAi, type DeniedReason } from "./engine";
import { type WriterInput } from "./listing-writer";
import { adviseListing, type Advice } from "./listing-advisor";
import { type CopyLanguage } from "./copy-language";
import { buildListingCopyRequest } from "./listing-copy-request";

/**
 * The AI Listing Assistant.
 *
 * Two layers, in this order and always both:
 *   1. the deterministic writer and advisor (instant, free, cannot invent a
 *      swimming pool) produce a complete draft;
 *   2. `runAi("listing_copy")` is asked to do better FROM THE SAME FIELDS plus
 *      what the catalogue knows about comparable listings nearby.
 *
 * If the model answers, its draft replaces the deterministic one and the agent
 * sees which it got. If it is denied or fails, the deterministic draft is what
 * they get — with the reason, not a spinner. Either way nothing is written to
 * a listing: the agent edits, then saves.
 */

export type Comparables = { n: number; medianPrice: number | null; medianPerSqm: number | null } | null;

export type ListingDraft = {
  titles: string[];
  description: string;
  sellingPoints: string[];
  advice: Advice[];
  notesForAgent: string[];
  source: "ai" | "rules";
  reason?: DeniedReason | "failed";
  model?: string;
  comparables: Comparables;
  /** The language the draft is written in, and whether that differs from the listing's (P0-d-1c). */
  copy: CopyLanguage;
};

const schema = z.object({
  titles: z.array(z.string().min(10).max(90)).min(1).max(3),
  description: z.string().min(80).max(2200),
  selling_points: z.array(z.string().min(3).max(90)).max(6).default([]),
  notes_for_agent: z.array(z.string().max(160)).max(4).default([]),
});

export async function draftListing(
  input: WriterInput & { propertyTypeSlug?: string | null; countryCode?: string },
  ctx: { userId: string },
): Promise<ListingDraft> {
  const adviceFor = (title: string, desc: string) =>
    adviseListing({ title, description: desc, bedrooms: input.bedrooms, regency: input.regency, district: input.area, listingType: input.listingType });

  // What the catalogue knows: same country, kind, regency. Comparables are
  // facts the model may quote; it is told to say nothing about price otherwise.
  let comparables: Comparables = null;
  if (input.propertyTypeSlug && input.regency) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("listing_comparables", {
      p_country: input.countryCode ?? "ID",
      p_listing_type: input.listingType,
      p_property_type: input.propertyTypeSlug,
      p_regency: input.regency,
      p_bedrooms: input.bedrooms ?? null,
      p_exclude: null,
    });
    const row = (Array.isArray(data) ? data[0] : data) as { n: number; median_price: number | null; median_per_sqm: number | null } | undefined;
    if (row && Number(row.n) > 0) {
      comparables = { n: Number(row.n), medianPrice: row.median_price != null ? Number(row.median_price) : null, medianPerSqm: row.median_per_sqm != null ? Number(row.median_per_sqm) : null };
    }
  }

  // P0-d-1c: the request (language, currency, unit, floor draft) is built in
  // one pure function, so tests see exactly what the model is asked for.
  const req = buildListingCopyRequest(input, comparables);
  const { copy, titles, description } = req;

  const res = await runAi(
    "listing_copy",
    req.payload,
    schema,
    { userId: ctx.userId, locale: req.locale, refType: "listing_draft", redactInput: false },
  );

  if (res.ok) {
    const o = res.output;
    return {
      titles: o.titles,
      description: o.description,
      sellingPoints: o.selling_points,
      notesForAgent: o.notes_for_agent,
      advice: adviceFor(o.titles[0] ?? "", o.description),
      source: "ai",
      model: `${res.provider}/${res.model}`,
      comparables,
      copy,
    };
  }
  return {
    titles,
    description,
    sellingPoints: [],
    notesForAgent: [],
    advice: adviceFor(titles[0] ?? "", description),
    source: "rules",
    reason: res.kind === "denied" ? res.reason : "failed",
    comparables,
    copy,
  };
}
