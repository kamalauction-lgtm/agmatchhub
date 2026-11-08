"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { researchComparables, type ResearchResult } from "@/lib/ai/research";
import { draftOutreach, type OutreachDraft } from "@/lib/ai/outreach";
import { crossborderBrief, type CrossborderBrief } from "@/lib/ai/crossborder";
import { coachObjection, coachPractice, type ObjectionAdvice, type PracticeFeedback } from "@/lib/ai/coach";
import { extractRequirement, type RequirementResult } from "@/lib/ai/requirement";
import { summariseOffer, type OfferSummary } from "@/lib/ai/offer-summary";
import { translateFields, type Target, type TranslationResult } from "@/lib/ai/translate";
import { weekStart } from "@/lib/ai/weekly-review";

/**
 * Server actions for the standalone AI tools under /ai/*. Each one checks the
 * session, validates shape with Zod, and hands the typed input to its
 * library; the library decides whether a model is called (runAi) and what
 * the deterministic answer is otherwise. Nothing here writes to a listing,
 * a lead or a client.
 */

const researchSchema = z.object({
  country: z.string().length(2),
  listingType: z.enum(["sale", "rent"]),
  propertyType: z.string().min(2).max(40),
  regency: z.string().max(120).optional().nullable(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional().nullable(),
  withAi: z.boolean().default(true),
});
export async function runResearch(raw: unknown): Promise<ResearchResult> {
  const user = await requireUser();
  const locale = await getLocale();
  const d = researchSchema.parse(raw);
  return researchComparables(
    { country: d.country, listingType: d.listingType, propertyType: d.propertyType, regency: d.regency || null, bedrooms: d.bedrooms ?? null },
    { userId: user.id, locale, withAi: d.withAi },
  );
}

const outreachSchema = z.object({
  property: z.string().trim().min(5).max(400),
  source: z.string().trim().max(300).default(""),
  offer: z.string().trim().max(400).default(""),
  channel: z.enum(["whatsapp", "email"]),
  ownerName: z.string().trim().max(80).optional().nullable(),
});
export async function runOutreach(raw: unknown): Promise<OutreachDraft> {
  const user = await requireUser();
  const locale = await getLocale();
  const d = outreachSchema.parse(raw);
  const supabase = await createClient();
  const [{ data: profile }, { data: agent }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("agent_profiles").select("agency_name").eq("user_id", user.id).maybeSingle(),
  ]);
  return draftOutreach(
    { ...d, ownerName: d.ownerName || null, agentName: profile?.display_name ?? "", agencyName: agent?.agency_name ?? null },
    { userId: user.id, locale },
  );
}

const crossborderSchema = z.object({
  listingCountry: z.string().length(2),
  buyerCountry: z.string().length(2),
  listingId: z.string().uuid().optional().nullable(),
  withAi: z.boolean().default(true),
});
export async function runCrossborder(raw: unknown): Promise<CrossborderBrief> {
  const user = await requireUser();
  const locale = await getLocale();
  const d = crossborderSchema.parse(raw);
  return crossborderBrief({ listingId: d.listingId ?? null, listingCountry: d.listingCountry, buyerCountry: d.buyerCountry, userId: user.id, locale, withAi: d.withAi });
}

export async function runObjection(raw: unknown): Promise<ObjectionAdvice> {
  const user = await requireUser();
  const locale = await getLocale();
  const d = z.object({ text: z.string().trim().min(3).max(1000), context: z.string().trim().max(600).default("") }).parse(raw);
  return coachObjection({ text: d.text, context: d.context, userId: user.id, locale });
}

export async function runPractice(raw: unknown): Promise<PracticeFeedback> {
  const user = await requireUser();
  const locale = await getLocale();
  const d = z.object({ scenarioKey: z.string().min(2).max(40), reply: z.string().trim().min(3).max(2000) }).parse(raw);
  return coachPractice({ scenarioKey: d.scenarioKey, reply: d.reply, userId: user.id, locale });
}

export async function extractRequirementAction(raw: unknown): Promise<RequirementResult> {
  const user = await requireUser();
  const locale = await getLocale();
  const d = z.object({ chat: z.string().trim().min(10).max(8000) }).parse(raw);
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("country_code, preferred_currency").eq("id", user.id).maybeSingle();
  const country = profile?.country_code ?? null;
  const currency = profile?.preferred_currency ?? (country === "MY" ? "MYR" : country === "ID" ? "IDR" : null);
  return extractRequirement({ chat: d.chat, userId: user.id, locale, country, currency });
}

export async function summariseOfferAction(raw: unknown): Promise<OfferSummary | null> {
  const user = await requireUser();
  const locale = await getLocale();
  const d = z.object({ offerId: z.string().uuid(), role: z.enum(["ra", "sa"]) }).parse(raw);
  return summariseOffer({ offerId: d.offerId, role: d.role, userId: user.id, locale });
}

/** Translate a drafted reply (Secretary panel) — the text never leaves the agent's screen except to the model. */
export async function translateReply(raw: unknown): Promise<TranslationResult> {
  const user = await requireUser();
  const locale = await getLocale();
  const d = z.object({ text: z.string().trim().min(2).max(4000), target: z.enum(["en", "id", "ms"]) }).parse(raw);
  return translateFields({ text: d.text }, d.target as Target, locale, { userId: user.id, locale, refType: "reply_translate" });
}

/** "Write it again" for the weekly review: clears this week's cached paragraph. */
export async function regenerateWeeklyReview(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.rpc("ai_clear_weekly_review", { p_user: user.id, p_week: weekStart() });
  revalidatePath("/ai/review");
  redirect("/ai/review?fresh=1");
}
