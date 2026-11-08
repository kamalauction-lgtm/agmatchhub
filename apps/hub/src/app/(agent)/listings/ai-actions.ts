"use server";

import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { type WriterInput } from "@/lib/ai/listing-writer";
import { adviseListing, type Advice } from "@/lib/ai/listing-advisor";
import { draftListing, type ListingDraft } from "@/lib/ai/listing-assistant";

/**
 * Draft listing copy from the fields the agent has already filled in.
 *
 * Returns a draft for the agent to edit — it never writes to a listing. That
 * separation is the whole safety model: generation suggests, the human decides
 * (§12). Since E3 the draft comes from the AI Listing Assistant when the
 * engine allows it, and from the deterministic writer otherwise; the result
 * says which, and why.
 */
export type DraftResult = ListingDraft;

export async function draftListingCopy(
  input: WriterInput & { propertyTypeSlug?: string | null },
): Promise<DraftResult> {
  const user = await requireUser();
  const locale = await getLocale();
  return draftListing(input, { userId: user.id, locale });
}

/** Advice on copy the agent wrote themselves. Rules only — instant and free. */
export async function reviewListingCopy(input: {
  title: string;
  description: string;
  bedrooms?: number | null;
  regency?: string | null;
  area?: string | null;
  listingType?: "sale" | "rent";
}): Promise<Advice[]> {
  await requireUser();
  return adviseListing({
    title: input.title,
    description: input.description,
    bedrooms: input.bedrooms,
    regency: input.regency,
    district: input.area,
    listingType: input.listingType,
  });
}
