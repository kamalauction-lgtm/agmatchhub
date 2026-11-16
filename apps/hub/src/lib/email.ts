import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { emailBrandFrom, renderEmailHtml, type EmailBrand } from "@/lib/email-template";

/**
 * Transactional email via Resend's REST API (plain fetch — Workers-safe).
 * No-op until RESEND_API_KEY is configured. Never throws: notification
 * delivery must not break the action that triggered it.
 *
 * D10 (P1-b): the layout's name, tagline and colours come from
 * `brand_settings`, read once per isolate for a few minutes; nothing about the
 * brand is written in code. Without settings the email is plain.
 */

let brandCache: { at: number; brand: EmailBrand } | null = null;
const BRAND_TTL_MS = 5 * 60_000;

async function emailBrand(): Promise<EmailBrand> {
  if (brandCache && Date.now() - brandCache.at < BRAND_TTL_MS) return brandCache.brand;
  let brand = emailBrandFrom(null);
  try {
    const { data } = await createServiceClient()
      .from("brand_settings")
      .select("app_name, app_short_name, tagline, colors")
      .limit(1)
      .maybeSingle();
    brand = emailBrandFrom(data as Parameters<typeof emailBrandFrom>[0]);
  } catch (e) {
    console.error("[email] brand settings unavailable:", e instanceof Error ? e.message : e);
  }
  brandCache = { at: Date.now(), brand };
  return brand;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  heading: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Replies go to a person (the agent), not to the platform's sending address. */
  replyTo?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const brand = await emailBrand();
  const from = process.env.EMAIL_FROM ?? `${brand.appName ?? "Notifications"} <onboarding@resend.dev>`;
  const base = process.env.APP_BASE_URL ?? "";
  const html = renderEmailHtml(brand, { heading: opts.heading, body: opts.body, ctaLabel: opts.ctaLabel, ctaUrl: opts.ctaUrl }, base);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html, ...(opts.replyTo ? { reply_to: opts.replyTo } : {}) }),
    });
    if (!res.ok) {
      console.error("[email] resend failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send error:", e instanceof Error ? e.message : e);
    return false;
  }
}
