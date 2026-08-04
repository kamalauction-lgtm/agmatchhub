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
});

export async function updateCountry(formData: FormData) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  const parsed = schema.safeParse({
    code: formData.get("code"),
    active: formData.get("active") === "on",
    defaultLanguage: formData.get("defaultLanguage"),
    defaultCurrency: formData.get("defaultCurrency"),
    measurementUnit: formData.get("measurementUnit"),
  });
  if (!parsed.success) redirect("/admin/countries?error=invalid");
  const { code, active, defaultLanguage, defaultCurrency, measurementUnit } = parsed.data;

  const { data: before } = await supabase
    .from("countries")
    .select("active, default_language, default_currency, measurement_unit")
    .eq("code", code)
    .single();

  const { error } = await supabase
    .from("countries")
    .update({
      active,
      default_language: defaultLanguage,
      default_currency: defaultCurrency,
      measurement_unit: measurementUnit,
    })
    .eq("code", code);
  if (error) redirect("/admin/countries?error=save_failed");

  await logAudit({
    action: "country.updated",
    entityType: "country",
    entityId: code,
    previous: before ?? undefined,
    next: { active, defaultLanguage, defaultCurrency, measurementUnit },
  });

  redirect("/admin/countries?saved=" + code);
}
