"use server";

import { headers } from "next/headers";
import { market } from "@/config/market";
import { redirect } from "next/navigation";
import { z } from "zod";
import { publicDb } from "./supabase/public";
import { routing, publicPath } from "@/i18n/routing";

/**
 * The inquiry server action. Thin on purpose: real validation, rate limiting,
 * consent capture and lead creation all live inside submit_public_inquiry()
 * in the database, where no caller can skip them. This layer only normalises
 * input, drops obvious bots, and translates the outcome into a redirect.
 */

const schema = z.object({
  slug: z.string().min(1).max(200),
  locale: z.string().min(2).max(5),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(200)
    .optional()
    .or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  inquiryType: z.enum([
    "general",
    "viewing_request",
    "price_question",
    "availability",
    "financing",
  ]),
  consentVersionId: z.string().uuid(),
  consent: z.literal("on"),
  // Honeypot: hidden from humans; anything here is a bot.
  website: z.literal("").or(z.undefined()),
});

/**
 * Normalise a local phone number to E.164, using THIS MARKET's dialling code.
 *
 * "0812…" in Indonesia and "012-345 6789" in Malaysia are both the local
 * convention of writing a national number with a leading zero; which country
 * that zero belongs to is the market's, not a constant. This used to hard-code
 * +62, which on a Malaysian build would have turned every Malaysian buyer's
 * number into an Indonesian one — an undeliverable lead that still looks like
 * a valid phone number, so nothing downstream would flag it.
 *
 * Numbers already in E.164 pass through untouched: overseas buyers exist (§2).
 */
function normalisePhone(raw: string): string {
  const digits = raw.replace(/[\s\-().]/g, "");
  const code = market.phoneCode.replace("+", "");

  if (/^\+[1-9][0-9]{7,14}$/.test(digits)) return digits;
  // Local form: a leading zero standing in for the country code.
  if (/^0[0-9]{7,13}$/.test(digits)) return `${market.phoneCode}${digits.slice(1)}`;
  // Pasted with the country code but no plus.
  if (new RegExp(`^${code}[0-9]{7,13}$`).test(digits)) return `+${digits}`;
  return digits; // let the database's E.164 check reject it
}

/** Hash the caller's IP for rate limiting. The raw IP is never stored. */
async function ipHash(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const salt = process.env.INQUIRY_IP_SALT ?? "dev-salt";
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function submitInquiry(formData: FormData): Promise<void> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));

  // The listing path is rebuilt from validated data where possible; on a
  // malformed slug there is nothing safe to return to, so go home.
  if (!parsed.success) {
    const slug = formData.get("slug");
    const raw = formData.get("locale");
    /* Validation already failed, so nothing here is trusted. An unrecognised
       locale falls back to the market's default rather than being pasted into
       a redirect target. */
    const locale =
      typeof raw === "string" && (routing.locales as readonly string[]).includes(raw)
        ? raw
        : routing.defaultLocale;
    if (typeof slug === "string" && /^[a-z0-9-]{1,200}$/.test(slug)) {
      const field = parsed.error.issues[0]?.path[0] ?? "form";
      redirect(
        `${publicPath(locale, "listing", `/${slug}`)}` +
          `?inquiry=invalid&field=${String(field)}#tanya`
      );
    }
    redirect("/");
  }

  const d = parsed.data;
  const back = publicPath(d.locale, "listing", `/${d.slug}`);

  // Honeypot filled → pretend success. A bot that knows it failed retries
  // smarter; one that thinks it succeeded goes away.
  if (typeof d.website === "string" && d.website !== "") {
    redirect(`${back}?inquiry=sent&ref=TERIMA-KASIH#tanya`);
  }

  const { data, error } = await publicDb().rpc("submit_public_inquiry", {
    p_listing_slug: d.slug,
    p_full_name: d.fullName,
    p_phone: normalisePhone(d.phone),
    p_email: d.email || null,
    p_message: d.message || null,
    p_inquiry_type: d.inquiryType,
    p_locale: d.locale,
    p_consent_version_id: d.consentVersionId,
    p_ip_hash: await ipHash(),
  });

  if (error) {
    redirect(`${back}?inquiry=error#tanya`);
  }

  const result = data as { ok: boolean; error?: string; lead_ref?: string };
  if (!result.ok) {
    const code = result.error ?? "error";
    const known = [
      "invalid_name",
      "invalid_phone",
      "invalid_email",
      "rate_limited",
      "consent_required",
      "listing_not_found",
    ];
    redirect(`${back}?inquiry=${known.includes(code) ? code : "error"}#tanya`);
  }

  redirect(`${back}?inquiry=sent&ref=${result.lead_ref}#tanya`);
}

export type ActiveDeclaration = {
  version_id: string;
  locale: string;
  body: string;
};

/** The active buyer-inquiry consent text, in the page's language. */
export async function getBuyerConsent(locale: string): Promise<ActiveDeclaration | null> {
  const { data, error } = await publicDb()
    .from("public_active_declarations")
    .select("version_id,locale,body")
    .eq("key", "buyer_inquiry");

  if (error || !data?.length) return null;
  const rows = data as ActiveDeclaration[];
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === "id") ?? rows[0];
}
