"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Admin decisions on referrals and rewards.
 *
 * Both actions are reversible-by-record rather than destructive: invalidating
 * a referral sets a timestamp and a reason, reversing a reward marks it
 * REVERSED and revokes the capability it granted. Nothing is deleted, because
 * a fraud review that erases its own evidence is not a review.
 *
 * A heuristic on the growth page decides who to LOOK at. These actions are how
 * a person decides what to DO — §45 is explicit that flags must not auto-ban.
 */

const reverseSchema = z.object({
  rewardId: z.string().uuid(),
  reason: z.string().trim().min(1).max(300),
});

export async function reverseReward(formData: FormData): Promise<void> {
  await requireCapability("growth.manage");
  const parsed = reverseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/growth?notice=invalid");

  const supabase = await createClient();
  // The RPC re-checks the capability in the database, so this cannot be
  // bypassed by calling it another way.
  const { data, error } = await supabase.rpc("reverse_referral_reward", {
    p_reward: parsed.data.rewardId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("reverseReward failed", error.code, error.message);
    redirect("/admin/growth?notice=failed");
  }
  if (data !== true) redirect("/admin/growth?notice=already");

  await logAudit({
    action: "referral.reward_reversed",
    entityType: "referral_reward",
    entityId: parsed.data.rewardId,
    next: { reason: parsed.data.reason },
  });

  revalidatePath("/admin/growth");
  redirect("/admin/growth?notice=reversed");
}

const invalidateSchema = z.object({
  referralId: z.string().uuid(),
  reason: z.string().trim().min(1).max(300),
});

export async function invalidateReferral(formData: FormData): Promise<void> {
  const actor = await requireCapability("growth.manage");
  const parsed = invalidateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/growth?notice=invalid");

  const supabase = await createClient();
  const { error } = await supabase
    .from("referrals")
    .update({
      invalidated_at: new Date().toISOString(),
      invalidated_by: actor.id,
      invalidate_reason: parsed.data.reason,
    })
    .eq("id", parsed.data.referralId);

  if (error) {
    console.error("invalidateReferral failed", error.code, error.message);
    redirect("/admin/growth?notice=failed");
  }

  /* Rewards already granted on this referral are deliberately NOT reversed
   * automatically. Invalidating says "this referral does not count from now
   * on"; taking back capability an agent has already been using is a separate,
   * heavier decision, and it gets its own button and its own audit line. */
  await logAudit({
    action: "referral.invalidated",
    entityType: "referral",
    entityId: parsed.data.referralId,
    next: { reason: parsed.data.reason },
  });

  revalidatePath("/admin/growth");
  redirect("/admin/growth?notice=invalidated");
}
