"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { brand } from "@/config/brand";
import { routing, publicPath } from "@/i18n/routing";
import { publicDb } from "./supabase/public";
import { ipHash, normalisePhone } from "./inquiry-shared";
import { countryName, getInternationalBySlug } from "./international";
import { displayTitle } from "./listings";

/**
 * The international enquiry action: record the lead, THEN open WhatsApp.
 *
 * The order is the point. `submit_international_enquiry()` validates, checks
 * consent, rate-limits and stores the enquiry, and only then returns the
 * WhatsApp number of the country's person in charge. The buyer is sent to
 * wa.me with a message already written; if they never press send, the lead
 * still exists and the PIC can call them. WhatsApp only, never SMS (rule 11).
 *
 * Like the local inquiry action this is thin: every rule that matters is in
 * the database function, where no caller can skip it.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{2,160}$/;

const schema = z.object({
  slug: z.string().regex(SLUG),
  locale: z.string().min(2).max(5),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  email: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  consentVersionId: z.string().uuid(),
  consent: z.literal("on"),
  // Honeypot: hidden from humans; anything here is a bot.
  website: z.literal("").or(z.undefined()),
});

const KNOWN_ERRORS = [
  "invalid_name",
  "invalid_phone",
  "invalid_email",
  "message_too_long",
  "listing_not_found",
  "consent_required",
  "rate_limited",
];

/** Which outcome a failed field maps to, so the message names the problem. */
const FIELD_ERRORS: Record<string, string> = {
  fullName: "invalid_name",
  phone: "invalid_phone",
  email: "invalid_email",
  message: "message_too_long",
  consent: "consent_required",
  consentVersionId: "consent_required",
};

function safeLocale(raw: unknown): string {
  return typeof raw === "string" && (routing.locales as readonly string[]).includes(raw)
    ? raw
    : routing.defaultLocale;
}

export async function submitInternationalEnquiry(formData: FormData): Promise<void> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    // Nothing is trusted yet: the return path is rebuilt only from a slug and
    // a locale that pass their own checks, otherwise back to the list.
    const locale = safeLocale(formData.get("locale"));
    const slug = formData.get("slug");
    if (typeof slug === "string" && SLUG.test(slug)) {
      const field = String(parsed.error.issues[0]?.path[0] ?? "");
      redirect(
        `${publicPath(locale, "international", `/${slug}`)}?enquiry=${FIELD_ERRORS[field] ?? "invalid"}#enquiry`
      );
    }
    redirect(publicPath(locale, "international"));
  }

  const d = parsed.data;
  const locale = safeLocale(d.locale);
  const page = publicPath(locale, "international", `/${d.slug}`);
  const back = (outcome: string) => `${page}?enquiry=${outcome}#enquiry`;

  // Honeypot filled → pretend success. A bot that thinks it worked goes away.
  if (typeof d.website === "string" && d.website !== "") redirect(back("received"));

  const { data, error } = await publicDb().rpc("submit_international_enquiry", {
    p_slug: d.slug,
    p_full_name: d.fullName,
    p_phone: normalisePhone(d.phone),
    p_email: d.email || null,
    p_message: d.message || null,
    p_locale: locale,
    p_consent_version_id: d.consentVersionId,
    p_ip_hash: await ipHash(),
  });

  if (error) {
    console.error(`international enquiry failed: ${error.message}`);
    redirect(back("error"));
  }

  const result = (data ?? {}) as { ok?: boolean; error?: string; whatsapp?: string | null };
  if (!result.ok) {
    const code = result.error ?? "error";
    redirect(back(KNOWN_ERRORS.includes(code) ? code : "error"));
  }

  // The enquiry is stored. From here nothing may turn that into an error page:
  // with no PIC, or no usable number, the buyer gets the plain confirmation.
  const digits = (result.whatsapp ?? "").replace(/\D/g, "");
  if (!digits) redirect(back("received"));

  let text = "";
  try {
    const [t, listing] = await Promise.all([
      getTranslations({ locale, namespace: "international" }),
      getInternationalBySlug(d.slug),
    ]);
    text = t("whatsappMessage", {
      name: d.fullName,
      title: listing ? displayTitle(listing.title) : d.slug,
      country: listing ? countryName(listing.country_code, locale) : "",
      url: `${brand.siteUrl.replace(/\/+$/, "")}${page}`,
    });
  } catch (err) {
    console.error(`international enquiry message failed: ${err instanceof Error ? err.message : "unknown"}`);
  }

  redirect(`https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`);
}
