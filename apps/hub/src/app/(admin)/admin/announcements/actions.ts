"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Composing and publishing announcements.
 *
 * Created as a DRAFT, always. Publishing is a second, deliberate action, and
 * between the two the admin can see exactly how many people the audience rule
 * matches. Broadcasting to the wrong audience cannot be taken back — everyone
 * who read it has read it — so the preview is the whole point of the two-step.
 */

const schema = z.object({
  title: z.string().trim().min(3).max(140),
  body: z.string().trim().min(3).max(2000),
  severity: z.enum(["info", "important", "critical"]),
  audience: z.enum([
    "all", "verified", "unverified", "agency", "country", "plan", "campaign", "inactive",
  ]),
  agencyId: z.string().uuid().optional().or(z.literal("")),
  countryCode: z.string().trim().max(2).optional().or(z.literal("")),
  planKey: z.string().trim().max(40).optional().or(z.literal("")),
  campaignId: z.string().uuid().optional().or(z.literal("")),
  inactiveDays: z.union([z.coerce.number().int().min(1).max(3650), z.literal("")]).optional(),
});

export async function createAnnouncement(formData: FormData): Promise<void> {
  const actor = await requireCapability("platform.configure");
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/announcements?notice=invalid");
  const { title, body, severity, audience, agencyId, countryCode, planKey, campaignId, inactiveDays } =
    parsed.data;

  /* An audience that names a target needs that target, or it silently matches
   * nobody and the admin thinks it went out. */
  if (audience === "agency" && !agencyId) redirect("/admin/announcements?notice=needs_agency");
  if (audience === "country" && !countryCode) redirect("/admin/announcements?notice=needs_country");
  if (audience === "plan" && !planKey) redirect("/admin/announcements?notice=needs_plan");
  if (audience === "campaign" && !campaignId) redirect("/admin/announcements?notice=needs_campaign");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .insert({
      title,
      body,
      severity,
      audience,
      agency_id: agencyId || null,
      country_code: countryCode || null,
      plan_key: planKey || null,
      campaign_id: campaignId || null,
      inactive_days: audience === "inactive" ? (typeof inactiveDays === "number" ? inactiveDays : 30) : null,
      // Never published on creation. See the preview-then-send note above.
      is_published: false,
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("createAnnouncement failed", error.code, error.message);
    redirect("/admin/announcements?notice=failed");
  }

  await logAudit({
    action: "platform.announcement_created",
    entityType: "announcement",
    entityId: data!.id,
    next: { title, severity, audience },
  });

  revalidatePath("/admin/announcements");
  redirect("/admin/announcements?notice=created");
}

const publishSchema = z.object({
  id: z.string().uuid(),
  publish: z.enum(["true", "false"]),
});

export async function setAnnouncementPublished(formData: FormData): Promise<void> {
  await requireCapability("platform.configure");
  const parsed = publishSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/announcements?notice=invalid");
  const { id, publish } = parsed.data;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("announcements").select("title, audience, is_published").eq("id", id).maybeSingle();
  if (!before) redirect("/admin/announcements?notice=not_found");

  // How many it actually reached, recorded at the moment of sending — the
  // audience rule may match a different number next month.
  const { data: reach } = await supabase.rpc("announcement_audience_count", { p_announcement: id });

  const { error } = await supabase
    .from("announcements").update({ is_published: publish === "true" }).eq("id", id);

  if (error) {
    console.error("setAnnouncementPublished failed", error.code, error.message);
    redirect("/admin/announcements?notice=failed");
  }

  await logAudit({
    action: publish === "true" ? "platform.announcement_published" : "platform.announcement_unpublished",
    entityType: "announcement",
    entityId: id,
    previous: { is_published: before.is_published },
    next: { is_published: publish === "true", audience: before.audience, reached: reach ?? null },
  });

  revalidatePath("/admin/announcements");
  redirect(`/admin/announcements?notice=${publish === "true" ? "published" : "unpublished"}`);
}

export async function deleteAnnouncement(formData: FormData): Promise<void> {
  await requireCapability("platform.configure");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/announcements?notice=invalid");

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("announcements").select("title, is_published").eq("id", id).maybeSingle();

  /* Only a draft may be deleted. Something people have already read is part of
   * the record of what they were told, and removing it would leave their read
   * receipts pointing at nothing. Published announcements get unpublished. */
  if (before?.is_published) redirect("/admin/announcements?notice=cannot_delete_published");

  await supabase.from("announcements").delete().eq("id", id);

  await logAudit({
    action: "platform.announcement_deleted",
    entityType: "announcement",
    entityId: id,
    previous: { title: before?.title },
  });

  revalidatePath("/admin/announcements");
  redirect("/admin/announcements?notice=deleted");
}
