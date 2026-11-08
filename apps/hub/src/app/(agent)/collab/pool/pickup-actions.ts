"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * A marketing agent picking a listing up out of the pool, and dropping it.
 *
 * Note what this action does NOT send: the commission terms. It posts only the
 * offer id. `guard_comarketing_pickup()` writes `accepted_terms`,
 * `accepted_terms_version`, `accepted_at` and `status` from the server's copy
 * of the offer, so the snapshot cannot be authored by the agent accepting it.
 * That is invariant §4.2 and the reason this module is worth building rather
 * than copying — the terms both sides agreed to are the ones the database
 * recorded, and neither party can silently rewrite them.
 */

const pickupSchema = z.object({ offerId: z.string().uuid() });

/** Maps the guard's raised exceptions onto messages an agent can act on. */
function pickupErrorCode(message: string): string {
  if (message.includes("already picked up")) return "already_picked_up";
  if (message.includes("limit of marketing agents")) return "at_capacity";
  if (message.includes("no longer available")) return "gone";
  if (message.includes("changed hands")) return "changed_hands";
  if (message.includes("cannot pick up their own")) return "own_listing";
  return "pickup_failed";
}

export async function pickUpListing(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = pickupSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/collab/pool?error=invalid");

  const supabase = await createClient();
  const { data: engagement, error } = await supabase
    .from("comarketing_engagements")
    .insert({
      offer_id: parsed.data.offerId,
      marketing_agent_id: user.id,
      // accepted_terms* and status are set by the guard trigger, deliberately
      // not here. The column is NOT NULL, so send a placeholder the trigger
      // overwrites rather than leaving it out.
      accepted_terms_version: 0,
      accepted_terms: {},
    })
    .select("id, status")
    .single();

  if (error || !engagement) {
    redirect(`/collab/pool?error=${pickupErrorCode(error?.message ?? "")}`);
  }

  await logAudit({
    action: "comarketing.picked_up",
    entityType: "comarketing_engagement",
    entityId: engagement.id,
    next: { offer_id: parsed.data.offerId, status: engagement.status },
  });

  revalidatePath("/collab/pool");
  revalidatePath("/listings");
  // 'pending' means the listing agent vets each marketing agent — say so
  // rather than showing a success the agent cannot yet act on.
  redirect(`/collab/pool?picked=${engagement.status === "pending" ? "pending" : "1"}`);
}

const dropSchema = z.object({ engagementId: z.string().uuid() });

export async function dropListing(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = dropSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/collab/pool?error=invalid");

  const supabase = await createClient();
  // 'ended' is the only status transition the update guard allows a marketing
  // agent to make on their own engagement.
  const { error } = await supabase
    .from("comarketing_engagements")
    .update({ status: "ended", end_reason: "dropped_by_marketing_agent" })
    .eq("id", parsed.data.engagementId);

  if (error) redirect("/collab/pool?error=pickup_failed");

  await logAudit({
    action: "comarketing.dropped",
    entityType: "comarketing_engagement",
    entityId: parsed.data.engagementId,
    next: { status: "ended", end_reason: "dropped_by_marketing_agent" },
  });

  revalidatePath("/collab/pool");
  revalidatePath("/listings");
  redirect("/collab/pool?dropped=1");
}
