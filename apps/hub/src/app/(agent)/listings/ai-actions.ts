"use server";

import { requireUser } from "@/lib/authz";
import { writeDescription, writeTitles, type WriterInput } from "@/lib/ai/listing-writer";
import { adviseListing, type Advice } from "@/lib/ai/listing-advisor";

/**
 * Draft listing copy from the fields the agent has already filled in.
 *
 * Returns a draft for the agent to edit — it never writes to a listing. That
 * separation is the whole safety model: generation suggests, the human decides
 * (§12).
 */
export type DraftResult = {
  titles: string[];
  description: string;
  advice: Advice[];
};

export async function draftListingCopy(input: WriterInput): Promise<DraftResult> {
  await requireUser();

  const titles = writeTitles(input);
  const description = writeDescription(input);

  return {
    titles,
    description,
    advice: adviseListing({
      title: titles[0] ?? "",
      description,
      bedrooms: input.bedrooms,
      regency: input.regency,
      district: input.area,
      listingType: input.listingType,
    }),
  };
}

/** Advice on copy the agent wrote themselves. */
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
