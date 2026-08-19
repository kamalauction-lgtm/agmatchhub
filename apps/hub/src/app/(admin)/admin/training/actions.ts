"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Admin management of training guides (00054). RLS already restricts writes
 * to platform admins; requireAdmin() here is the router-level gate so a
 * non-admin never reaches a half-working form.
 */

const CATEGORIES = ["platform", "sales", "marketing"] as const;

export async function createGuide(formData: FormData) {
  await requireAdmin();
  const parsed = z
    .object({
      category: z.enum(CATEGORIES),
      position: z.coerce.number().int().min(0).max(999),
    })
    .safeParse({
      category: formData.get("category"),
      position: formData.get("position"),
    });
  if (!parsed.success) redirect("/admin/training?error=invalid");

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("training_guides")
    .insert({ category: parsed.data.category, position: parsed.data.position })
    .select("id")
    .single();
  if (error || !row) redirect("/admin/training?error=save_failed");

  await logAudit({
    action: "training.guide_created",
    entityType: "training_guide",
    entityId: row.id,
    next: parsed.data,
  });
  redirect("/admin/training?saved=1");
}

export async function saveTranslation(formData: FormData) {
  await requireAdmin();
  const parsed = z
    .object({
      guideId: z.string().uuid(),
      locale: z.enum(["en", "ms", "id"]),
      title: z.string().trim().min(3).max(200),
      body: z.string().trim().min(20).max(20000),
    })
    .safeParse({
      guideId: formData.get("guideId"),
      locale: formData.get("locale"),
      title: formData.get("title"),
      body: formData.get("body"),
    });
  if (!parsed.success) redirect("/admin/training?error=invalid");
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("training_guide_translations").upsert({
    guide_id: d.guideId,
    locale: d.locale,
    title: d.title,
    body: d.body,
  });
  if (error) redirect("/admin/training?error=save_failed");

  await logAudit({
    action: "training.translation_saved",
    entityType: "training_guide",
    entityId: d.guideId,
    next: { locale: d.locale, title: d.title },
  });
  redirect("/admin/training?saved=1");
}

export async function togglePublish(formData: FormData) {
  await requireAdmin();
  const parsed = z
    .object({ guideId: z.string().uuid(), publish: z.enum(["true", "false"]) })
    .safeParse({ guideId: formData.get("guideId"), publish: formData.get("publish") });
  if (!parsed.success) redirect("/admin/training?error=invalid");
  const publish = parsed.data.publish === "true";

  const supabase = await createClient();

  // A guide with no translations must not go live — an agent would open an
  // empty page. Cheap server-side guard, mirrored by a hint in the UI.
  if (publish) {
    const { count } = await supabase
      .from("training_guide_translations")
      .select("locale", { count: "exact", head: true })
      .eq("guide_id", parsed.data.guideId);
    if (!count) redirect("/admin/training?error=no_translations");
  }

  const { error } = await supabase
    .from("training_guides")
    .update({ is_published: publish })
    .eq("id", parsed.data.guideId);
  if (error) redirect("/admin/training?error=save_failed");

  await logAudit({
    action: publish ? "training.guide_published" : "training.guide_unpublished",
    entityType: "training_guide",
    entityId: parsed.data.guideId,
  });
  redirect("/admin/training?saved=1");
}

export async function deleteGuide(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ guideId: z.string().uuid() }).safeParse({
    guideId: formData.get("guideId"),
  });
  if (!parsed.success) redirect("/admin/training?error=invalid");

  const supabase = await createClient();
  const { error } = await supabase
    .from("training_guides")
    .delete()
    .eq("id", parsed.data.guideId);
  if (error) redirect("/admin/training?error=save_failed");

  await logAudit({
    action: "training.guide_deleted",
    entityType: "training_guide",
    entityId: parsed.data.guideId,
  });
  redirect("/admin/training?saved=1");
}
