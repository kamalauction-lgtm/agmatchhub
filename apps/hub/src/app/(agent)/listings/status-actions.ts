"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * The agent stays in charge of their listings, including ones an admin
 * imported or published for them (00133, owner decision 19 Nov 2026):
 *   · Submit for review — a draft, rejected or withdrawn listing goes to the
 *     moderation queue (imports land as drafts; nothing moved them before);
 *   · Withdraw — a listing waiting for review or live comes off the market.
 * Ownership and the allowed moves are enforced by RLS and the listing guards
 * (00030, 00039): an agent can never publish, only moderation does.
 */

const idSchema = z.object({ listingId: z.string().uuid() });

async function move(formData: FormData, from: string[], to: "pending_review" | "withdrawn", action: string) {
  const user = await requireUser();
  const p = idSchema.safeParse({ listingId: formData.get("listingId") });
  if (!p.success) redirect("/listings?error=invalid");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .update({ status: to })
    .eq("id", p.data.listingId)
    .eq("agent_id", user.id)
    .in("status", from)
    .select("id");
  if (error || !(data ?? []).length) redirect("/listings?error=status_not_changed");
  await logAudit({ action, entityType: "listing", entityId: p.data.listingId, next: { status: to } });
  revalidatePath("/listings");
  redirect(`/listings?done=${to}`);
}

export async function submitForReview(formData: FormData) {
  await move(formData, ["draft", "rejected", "withdrawn"], "pending_review", "listing.submitted_for_review");
}

export async function withdrawListing(formData: FormData) {
  await move(formData, ["pending_review", "published"], "withdrawn", "listing.withdrawn_by_agent");
}
