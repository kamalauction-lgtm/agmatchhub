"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { getStudioListing } from "@/lib/studio/listings";
import { buildStudioInput, copyLocaleFor } from "@/lib/studio/input";
import { writeSocialCaption, writeWhatsappBroadcast } from "@/lib/ai/listing-writer";
import { runAi, type DeniedReason } from "@/lib/ai/engine";
import { copyLanguage, type CopyLanguage } from "@/lib/ai/copy-language";

/**
 * The AI Marketing Studio: one listing → copy for every channel at once.
 *
 * Same contract as every assistant: the deterministic drafts are the floor,
 * the model is asked to do better from the same facts, the agent edits, and
 * nothing is posted by this action — scheduling and sharing stay exactly where
 * they were. The listing must belong to (or be borrowed by) the signed-in
 * agent: `getStudioListing` is scoped to them.
 */

export type StudioAiResult = {
  source: "ai" | "rules";
  reason?: DeniedReason | "failed";
  model?: string;
  texts: { whatsapp: string; caption: string; facebook: string; tiktok: string; brochure: string };
  /** The language the copy is written in, and whether it differs from the listing's (P0-d-1c). */
  copy: CopyLanguage;
};

const schema = z.object({
  facebook: z.string().min(40).max(3000),
  instagram: z.string().min(40).max(2200),
  tiktok_script: z.string().min(40).max(1500),
  whatsapp_broadcast: z.string().min(40).max(1200),
  brochure_blurb: z.string().min(30).max(700),
});

export async function draftStudioCopy(listingId: string): Promise<StudioAiResult> {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(listingId).success) throw new Error("bad listing id");

  const listing = await getStudioListing(user.id, listingId);
  if (!listing) throw new Error("listing not found");

  // P0-d-1c: copy follows the listing's stored language; Malay is written in
  // English until reviewed Malay phrases exist, and the result says so.
  const copy = copyLanguage(listing.language);
  const tt = await getTranslations({ locale: copy.lang, namespace: "propertyTypes" });
  const input = buildStudioInput(listing, (slug) => (tt.has(slug as never) ? tt(slug as never) : slug));

  const floor = {
    whatsapp: writeWhatsappBroadcast(input),
    caption: writeSocialCaption(input),
  };

  const res = await runAi(
    "studio_copy",
    {
      listing: {
        title: input.title, listing_type: input.listingType, property_type: input.propertyTypeLabel,
        province: input.province, regency: input.regency, area: input.area, building: input.buildingName,
        bedrooms: input.bedrooms, bathrooms: input.bathrooms, parking: input.parking, floors: input.floors,
        land_size: input.landSize, building_size: input.buildingSize, size_unit: listing.measurement_unit, year_built: input.yearBuilt,
        furnishing: input.furnishing, condition: input.condition, ownership: input.ownership,
        facilities: input.facilities ?? [], price: input.price, currency: listing.currency,
        rent_period: input.rentPeriod, negotiable: input.negotiable ?? false,
        link: input.url,
      },
      platforms: ["facebook", "instagram", "tiktok", "whatsapp", "brochure"],
      deterministic_drafts: floor,
    },
    schema,
    { userId: user.id, locale: copy.lang, refType: "listing", refId: listing.id, redactInput: false },
  );

  if (res.ok) {
    const o = res.output;
    return {
      source: "ai",
      model: `${res.provider}/${res.model}`,
      texts: { whatsapp: o.whatsapp_broadcast, caption: o.instagram, facebook: o.facebook, tiktok: o.tiktok_script, brochure: o.brochure_blurb },
      copy,
    };
  }
  return {
    source: "rules",
    reason: res.kind === "denied" ? res.reason : "failed",
    texts: { whatsapp: floor.whatsapp, caption: floor.caption, facebook: floor.caption, tiktok: "", brochure: "" },
    copy,
  };
}

/** Video Script Writer: a 30-second walkthrough with a shot list, from the same facts as the copy. */
export async function draftVideoScript(listingId: string) {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(listingId).success) throw new Error("bad listing id");
  const listing = await getStudioListing(user.id, listingId);
  if (!listing) throw new Error("listing not found");
  const locale = copyLocaleFor(listing);
  const tt = await getTranslations({ locale, namespace: "propertyTypes" });
  const input = buildStudioInput(listing, (slug) => (tt.has(slug as never) ? tt(slug as never) : slug));
  const { writeVideoScript } = await import("@/lib/ai/video-script");
  return writeVideoScript({ ...input, listingId: listing.id, currency: listing.currency }, { userId: user.id, locale });
}
