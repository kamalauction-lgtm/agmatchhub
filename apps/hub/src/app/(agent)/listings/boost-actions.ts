"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";

/**
 * Boost a listing to the top of marketplace search.
 *
 * All rules live in the `boost_listing()` database function — ownership,
 * listing state, no double-boost, credit debit and the ledger entry — so this
 * action is a thin, honest wrapper. Free today (`credit_cost = 0`); when
 * billing goes live nothing here changes.
 */

const schema = z.object({
  listingId: z.string().uuid(),
  product: z.string().min(1).max(40).default("boost_3d"),
});

/** Maps the database's raised exceptions onto messages the agent can act on. */
function errorCode(message: string): string {
  if (message.includes("already boosted")) return "already_boosted";
  if (message.includes("insufficient credits")) return "no_credits";
  if (message.includes("only a published")) return "not_published";
  if (message.includes("only the listing owner")) return "not_owner";
  if (message.includes("not available")) return "product_gone";
  return "boost_failed";
}

export async function boostListing(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/listings?error=invalid");

  const supabase = await createClient();
  const { error } = await supabase.rpc("boost_listing", {
    p_listing_id: parsed.data.listingId,
    p_product_key: parsed.data.product,
  });

  if (error) redirect(`/listings?error=${errorCode(error.message)}`);

  revalidatePath("/listings");
  redirect("/listings?boosted=1");
}
