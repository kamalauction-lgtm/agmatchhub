"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { draftReply, firstNameOf, type SecretaryDraft } from "@/lib/ai/secretary";
import { qualify } from "@/lib/ai/qualifier";
import { money } from "@/lib/listings/format";

/**
 * Secretary actions on a lead: draft a reply, send it by e-mail.
 *
 * WhatsApp is not sent from here — the agent opens wa.me with the drafted text
 * and presses send on their own phone, which is the only honest way to send
 * WhatsApp without the Business API (Decision 8: Cloud API is a later phase).
 * E-mail does go through the platform (Resend), so it is recorded as the first
 * response and on the lead's timeline.
 *
 * RLS scopes every read here to the assigned agent; the code adds nothing.
 */

type LeadForDraft = {
  id: string; human_readable_id: string; message: string | null; inquiry_type: string; locale: string | null;
  first_responded_at: string | null;
  contacts: { full_name: string; phone: string; email: string | null; preferred_language: string | null } | null;
  listings: {
    title: string; price: number | null; currency: string; rent_period: "monthly" | "yearly" | null; listing_type: string; price_negotiable: boolean | null;
    properties: { property_type: string; regency_name: string | null; district_name: string | null; bedrooms: number | null; building_size: number | null; land_size: number | null } | null;
  } | null;
};

async function loadLead(leadId: string): Promise<LeadForDraft | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select(
      `id, human_readable_id, message, inquiry_type, locale, first_responded_at,
       contacts (full_name, phone, email, preferred_language),
       listings (title, price, currency, rent_period, listing_type, price_negotiable,
                 properties (property_type, regency_name, district_name, bedrooms, building_size, land_size))`,
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!data) return null;
  // PostgREST types embeds as arrays; the FK is many-to-one, so take the one row.
  const one = <T,>(v: unknown): T | null => (Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null));
  const raw = data as unknown as Record<string, unknown>;
  const listing = one<Record<string, unknown>>(raw.listings);
  return {
    ...(raw as unknown as LeadForDraft),
    contacts: one<LeadForDraft["contacts"]>(raw.contacts),
    listings: listing
      ? ({ ...listing, properties: one<NonNullable<LeadForDraft["listings"]>["properties"]>(listing.properties) } as LeadForDraft["listings"])
      : null,
  };
}

export async function draftLeadReply(leadId: string, channel: "whatsapp" | "email"): Promise<SecretaryDraft> {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(leadId).success) throw new Error("bad lead id");
  const lead = await loadLead(leadId);
  if (!lead) throw new Error("lead not found");

  const supabase = await createClient();
  const { data: me } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const locale = ["id", "en", "ms"].includes(lead.locale ?? "") ? (lead.locale as string) : (lead.contacts?.preferred_language ?? "id");
  const tt = await getTranslations({ locale, namespace: "propertyTypes" });
  const p = lead.listings?.properties;
  const priceText =
    lead.listings?.price != null ? money(lead.listings.currency, lead.listings.price, lead.listings.rent_period ?? null) : null;

  const draft = await draftReply({
    locale,
    channel,
    firstName: firstNameOf(lead.contacts?.full_name),
    agentName: me?.display_name ?? "",
    inquiryType: lead.inquiry_type,
    listingTitle: lead.listings?.title ?? "",
    priceText,
    negotiable: lead.listings?.price_negotiable ?? false,
    message: lead.message,
    listing: {
      title: lead.listings?.title,
      type: p?.property_type ? (tt.has(p.property_type as never) ? tt(p.property_type as never) : p.property_type) : null,
      listing_type: lead.listings?.listing_type,
      price: priceText,
      negotiable: lead.listings?.price_negotiable ?? false,
      area: p?.district_name ?? p?.regency_name ?? null,
      bedrooms: p?.bedrooms ?? null,
      building_size_sqm: p?.building_size ?? null,
      land_size_sqm: p?.land_size ?? null,
    },
    userId: user.id,
    leadId,
  });

  // The timeline notes that a draft was made — not what it said.
  await supabase.from("lead_events").insert({
    lead_id: leadId,
    kind: "ai.reply_drafted",
    detail: { channel, source: draft.source, reason: draft.reason ?? null },
    actor_id: user.id,
  });

  return draft;
}

const emailSchema = z.object({
  leadId: z.string().uuid(),
  subject: z.string().trim().min(3).max(150),
  body: z.string().trim().min(10).max(4000),
});

export async function sendLeadEmail(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = emailSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/leads?error=invalid");
  const { leadId, subject, body } = parsed.data;

  const lead = await loadLead(leadId);
  if (!lead) redirect("/leads?error=not_found");
  if (!lead.contacts?.email) redirect("/leads?error=no_email");

  const supabase = await createClient();
  const { data: priv } = await supabase.from("users_private").select("email").eq("user_id", user.id).maybeSingle();

  const sent = await sendEmail({
    to: lead.contacts.email,
    subject,
    heading: subject,
    body,
    replyTo: priv?.email ?? undefined,
  });
  if (!sent) redirect("/leads?error=email_failed");

  const patch: Record<string, unknown> = {};
  if (!lead.first_responded_at) patch.first_responded_at = new Date().toISOString();
  if (Object.keys(patch).length) await supabase.from("leads").update(patch).eq("id", leadId);

  await supabase.from("lead_events").insert({
    lead_id: leadId,
    kind: "email.sent",
    detail: { subject_length: subject.length, body_length: body.length },
    actor_id: user.id,
  });
  await logAudit({ action: "lead.email_sent", entityType: "lead", entityId: leadId, next: { to_domain: lead.contacts.email.split("@")[1] } });

  revalidatePath("/leads");
  redirect("/leads?updated=email");
}

/* ---------------------------------------------------------------------------
 * Qualifier & matcher (E6)
 * ------------------------------------------------------------------------ */

export type LeadIntel = {
  intent: number; reason: string; signals: string[]; suggestedAction: string | null;
  source: "ai" | "rules"; reason_code?: string; model?: string | null;
};

export async function qualifyLead(leadId: string): Promise<LeadIntel> {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(leadId).success) throw new Error("bad lead id");
  const lead = await loadLead(leadId);
  if (!lead) throw new Error("lead not found");
  const locale = await getLocale();

  const supabase = await createClient();
  const { count: events } = await supabase.from("lead_events").select("id", { count: "exact", head: true }).eq("lead_id", leadId);
  const p = lead.listings?.properties;
  const result = await qualify({
    message: lead.message, inquiryType: lead.inquiry_type, locale,
    listing: {
      title: lead.listings?.title, listing_type: lead.listings?.listing_type, property_type: p?.property_type,
      area: p?.district_name ?? p?.regency_name ?? null, bedrooms: p?.bedrooms ?? null,
      price: lead.listings?.price != null ? money(lead.listings.currency, lead.listings.price, lead.listings.rent_period ?? null) : null,
    },
    history: { events: events ?? 0, responded: !!lead.first_responded_at },
    userId: user.id, leadId,
  });

  const { error } = await supabase.rpc("lead_intel_upsert", {
    p_lead: leadId, p_intent: result.intent, p_reason: result.reason, p_signals: result.signals,
    p_action: result.suggestedAction, p_source: result.source, p_model: result.model ?? null,
  });
  if (error) console.error("lead_intel_upsert failed", error.message);
  return { ...result, model: result.model ?? null };
}

export type LeadMatch = {
  listing_id: string; human_readable_id: string; slug: string; title: string; price: number | null; currency: string;
  rent_period: string | null; regency_name: string | null; district_name: string | null; bedrooms: number | null;
  building_size: number | null; property_type: string; source: "own" | "pool"; score: number; reasons: string[];
};

export async function findLeadMatches(leadId: string): Promise<LeadMatch[]> {
  await requireUser();
  if (!z.string().uuid().safeParse(leadId).success) throw new Error("bad lead id");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lead_matches", { p_lead: leadId, p_limit: 3 });
  if (error) throw new Error(error.message);
  return ((data ?? []) as LeadMatch[]).map((m) => ({ ...m, price: m.price != null ? Number(m.price) : null, score: Number(m.score) }));
}
