"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  code: z.string().length(2),
  active: z.boolean(),
  defaultLanguage: z.enum(["en", "ms", "id", "ar"]),
  defaultCurrency: z.string().length(3),
  measurementUnit: z.enum(["sqft", "sqm"]),
  /* The verified, company-owned profile that server-to-server drafts (Hero →
   * ingest) belong to in this country. Empty = none configured. */
  ingestAgentId: z.union([z.string().uuid(), z.literal("")]),
  /* The written partner agreement that partner-feed photos are used under
   * (P0-e-3b). Recorded on every partner photo's provenance row; empty means
   * partner photos are not stored for this country. */
  ingestAgreementRef: z.string().trim().max(200).regex(/^[^<>]*$/),
  /* Screen 13: editable timezone and terminology. The timezone must be an
   * IANA name the runtime knows; the terms are what the product calls an
   * agent, an owner and a tenant in this country (empty keeps none). */
  timezone: z.union([z.literal(""), z.string().refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return /^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(tz); } catch { return false; } })]),
  termAgent: z.string().trim().max(60).regex(/^[^<>]*$/),
  termOwner: z.string().trim().max(60).regex(/^[^<>]*$/),
  termTenant: z.string().trim().max(60).regex(/^[^<>]*$/),
  /* Screen 2 / owner decision 5: how long a recruiting prospect is kept (30–730 days; empty = not set, so no prospects can be stored). */
  prospectRetentionDays: z.union([z.literal(""), z.coerce.number().int().min(30).max(730)]),
});

export async function updateCountry(formData: FormData) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("has_capability", { p_capability: "platform.configure" });
  if (!isAdmin) redirect("/dashboard");

  const parsed = schema.safeParse({
    code: formData.get("code"),
    active: formData.get("active") === "on",
    defaultLanguage: formData.get("defaultLanguage"),
    defaultCurrency: formData.get("defaultCurrency"),
    measurementUnit: formData.get("measurementUnit"),
    ingestAgentId: formData.get("ingestAgentId") ?? "",
    ingestAgreementRef: formData.get("ingestAgreementRef") ?? "",
    timezone: String(formData.get("timezone") ?? "").trim(),
    termAgent: formData.get("termAgent") ?? "",
    termOwner: formData.get("termOwner") ?? "",
    termTenant: formData.get("termTenant") ?? "",
    prospectRetentionDays: String(formData.get("prospectRetentionDays") ?? "").trim(),
  });
  if (!parsed.success) redirect("/admin/countries?error=invalid");
  const { code, active, defaultLanguage, defaultCurrency, measurementUnit, ingestAgentId, ingestAgreementRef, timezone, termAgent, termOwner, termTenant, prospectRetentionDays } = parsed.data;

  const { data: before } = await supabase
    .from("countries")
    .select("active, default_language, default_currency, measurement_unit, settings, timezone, terminology")
    .eq("code", code)
    .single();

  // The ingest agent must be a verified agent OF THIS COUNTRY — the route
  // takes the country from the agent, so a mismatch here would mislabel drafts.
  if (ingestAgentId) {
    const { data: a } = await supabase.from("profiles").select("agent_status, country_code").eq("id", ingestAgentId).maybeSingle();
    if (!a || a.agent_status !== "verified" || a.country_code !== code) redirect("/admin/countries?error=ingest_agent");
  }
  const prevSettings = (before?.settings ?? {}) as Record<string, unknown>;
  const settings: Record<string, unknown> = { ...prevSettings, ingest: { ...((prevSettings.ingest as object) ?? {}), agent_id: ingestAgentId || null, agreement_ref: ingestAgreementRef || null } };
  if (prospectRetentionDays === "") delete settings.prospect_retention_days; else settings.prospect_retention_days = prospectRetentionDays;
  // Terminology keeps any other keys (e.g. MY licence_fields); the three terms are set or cleared.
  const terminology: Record<string, unknown> = { ...((before?.terminology as Record<string, unknown> | null) ?? {}) };
  for (const [k, v] of [["agent", termAgent], ["owner", termOwner], ["tenant", termTenant]] as const) {
    if (v) terminology[k] = v; else delete terminology[k];
  }

  const { error } = await supabase
    .from("countries")
    .update({
      active,
      default_language: defaultLanguage,
      default_currency: defaultCurrency,
      measurement_unit: measurementUnit,
      settings,
      timezone: timezone || null,
      terminology,
    })
    .eq("code", code);
  if (error) redirect("/admin/countries?error=save_failed");

  await logAudit({
    action: "country.updated",
    entityType: "country",
    entityId: code,
    previous: before ?? undefined,
    next: { active, defaultLanguage, defaultCurrency, measurementUnit, ingestAgentId: ingestAgentId || null, ingestAgreementRef: ingestAgreementRef || null, timezone: timezone || null, terminology, prospectRetentionDays: prospectRetentionDays === "" ? null : prospectRetentionDays },
  });

  redirect("/admin/countries?saved=" + code);
}
