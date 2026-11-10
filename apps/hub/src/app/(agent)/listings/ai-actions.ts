"use server";

import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { type WriterInput } from "@/lib/ai/listing-writer";
import { adviseListing, type Advice } from "@/lib/ai/listing-advisor";
import { draftListing, type ListingDraft } from "@/lib/ai/listing-assistant";
import { getAgentMarket } from "@/lib/listings/market";
import { createClient } from "@/lib/supabase/server";

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
  // The market comes from the agent's profile, never from the client (D8):
  // comparables are searched in that country, and copy uses its currency and unit.
  const market = await getAgentMarket(await createClient(), user.id);
  return draftListing(
    {
      ...input,
      countryCode: market?.country ?? "ID",
      currency: market?.currency ?? null,
      sizeUnit: market?.unit ?? null,
    },
    { userId: user.id, locale },
  );
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

/** Photo Checker: rules at once, then the model on up to eight photos (one AI task). */
export async function checkPhotosAction(listingId: string) {
  const user = await requireUser();
  const locale = await getLocale();
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) throw new Error("bad listing id");
  const { checkListingPhotos } = await import("@/lib/ai/photo-check");
  return checkListingPhotos({ listingId, userId: user.id, locale, withAi: true });
}

/** Translation Assistant: the listing's title and description into `target`; the agent saves. */
export async function translateListingAction(listingId: string, target: "en" | "id" | "ms") {
  const user = await requireUser();
  const locale = await getLocale();
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) throw new Error("bad listing id");
  const { createClient } = await import("@/lib/supabase/server");
  const { translateFields } = await import("@/lib/ai/translate");
  const supabase = await createClient();
  const { data: l } = await supabase.from("listings").select("title, description, language").eq("id", listingId).eq("agent_id", user.id).maybeSingle();
  if (!l) throw new Error("listing not found");
  return translateFields({ title: l.title, description: l.description ?? "" }, target, l.language, { userId: user.id, locale, refType: "listing", refId: listingId });
}
