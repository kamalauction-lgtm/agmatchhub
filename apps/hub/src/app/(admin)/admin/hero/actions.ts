"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { linkHeroFor } from "@/lib/hero/link";
import { benefitExpiryIso, benefitReviewIso } from "@/lib/hero/dates";

/** Admin: edit the launch-benefit values, re-check one or all links. Audited. */

function done(notice: string): never {
  redirect(`/admin/hero?notice=${notice}`);
}

const benefitsSchema = z.object({
  enabled: z.enum(["on"]).optional(),
  listing_active_limit: z.coerce.number().int().min(0).max(10_000),
  ai_monthly_usage: z.coerce.number().int().min(0).max(100_000),
  ai_poster_exports: z.coerce.number().int().min(0).max(10_000),
  matchhub_enabled: z.enum(["on"]).optional(),
  comarketing_enabled: z.enum(["on"]).optional(),
  content_studio_level: z.enum(["none", "basic", "advanced"]),
  ai_roles_tier: z.enum(["none", "core", "workforce"]),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  review_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  grace_days: z.coerce.number().int().min(0).max(90),
});

export async function updateHeroBenefits(formData: FormData): Promise<void> {
  const actor = await requireCapability("commercial.manage");
  const parsed = benefitsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) done("invalid");
  const b = parsed.data;
  const supabase = await createClient();
  const { data: before } = await supabase.from("hero_benefits").select("*").limit(1).maybeSingle();
  const patch = {
    enabled: b.enabled === "on",
    listing_active_limit: b.listing_active_limit,
    ai_monthly_usage: b.ai_monthly_usage,
    ai_poster_exports: b.ai_poster_exports,
    matchhub_enabled: b.matchhub_enabled === "on",
    comarketing_enabled: b.comarketing_enabled === "on",
    content_studio_level: b.content_studio_level,
    ai_roles_tier: b.ai_roles_tier,
    expires_at: benefitExpiryIso(b.expires_at),
    review_at: benefitReviewIso(b.review_at),
    grace_days: b.grace_days,
    updated_by: actor.id,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("hero_benefits").update(patch).eq("id", true);
  if (error) { console.error("updateHeroBenefits", error.message); done("failed"); }
  await logAudit({ action: "hero.benefits_changed", entityType: "hero_benefits", previous: before, next: patch });
  revalidatePath("/admin/hero");
  done("updated");
}

/** Re-apply the current values to every linked agent (after editing them). */
export async function regrantAllHero(): Promise<void> {
  await requireCapability("commercial.manage");
  const supabase = await createClient();
  const { data: links } = await supabase.from("hero_links").select("user_id").eq("status", "linked");
  let n = 0;
  for (const l of links ?? []) {
    const { error } = await supabase.rpc("grant_hero_benefits", { p_user: l.user_id });
    if (!error) n++;
  }
  await logAudit({ action: "hero.benefits_regranted", entityType: "hero_benefits", next: { agents: n } });
  revalidatePath("/admin/hero");
  done("regranted");
}

const oneSchema = z.object({ userId: z.string().uuid() });

export async function recheckHeroLink(formData: FormData): Promise<void> {
  await requireCapability("commercial.manage");
  const parsed = oneSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) done("invalid");
  const supabase = await createClient();
  const out = await linkHeroFor(parsed.data.userId, supabase);
  await logAudit({ action: "hero.link_rechecked", entityType: "user", entityId: parsed.data.userId, next: { outcome: out.kind } });
  revalidatePath("/admin/hero");
  done(out.kind);
}
