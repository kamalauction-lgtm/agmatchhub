"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Turning a feature on or off.
 *
 * Gated on `platform.configure` rather than `growth.manage`, even for the
 * growth flags: switching the referral programme off platform-wide is a
 * platform decision, not a campaign one. A growth admin tunes campaigns; a
 * platform admin decides whether the feature exists at all.
 *
 * Every flip is audited with its previous value, because "when did referrals
 * stop paying out" is exactly the question somebody asks a week later.
 */

const schema = z.object({
  key: z.string().trim().min(3).max(60),
  enabled: z.enum(["true", "false"]),
});

export async function toggleFlag(formData: FormData): Promise<void> {
  const actor = await requireCapability("platform.configure");
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/flags?notice=invalid");
  const { key, enabled } = parsed.data;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("feature_flags").select("enabled, name").eq("key", key).maybeSingle();
  if (!before) redirect("/admin/flags?notice=not_found");

  const { error } = await supabase
    .from("feature_flags")
    .update({ enabled: enabled === "true", updated_by: actor.id })
    .eq("key", key);

  if (error) {
    console.error("toggleFlag failed", error.code, error.message);
    redirect("/admin/flags?notice=failed");
  }

  await logAudit({
    action: "platform.feature_flag_changed",
    entityType: "feature_flag",
    previous: { key, enabled: before.enabled },
    next: { key, enabled: enabled === "true", name: before.name },
  });

  revalidatePath("/admin/flags");
  redirect("/admin/flags?notice=updated");
}

/* ---------------------------------------------------------------------------
 * Targeting
 *
 * A targeted flag is on ONLY for the rows in feature_flag_targets. That makes
 * "narrow this to one country" and "switch this off for everyone except one
 * country" the same gesture, which is what an admin actually wants during a
 * pilot. The master switch still wins: off is off, targets or not (00066).
 * ------------------------------------------------------------------------ */

const targetedSchema = z.object({
  key: z.string().trim().min(3).max(60),
  targeted: z.enum(["true", "false"]),
});

export async function setFlagTargeted(formData: FormData): Promise<void> {
  const actor = await requireCapability("platform.configure");
  const parsed = targetedSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/flags?notice=invalid");
  const { key, targeted } = parsed.data;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("feature_flags").select("targeted").eq("key", key).maybeSingle();
  if (!before) redirect("/admin/flags?notice=not_found");

  /* Switching a flag to targeted with no targets yet turns it off for
   * everybody. That is a legitimate thing to want — it is how you stage a
   * rollout — but it is not what somebody clicking a button labelled "limit to
   * specific people" expects to happen this second, so it is refused until at
   * least one target exists. */
  if (targeted === "true") {
    const { count } = await supabase
      .from("feature_flag_targets")
      .select("id", { count: "exact", head: true })
      .eq("flag_key", key);
    if (!count) redirect(`/admin/flags/${key}?notice=needs_target`);
  }

  const { error } = await supabase
    .from("feature_flags")
    .update({ targeted: targeted === "true", updated_by: actor.id })
    .eq("key", key);

  if (error) {
    console.error("setFlagTargeted failed", error.code, error.message);
    redirect(`/admin/flags/${key}?notice=failed`);
  }

  await logAudit({
    action: "platform.feature_flag_targeting_changed",
    entityType: "feature_flag",
    previous: { key, targeted: before.targeted },
    next: { key, targeted: targeted === "true" },
  });

  revalidatePath(`/admin/flags/${key}`);
  revalidatePath("/admin/flags");
  redirect(`/admin/flags/${key}?notice=updated`);
}

const addTargetSchema = z.object({
  key: z.string().trim().min(3).max(60),
  targetType: z.enum(["user", "agency", "country", "campaign"]),
  userId: z.string().uuid().optional().or(z.literal("")),
  agencyId: z.string().uuid().optional().or(z.literal("")),
  countryCode: z.string().trim().max(2).optional().or(z.literal("")),
  campaignId: z.string().uuid().optional().or(z.literal("")),
});

export async function addFlagTarget(formData: FormData): Promise<void> {
  await requireCapability("platform.configure");
  const parsed = addTargetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/flags?notice=invalid");
  const { key, targetType, userId, agencyId, countryCode, campaignId } = parsed.data;

  // The one field the chosen type depends on. Everything else on the form is
  // ignored, so a leftover selection cannot become a second, invisible target.
  const subject =
    targetType === "user" ? userId
    : targetType === "agency" ? agencyId
    : targetType === "country" ? countryCode
    : campaignId;
  if (!subject) redirect(`/admin/flags/${key}?notice=needs_subject`);

  const supabase = await createClient();
  const { error } = await supabase.from("feature_flag_targets").insert({
    flag_key: key,
    target_type: targetType,
    user_id: targetType === "user" ? userId : null,
    agency_id: targetType === "agency" ? agencyId : null,
    country_code: targetType === "country" ? countryCode : null,
    campaign_id: targetType === "campaign" ? campaignId : null,
  });

  if (error) {
    console.error("addFlagTarget failed", error.code, error.message);
    redirect(`/admin/flags/${key}?notice=failed`);
  }

  await logAudit({
    action: "platform.feature_flag_target_added",
    entityType: "feature_flag",
    next: { key, targetType, subject },
  });

  revalidatePath(`/admin/flags/${key}`);
  redirect(`/admin/flags/${key}?notice=target_added`);
}

export async function removeFlagTarget(formData: FormData): Promise<void> {
  await requireCapability("platform.configure");
  const key = String(formData.get("key") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/flags?notice=invalid");

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("feature_flag_targets")
    .select("flag_key, target_type").eq("id", id).maybeSingle();

  await supabase.from("feature_flag_targets").delete().eq("id", id);

  /* Removing the last target of a targeted flag would leave it on for nobody
   * while still reading as enabled. Untarget it instead: back to everyone,
   * which is the state it was in before targeting started. */
  const { count } = await supabase
    .from("feature_flag_targets")
    .select("id", { count: "exact", head: true })
    .eq("flag_key", before?.flag_key ?? key);
  if (!count) {
    await supabase.from("feature_flags").update({ targeted: false }).eq("key", before?.flag_key ?? key);
  }

  await logAudit({
    action: "platform.feature_flag_target_removed",
    entityType: "feature_flag",
    previous: { key: before?.flag_key ?? key, targetType: before?.target_type },
    next: { remainingTargets: count ?? 0 },
  });

  revalidatePath(`/admin/flags/${key}`);
  redirect(`/admin/flags/${key}?notice=target_removed`);
}
