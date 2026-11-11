"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { copyLanguage } from "@/lib/ai/copy-language";
import { isTypeAllowed } from "@/lib/listings/vocabulary";
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
  // The market comes from the agent's profile, never from the client (D8):
  // comparables are searched in that country, and copy uses its currency and unit.
  const market = await getAgentMarket(await createClient(), user.id);
  // P0-d-1c: the draft is written in the language the listing will be stored
  // in (the market's listing language, which createListing saves), not in
  // the UI locale. Malay is written in English for now and flagged as such.
  const language = market?.language ?? "id";
  const copy = copyLanguage(language);
  // The type label is resolved again in the copy language, so an English
  // draft never carries the UI's Indonesian or Malay word for the type.
  const tt = await getTranslations({ locale: copy.lang, namespace: "propertyTypes" });
  const slug = input.propertyTypeSlug ?? "";
  const propertyTypeLabel =
    slug && (!market || isTypeAllowed(market.country, slug)) && tt.has(slug as never) ? tt(slug as never) : input.propertyTypeLabel;
  return draftListing(
    {
      ...input,
      propertyTypeLabel,
      language,
      countryCode: market?.country ?? "ID",
      currency: market?.currency ?? null,
      sizeUnit: market?.unit ?? null,
    },
    { userId: user.id },
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
