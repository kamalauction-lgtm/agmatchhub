"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  declarationId: z.string().uuid(),
  locale: z.enum(["en", "ms", "id"]),
  body: z.string().trim().min(50).max(20000),
});

export async function publishDeclarationVersion(formData: FormData) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  const parsed = schema.safeParse({
    declarationId: formData.get("declarationId"),
    locale: formData.get("locale"),
    body: formData.get("body"),
  });
  if (!parsed.success) redirect("/admin/legal?error=invalid");
  const { declarationId, locale, body } = parsed.data;

  const { data: latest } = await supabase
    .from("declaration_versions")
    .select("id, version_number")
    .eq("declaration_id", declarationId)
    .eq("locale", locale)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version_number ?? 0) + 1;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: insertErr } = await supabase.from("declaration_versions").insert({
    declaration_id: declarationId,
    version_number: nextVersion,
    locale,
    body,
    active: true,
    created_by: user?.id,
  });
  if (insertErr) redirect("/admin/legal?error=save_failed");

  // Previous version stays stored (immutable) but no longer active (§31)
  if (latest) {
    await supabase
      .from("declaration_versions")
      .update({ active: false })
      .eq("id", latest.id);
  }

  await logAudit({
    action: "legal.version_published",
    entityType: "declaration_version",
    entityId: declarationId,
    next: { locale, version: nextVersion },
  });

  redirect("/admin/legal?published=1");
}
