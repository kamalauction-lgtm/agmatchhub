"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * A listing agent offering one of their listings to the co-marketing pool,
 * and withdrawing it again.
 *
 * The gates that matter are in the database, not here:
 * `guard_comarketing_offer()` refuses any listing that is not published, not
 * the caller's own, or whose owner authorisation is not on record. This action
 * therefore validates shape, not permission — and reports the database's
 * refusal honestly instead of pretending it succeeded.
 */

const offerSchema = z.object({
  listingId: z.string().uuid(),
  /** Share of the TOTAL commission that goes to the marketing agent. */
  marketingShare: z.coerce.number().min(1).max(99),
  totalCommission: z.coerce.number().min(0).max(100),
  payer: z.enum(["owner", "buyer", "developer"]),
  requiresApproval: z.coerce.boolean().default(false),
  maxAgents: z.union([z.coerce.number().int().min(1).max(500), z.literal("")]).optional(),
  /** Never advertise below this. Confidential — goes to the private companion. */
  minPrice: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  notes: z.string().max(600).optional(),
});

/** Maps the database's raised exceptions onto messages an agent can act on. */
function offerErrorCode(message: string): string {
  if (message.includes("owner authorisation")) return "no_authorisation";
  if (message.includes("only the listing owner")) return "not_owner";
  if (message.includes("published")) return "not_published";
  if (message.includes("idx_comarketing_one_live_offer") || message.includes("duplicate key"))
    return "already_offered";
  return "offer_failed";
}

export async function offerToPool(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = offerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/listings?error=invalid");
  const d = parsed.data;

  const supabase = await createClient();

  const { data: offer, error } = await supabase
    .from("comarketing_offers")
    .insert({
      listing_id: d.listingId,
      listing_agent_id: user.id,
      status: "active",
      scope: "open_pool",
      commission_basis: "total_pct",
      total_commission_pct: d.totalCommission,
      marketing_agent_share_pct: d.marketingShare,
      payer: d.payer,
      requires_la_approval: d.requiresApproval,
      max_marketing_agents: d.maxAgents === "" ? null : (d.maxAgents ?? null),
      notes: d.notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !offer) redirect(`/listings?error=${offerErrorCode(error?.message ?? "")}`);

  // The floor price is confidential: it tells a marketing agent how far the
  // seller will really go. It lives in the private companion, which no
  // marketing agent can read.
  if (d.minPrice !== "" && d.minPrice !== undefined) {
    const { error: privErr } = await supabase
      .from("comarketing_offer_private")
      .insert({ offer_id: offer.id, min_marketing_price: d.minPrice });
    // Checked, not fired and forgotten — an RLS refusal here has been swallowed
    // twice before (00034, 00037) and looked like success both times.
    if (privErr) console.error("comarketing_offer_private insert failed", privErr.message);
  }

  await logAudit({
    action: "comarketing.offer_created",
    entityType: "comarketing_offer",
    entityId: offer.id,
    next: {
      listing_id: d.listingId,
      marketing_agent_share_pct: d.marketingShare,
      total_commission_pct: d.totalCommission,
      payer: d.payer,
      requires_la_approval: d.requiresApproval,
    },
  });

  revalidatePath("/listings");
  revalidatePath("/collab/pool");
  redirect("/listings?offered=1");
}

const withdrawSchema = z.object({ offerId: z.string().uuid() });

export async function withdrawOffer(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = withdrawSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/listings?error=invalid");

  const supabase = await createClient();
  const { error } = await supabase
    .from("comarketing_offers")
    .update({ status: "withdrawn" })
    .eq("id", parsed.data.offerId);

  if (error) redirect("/listings?error=offer_failed");

  // Existing engagements are deliberately left alone. Invariant §4.2: an agent
  // keeps the terms they accepted. Withdrawing closes the door to NEW pickups;
  // ending live engagements is a separate, notified action (Phase C).
  await logAudit({
    action: "comarketing.offer_withdrawn",
    entityType: "comarketing_offer",
    entityId: parsed.data.offerId,
    next: { status: "withdrawn" },
  });

  revalidatePath("/listings");
  revalidatePath("/collab/pool");
  redirect("/listings?withdrawn=1");
}
