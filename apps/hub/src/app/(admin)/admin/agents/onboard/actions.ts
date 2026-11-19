"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCapability, requireCapabilityIn } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import {
  CONSENT_METHODS, CONSENT_SCOPES, ONBOARD_MESSAGE_COOKIE, ONBOARD_PAGE, temporaryPassword,
} from "@/lib/agents/onboard";

/**
 * An admin opens an account for an agent from another platform (00132).
 *
 * The admin has called the agent and has their permission. The account is
 * created with a temporary password; the agent gets it by email (and the admin
 * sees a ready WhatsApp message once), and must choose their own password at
 * first sign-in. What the agent agreed to, how and when is recorded with the
 * exact wording the admin confirmed.
 *
 * The service role is used only after requireCapabilityIn(agent.invite) for
 * the agent's country.
 */

const schema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  whatsapp: z.string().trim().max(30).optional().or(z.literal("")),
  country: z.string().regex(/^[A-Z]{2}$/),
  sourcePlatform: z.string().trim().max(200).optional().or(z.literal("")),
  method: z.enum(CONSENT_METHODS),
  consentedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
  language: z.enum(["id", "en", "ms"]).default("id"),
  scopes: z.array(z.enum(CONSENT_SCOPES)),
  confirmed: z.literal("on"),
});

/**
 * The consent time is typed in the agent's country's local time
 * (countries.timezone); store it as the correct instant.
 */
function localToUtc(local: string, timeZone: string | null): string {
  const asUtc = new Date(`${local}:00Z`);
  if (!timeZone) return asUtc.toISOString();
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        .formatToParts(asUtc).map((x) => [x.type, x.value]),
    );
    const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    return new Date(asUtc.getTime() - (shown - asUtc.getTime())).toISOString();
  } catch {
    return asUtc.toISOString();
  }
}

async function showOnce(message: string) {
  (await cookies()).set(ONBOARD_MESSAGE_COOKIE, message, {
    httpOnly: true, secure: true, sameSite: "lax", path: ONBOARD_PAGE, maxAge: 300,
  });
}

async function credentialsEmail(to: string, name: string, password: string, language: "id" | "en" | "ms") {
  const t = await getTranslations({ locale: language, namespace: "onboard.email" });
  const base = process.env.APP_BASE_URL ?? "";
  return sendEmail({
    to,
    subject: t("subject"),
    heading: t("heading", { name }),
    body: t("body", { email: to, password }),
    ctaLabel: t("cta"),
    ctaUrl: `${base}/login`,
  });
}

async function whatsappText(name: string, email: string, password: string, language: "id" | "en" | "ms") {
  const t = await getTranslations({ locale: language, namespace: "onboard.whatsapp" });
  return t("message", { name, email, password, url: `${process.env.APP_BASE_URL ?? ""}/login` });
}

export async function onboardAgent(formData: FormData): Promise<void> {
  await requireCapability("agent.invite");
  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse({ ...raw, scopes: formData.getAll("scopes").map(String) });
  if (!parsed.success) redirect(`${ONBOARD_PAGE}?notice=invalid`);
  const d = parsed.data;
  await requireCapabilityIn("agent.invite", d.country, ONBOARD_PAGE);
  const scopes = [...new Set(["open_account", ...d.scopes])] as (typeof CONSENT_SCOPES)[number][];

  const svc = createServiceClient();
  const pattern = d.email.replace(/[\\%_]/g, (c) => "\\" + c);
  const { data: exists } = await svc.from("users_private").select("user_id").ilike("email", pattern).limit(1).maybeSingle();
  if (exists) redirect(`${ONBOARD_PAGE}?notice=email_registered`);

  const password = temporaryPassword();
  const { data: created, error } = await svc.auth.admin.createUser({
    email: d.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: d.fullName, country_code: d.country },
    // Server-only flag the session middleware reads: choose a password first.
    app_metadata: { must_change_password: true },
  });
  if (error || !created.user) {
    console.error("onboardAgent createUser", error?.code, error?.message);
    redirect(`${ONBOARD_PAGE}?notice=failed`);
  }
  const userId = created.user.id;

  const supabase = await createClient();
  const { data: { user: admin } } = await supabase.auth.getUser();
  await svc.from("profiles").update({ must_change_password: true }).eq("id", userId);
  if (d.whatsapp) await svc.from("users_private").update({ whatsapp_number: d.whatsapp }).eq("user_id", userId);

  const { data: countryRow } = await svc.from("countries").select("timezone").eq("code", d.country).maybeSingle();
  const tw = await getTranslations("onboard");
  const wording = tw("consentWording", { scopes: scopes.map((s) => tw(`scope.${s}` as never)).join("; ") });
  const { error: cErr } = await svc.from("agent_onboarding_consents").insert({
    user_id: userId,
    country_code: d.country,
    recorded_by: admin?.id ?? null,
    method: d.method,
    consented_at: localToUtc(d.consentedAt, (countryRow as { timezone?: string | null } | null)?.timezone ?? null),
    scopes,
    source_platform: d.sourcePlatform || null,
    note: d.note || null,
    wording,
    language: d.language,
  });
  if (cErr) console.error("onboardAgent consent", cErr.code, cErr.message);

  const sent = await credentialsEmail(d.email, d.fullName, password, d.language);
  await logAudit({
    action: "agent.onboarded_by_admin",
    entityType: "agent_profile",
    entityId: userId,
    next: { country_code: d.country, scopes, method: d.method, source_platform: d.sourcePlatform || null, email_sent: sent },
  });

  await showOnce(await whatsappText(d.fullName, d.email, password, d.language));
  revalidatePath(ONBOARD_PAGE);
  redirect(`${ONBOARD_PAGE}?notice=${sent ? "created" : "created_email_failed"}`);
}

const resetSchema = z.object({ userId: z.string().uuid(), language: z.enum(["id", "en", "ms"]).default("id") });

/** A new temporary password for an agent who has not signed in yet. */
export async function newTemporaryPassword(formData: FormData): Promise<void> {
  await requireCapability("agent.invite");
  const p = resetSchema.safeParse({ userId: formData.get("userId"), language: formData.get("language") ?? "id" });
  if (!p.success) redirect(`${ONBOARD_PAGE}?notice=invalid`);
  const svc = createServiceClient();
  const { data: profile } = await svc.from("profiles").select("display_name, country_code, must_change_password").eq("id", p.data.userId).maybeSingle();
  if (!profile) redirect(`${ONBOARD_PAGE}?notice=failed`);
  await requireCapabilityIn("agent.invite", profile.country_code, ONBOARD_PAGE);
  if (!profile.must_change_password) redirect(`${ONBOARD_PAGE}?notice=already_active`);

  const { data: priv } = await svc.from("users_private").select("email").eq("user_id", p.data.userId).maybeSingle();
  if (!priv?.email) redirect(`${ONBOARD_PAGE}?notice=failed`);
  const password = temporaryPassword();
  const { error } = await svc.auth.admin.updateUserById(p.data.userId, { password, app_metadata: { must_change_password: true } });
  if (error) redirect(`${ONBOARD_PAGE}?notice=failed`);

  const name = profile.display_name ?? "";
  const sent = await credentialsEmail(priv.email, name, password, p.data.language);
  await logAudit({ action: "agent.temporary_password_reissued", entityType: "agent_profile", entityId: p.data.userId, next: { email_sent: sent } });
  await showOnce(await whatsappText(name, priv.email, password, p.data.language));
  revalidatePath(ONBOARD_PAGE);
  redirect(`${ONBOARD_PAGE}?notice=${sent ? "reissued" : "created_email_failed"}`);
}
