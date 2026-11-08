"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Campaigns and their reward ladders, editable without a developer.
 *
 * §36 asks for "Jakarta Growth Campaign" or "IQI Expansion Campaign" to be
 * possible without code changes. The ladder has always been rows; this is the
 * form that writes them.
 *
 * ONE RULE RUNS THROUGH ALL OF IT: changing a campaign never disturbs rewards
 * already earned. Reward rows carry their own values and their own grants, so
 * editing a rung changes what future milestones pay, not what somebody already
 * has. §37 is explicit about that, and it is also the only behaviour that lets
 * an operator tune a live campaign without fear.
 */

const campaignSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{3,40}$/),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional(),
  countryCode: z.string().trim().length(2).optional().or(z.literal("")),
  requireVerified: z.string().optional(),
  requirePublished: z.string().optional(),
  minListings: z.coerce.number().int().min(1).max(50).default(1),
});

export async function createCampaign(formData: FormData): Promise<void> {
  const actor = await requireCapability("growth.manage");
  const parsed = campaignSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/growth?notice=invalid");
  const { key, name, description, countryCode, requireVerified, requirePublished, minListings } =
    parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("growth_campaigns")
    .insert({
      key,
      name,
      description: description || null,
      country_code: countryCode || null,
      // Unchecked boxes are absent from FormData, so absence means false.
      require_verified: requireVerified === "on",
      require_published_listing: requirePublished === "on",
      min_published_listings: minListings,
      // Created paused. A campaign that starts paying the moment it is saved
      // gives nobody a chance to check the ladder first.
      status: "draft",
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("createCampaign failed", error.code, error.message);
    redirect(error.code === "23505" ? "/admin/growth?notice=key_taken" : "/admin/growth?notice=failed");
  }

  await logAudit({
    action: "growth.campaign_created",
    entityType: "growth_campaign",
    entityId: data!.id,
    next: { key, name, require_verified: requireVerified === "on" },
  });

  revalidatePath("/admin/growth");
  redirect("/admin/growth?notice=campaign_created");
}

const statusSchema = z.object({
  campaignId: z.string().uuid(),
  status: z.enum(["draft", "active", "paused", "ended"]),
});

export async function setCampaignStatus(formData: FormData): Promise<void> {
  await requireCapability("growth.manage");
  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/growth?notice=invalid");

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("growth_campaigns").select("status, name").eq("id", parsed.data.campaignId).maybeSingle();

  const { error } = await supabase
    .from("growth_campaigns")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.campaignId);

  if (error) {
    console.error("setCampaignStatus failed", error.code, error.message);
    redirect("/admin/growth?notice=failed");
  }

  /* Pausing stops FUTURE payouts only — `award_referral_rewards` skips
   * campaigns that are not active. Rewards already granted keep their grants,
   * which is what §37 requires. */
  await logAudit({
    action: "growth.campaign_status_changed",
    entityType: "growth_campaign",
    entityId: parsed.data.campaignId,
    previous: { status: before?.status },
    next: { status: parsed.data.status, name: before?.name },
  });

  revalidatePath("/admin/growth");
  redirect("/admin/growth?notice=campaign_updated");
}

const ruleSchema = z.object({
  campaignId: z.string().uuid(),
  metric: z.enum(["activated_referrals", "network_published_listings", "first_activation"]),
  threshold: z.coerce.number().int().min(1).max(100000),
  recipient: z.enum(["referrer", "referred"]),
  entitlementKey: z.string().trim().max(60).optional().or(z.literal("")),
  value: z.union([z.coerce.number().int().min(1).max(100000), z.literal("")]).optional(),
  recognition: z.string().trim().max(60).optional().or(z.literal("")),
  label: z.string().trim().min(3).max(160),
});

export async function addRewardRule(formData: FormData): Promise<void> {
  await requireCapability("growth.manage");
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/growth?notice=invalid");
  const { campaignId, metric, threshold, recipient, entitlementKey, value, recognition, label } =
    parsed.data;

  // A rung that grants nothing is a rung that silently does nothing.
  if (!entitlementKey && !recognition) redirect("/admin/growth?notice=rule_grants_nothing");
  if (entitlementKey && typeof value !== "number") redirect("/admin/growth?notice=rule_needs_value");

  const supabase = await createClient();
  const { error } = await supabase.from("referral_reward_rules").insert({
    campaign_id: campaignId,
    metric,
    threshold,
    recipient,
    entitlement_key: entitlementKey || null,
    int_value: typeof value === "number" ? value : null,
    recognition: recognition || null,
    label,
  });

  if (error) {
    console.error("addRewardRule failed", error.code, error.message);
    redirect("/admin/growth?notice=failed");
  }

  await logAudit({
    action: "growth.reward_rule_added",
    entityType: "growth_campaign",
    entityId: campaignId,
    next: { metric, threshold, recipient, entitlement: entitlementKey, value, recognition, label },
  });

  revalidatePath("/admin/growth");
  redirect("/admin/growth?notice=rule_added");
}

const ruleToggleSchema = z.object({
  ruleId: z.string().uuid(),
  active: z.enum(["true", "false"]),
});

export async function toggleRewardRule(formData: FormData): Promise<void> {
  await requireCapability("growth.manage");
  const parsed = ruleToggleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/growth?notice=invalid");

  const supabase = await createClient();
  /* Deactivated, not deleted. Deleting the rule would orphan every reward that
   * references it, and the reward ledger is the record of what was given. */
  const { error } = await supabase
    .from("referral_reward_rules")
    .update({ is_active: parsed.data.active === "true" })
    .eq("id", parsed.data.ruleId);

  if (error) {
    console.error("toggleRewardRule failed", error.code, error.message);
    redirect("/admin/growth?notice=failed");
  }

  await logAudit({
    action: "growth.reward_rule_toggled",
    entityType: "referral_reward_rule",
    entityId: parsed.data.ruleId,
    next: { is_active: parsed.data.active === "true" },
  });

  revalidatePath("/admin/growth");
  redirect("/admin/growth?notice=rule_updated");
}
