"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { publicDb } from "./supabase/public";
import { routing, publicPath } from "@/i18n/routing";

/**
 * Report a listing (D9). Thin on purpose, like the inquiry action: the
 * validation, rate limit and de-duplication live inside
 * submit_listing_report() in the database (00120), which this app can only
 * call — it holds no key that writes anything directly. The reporter stays
 * anonymous; only a salted hash of the IP is sent, for rate limiting.
 */

const REASONS = ["wrong_info", "already_sold", "duplicate", "wrong_photos", "scam_or_fraud", "offensive", "other"] as const;

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,200}$/),
  locale: z.string().min(2).max(5),
  reason: z.enum(REASONS),
  details: z.string().trim().max(1000).optional().or(z.literal("")),
  website: z.string().optional(), // honeypot
});

async function ipHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const salt = process.env.INQUIRY_IP_SALT ?? "dev-salt";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:report:${ip}`));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function submitReport(formData: FormData): Promise<void> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const slug = formData.get("slug");
    const raw = formData.get("locale");
    const locale = typeof raw === "string" && (routing.locales as readonly string[]).includes(raw) ? raw : routing.defaultLocale;
    if (typeof slug === "string" && /^[a-z0-9-]{1,200}$/.test(slug)) {
      redirect(`${publicPath(locale, "listing", `/${slug}`)}?report=invalid#laporkan`);
    }
    redirect("/");
  }
  const d = parsed.data;
  const locale = (routing.locales as readonly string[]).includes(d.locale) ? d.locale : routing.defaultLocale;
  const back = publicPath(locale, "listing", `/${d.slug}`);

  // A filled honeypot is a bot: pretend success.
  if (d.website) redirect(`${back}?report=sent#laporkan`);

  const { data, error } = await publicDb().rpc("submit_listing_report", {
    p_listing_slug: d.slug,
    p_reason: d.reason,
    p_details: d.details || null,
    p_locale: locale,
    p_ip_hash: await ipHash(),
  });
  if (error) redirect(`${back}?report=error#laporkan`);
  const r = data as { ok: boolean; error?: string };
  if (!r.ok) {
    const known = ["details_required", "details_too_long", "rate_limited", "listing_not_found", "invalid_reason"];
    redirect(`${back}?report=${known.includes(r.error ?? "") ? r.error : "error"}#laporkan`);
  }
  redirect(`${back}?report=sent#laporkan`);
}
