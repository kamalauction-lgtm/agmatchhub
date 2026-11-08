"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Admin CRUD for marketplace advertising banners (migration 00047).
 *
 * "Who put that on the homepage" is a question that gets asked after the fact,
 * usually in a hurry, so every one of these writes is audited with enough of
 * the row to answer it without a database session.
 */

/**
 * Image sources we can actually render.
 *
 * next/image is configured with `remotePatterns` limited to the Supabase host,
 * so an arbitrary third-party CDN URL would publish as a broken image on the
 * homepage — the single most visible place to have one. Rejecting it here, with
 * a message that says what IS allowed, is kinder than letting it save and
 * discovering it in production.
 */
const imagePath = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => v === "" || v.startsWith("/") || !/^https?:\/\//i.test(v),
    "external_image"
  );

const bannerSchema = z.object({
  slot: z.enum(["home_top", "home_middle"]),
  title: z.string().trim().min(3).max(120),
  subtitle: z.string().trim().max(240).optional(),
  advertiserLabel: z.string().trim().max(120).optional(),
  locationLabel: z.string().trim().max(120).optional(),
  priceLabel: z.string().trim().max(80).optional(),
  imagePath: imagePath.optional(),
  linkUrl: z.string().trim().max(500).optional(),
  ctaLabel: z.string().trim().max(60).optional(),
  position: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.coerce.boolean().default(false),
  startsAt: z.string().trim().optional(),
  endsAt: z.string().trim().optional(),
});

/** Empty string means "not set", which is NULL — not an empty campaign field. */
const orNull = (v: string | undefined) => (v && v.length ? v : null);

/** Maps the guard's exceptions onto messages an admin can act on. */
function errorCode(message: string): string {
  if (message.includes("name the advertiser")) return "advertiser_required";
  if (message.includes("end must come after")) return "bad_window";
  return "save_failed";
}

function rowFrom(d: z.infer<typeof bannerSchema>) {
  return {
    slot: d.slot,
    title: d.title,
    subtitle: orNull(d.subtitle),
    advertiser_label: orNull(d.advertiserLabel),
    location_label: orNull(d.locationLabel),
    price_label: orNull(d.priceLabel),
    image_path: orNull(d.imagePath),
    link_url: orNull(d.linkUrl),
    cta_label: orNull(d.ctaLabel),
    position: d.position,
    is_active: d.isActive,
    starts_at: orNull(d.startsAt),
    ends_at: orNull(d.endsAt),
  };
}

export async function createBanner(formData: FormData): Promise<void> {
  const user = await requireCapability("commercial.manage");
  const parsed = bannerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const external = parsed.error.issues.some((i) => i.message === "external_image");
    redirect(`/admin/banners?error=${external ? "external_image" : "invalid"}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_banners")
    .insert({ ...rowFrom(parsed.data), created_by: user.id })
    .select("id")
    .single();

  if (error || !data) redirect(`/admin/banners?error=${errorCode(error?.message ?? "")}`);

  await logAudit({
    action: "banner.created",
    entityType: "site_banner",
    entityId: data.id,
    next: rowFrom(parsed.data),
  });

  revalidatePath("/admin/banners");
  redirect("/admin/banners?done=created");
}

export async function updateBanner(formData: FormData): Promise<void> {
  await requireCapability("commercial.manage");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/banners?error=invalid");

  const parsed = bannerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const external = parsed.error.issues.some((i) => i.message === "external_image");
    redirect(`/admin/banners?error=${external ? "external_image" : "invalid"}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("site_banners").update(rowFrom(parsed.data)).eq("id", id);
  if (error) redirect(`/admin/banners?error=${errorCode(error.message)}`);

  await logAudit({
    action: "banner.updated",
    entityType: "site_banner",
    entityId: id,
    next: rowFrom(parsed.data),
  });

  revalidatePath("/admin/banners");
  redirect("/admin/banners?done=updated");
}

/**
 * Toggle live/paused.
 *
 * Separate from update because it is the action an admin reaches for in a
 * hurry — a campaign that must come down now should not require opening a form
 * and re-submitting fourteen fields correctly.
 */
export async function toggleBanner(formData: FormData): Promise<void> {
  await requireCapability("commercial.manage");
  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("isActive") ?? "") === "true";
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/banners?error=invalid");

  const supabase = await createClient();
  const { error } = await supabase.from("site_banners").update({ is_active: next }).eq("id", id);
  if (error) redirect(`/admin/banners?error=${errorCode(error.message)}`);

  await logAudit({
    action: next ? "banner.activated" : "banner.paused",
    entityType: "site_banner",
    entityId: id,
    next: { is_active: next },
  });

  revalidatePath("/admin/banners");
  redirect(`/admin/banners?done=${next ? "activated" : "paused"}`);
}

export async function deleteBanner(formData: FormData): Promise<void> {
  await requireCapability("commercial.manage");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/banners?error=invalid");

  const supabase = await createClient();

  // Read it first: once the row is gone the audit entry is the only remaining
  // record of what ran on the homepage and when.
  const { data: before } = await supabase
    .from("site_banners")
    .select("slot, title, advertiser_label, link_url, starts_at, ends_at")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("site_banners").delete().eq("id", id);
  if (error) redirect("/admin/banners?error=save_failed");

  await logAudit({
    action: "banner.deleted",
    entityType: "site_banner",
    entityId: id,
    next: before ?? {},
  });

  revalidatePath("/admin/banners");
  redirect("/admin/banners?done=deleted");
}
