"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { getStudioListings, publicMediaUrl } from "@/lib/studio/listings";
import { buildStudioInput, copyLocaleFor } from "@/lib/studio/input";
import { writeSocialCaption } from "@/lib/ai/listing-writer";
import { planWeek, type PlanPlatform, type PlanSlot } from "@/lib/ai/social-plan-rules";
import { improveWeek, type PlannedWeek } from "@/lib/ai/social-plan";

/**
 * Social Calendar Planner. `planWeekAction` proposes seven posts (rules, then
 * the model if allowed); `scheduleWeek` writes the ones the agent kept into
 * `scheduled_posts` through the same checks the single-post form uses. The
 * publisher is unchanged: what is scheduled is EXACTLY the text shown.
 */
export async function planWeekAction(input: { weekStart: string; withAi: boolean }): Promise<PlannedWeek & { weekStart: string; images: Record<string, string | null> }> {
  const user = await requireUser();
  const locale = await getLocale();
  const d = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), withAi: z.boolean() }).parse(input);
  const supabase = await createClient();
  const [listings, { data: accounts }] = await Promise.all([
    getStudioListings(user.id),
    supabase.from("social_accounts").select("platform").eq("status", "active"),
  ]);
  const published = listings.filter((l) => l.published_at).slice(0, 14);
  const platforms = [...new Set((accounts ?? []).map((a) => (a.platform === "instagram_business" ? "instagram" : "facebook") as PlanPlatform))];
  const facts: Record<string, unknown> = {};
  const images: Record<string, string | null> = {};
  const planListings = await Promise.all(published.map(async (l) => {
    const copyLocale = copyLocaleFor(l);
    const tt = await getTranslations({ locale: copyLocale, namespace: "propertyTypes" });
    const inp = buildStudioInput(l, (slug) => (tt.has(slug as never) ? tt(slug as never) : slug));
    facts[l.id] = { title: inp.title, type: inp.propertyTypeLabel, listing_type: inp.listingType, area: inp.area, regency: inp.regency, bedrooms: inp.bedrooms, bathrooms: inp.bathrooms, building_size_sqm: inp.buildingSize, land_size_sqm: inp.landSize, price: inp.price, currency: l.currency, rent_period: inp.rentPeriod, facilities: inp.facilities, furnishing: inp.furnishing, link: inp.url, language: l.language };
    images[l.id] = publicMediaUrl(l.cover_image_path);
    return { id: l.id, title: l.title, hasPhoto: !!l.cover_image_path, publishedAt: l.published_at, caption: writeSocialCaption(inp) };
  }));
  const slots = planWeek(planListings, platforms, d.weekStart);
  if (!d.withAi || !slots.length) return { slots, source: "rules", weekStart: d.weekStart, images };
  const out = await improveWeek({ weekStart: d.weekStart, slots, facts, userId: user.id, locale });
  return { ...out, weekStart: d.weekStart, images };
}

const slotSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  tz: z.string().max(60),
  platform: z.enum(["facebook", "instagram"]),
  listingId: z.string().uuid(),
  caption: z.string().trim().min(1).max(5000),
  imageUrl: z.string().url().max(1000).nullable(),
});

export async function scheduleWeek(formData: FormData): Promise<void> {
  const user = await requireUser();
  let slots: z.infer<typeof slotSchema>[];
  try { slots = z.array(slotSchema).min(1).max(7).parse(JSON.parse(String(formData.get("slots") ?? "[]"))); } catch { redirect("/studio/plan?error=invalid"); }
  const supabase = await createClient();
  const { data: accounts } = await supabase.from("social_accounts").select("id, platform, status").eq("status", "active");
  const byPlatform = new Map((accounts ?? []).map((a) => [a.platform === "instagram_business" ? "instagram" : "facebook", a]));
  let scheduled = 0;
  for (const s of slots) {
    const account = byPlatform.get(s.platform);
    if (!account) continue;
    if (s.platform === "instagram" && !s.imageUrl) continue;
    const when = new Date(`${s.day}T${s.time}:00${s.tz}`);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) continue;
    const { data: row } = await supabase.from("scheduled_posts").insert({
      user_id: user.id, account_id: account.id, listing_id: s.listingId, platform: account.platform, caption: s.caption, image_url: s.imageUrl, scheduled_at: when.toISOString(),
    }).select("id").single();
    if (row) {
      scheduled++;
      await logAudit({ action: "social.post_scheduled", entityType: "scheduled_post", entityId: row.id, next: { platform: account.platform, listing_id: s.listingId, scheduled_at: when.toISOString(), via: "social_plan" } });
    }
  }
  redirect(scheduled ? `/studio/scheduled?scheduled=${scheduled}` : "/studio/plan?error=nothing_scheduled");
}

export type { PlanSlot };
