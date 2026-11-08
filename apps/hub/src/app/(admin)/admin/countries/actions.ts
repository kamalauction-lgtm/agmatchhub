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
  });
  if (!parsed.success) redirect("/admin/countries?error=invalid");
  const { code, active, defaultLanguage, defaultCurrency, measurementUnit, ingestAgentId } = parsed.data;

  const { data: before } = await supabase
    .from("countries")
    .select("active, default_language, default_currency, measurement_unit, settings")
    .eq("code", code)
    .single();

  // The ingest agent must be a verified agent OF THIS COUNTRY — the route
  // takes the country from the agent, so a mismatch here would mislabel drafts.
  if (ingestAgentId) {
    const { data: a } = await supabase.from("profiles").select("agent_status, country_code").eq("id", ingestAgentId).maybeSingle();
    if (!a || a.agent_status !== "verified" || a.country_code !== code) redirect("/admin/countries?error=ingest_agent");
  }
  const prevSettings = (before?.settings ?? {}) as Record<string, unknown>;
  const settings = { ...prevSettings, ingest: { ...((prevSettings.ingest as object) ?? {}), agent_id: ingestAgentId || null } };

  const { error } = await supabase
    .from("countries")
    .update({
      active,
      default_language: defaultLanguage,
      default_currency: defaultCurrency,
      measurement_unit: measurementUnit,
      settings,
    })
    .eq("code", code);
  if (error) redirect("/admin/countries?error=save_failed");

  await logAudit({
    action: "country.updated",
    entityType: "country",
    entityId: code,
    previous: before ?? undefined,
    next: { active, defaultLanguage, defaultCurrency, measurementUnit, ingestAgentId: ingestAgentId || null },
  });

  redirect("/admin/countries?saved=" + code);
}
