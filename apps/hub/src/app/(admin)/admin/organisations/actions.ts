"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Setting an organisation's commercial treatment.
 *
 * This is the action that makes "change IQI from 100% to 80%" a form
 * submission instead of a deployment. There is deliberately no company name
 * anywhere in this file — the agency is an id from the URL, and the treatment
 * is whatever the admin chose.
 *
 * A price change is versioned, not edited: the previous policy is deactivated
 * and a new one created. Overwriting would destroy the record of what a
 * partner was given and when, which is exactly the kind of thing somebody asks
 * about a year later.
 */

const schema = z.object({
  agencyId: z.string().uuid(),
  treatment: z.enum(["complimentary", "percent_discount", "fixed_price"]),
  value: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  reason: z.string().trim().min(1).max(300),
});

export async function setOrganisationPolicy(formData: FormData): Promise<void> {
  const actor = await requireCapability("commercial.manage");
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/organisations?notice=invalid");
  const { agencyId, treatment, value, reason } = parsed.data;

  const amount = typeof value === "number" ? value : null;
  if (treatment === "percent_discount" && (amount === null || amount > 100)) {
    redirect(`/admin/organisations/${agencyId}?notice=needs_percent`);
  }
  if (treatment === "fixed_price" && amount === null) {
    redirect(`/admin/organisations/${agencyId}?notice=needs_amount`);
  }

  const supabase = await createClient();
  const { data: agency } = await supabase
    .from("agencies").select("name").eq("id", agencyId).maybeSingle();
  if (!agency) redirect("/admin/organisations?notice=not_found");

  // What is in force now, so the audit line can say what changed.
  const { data: existing } = await supabase
    .from("commercial_policy_targets")
    .select("policy_id, commercial_policies(id, name, treatment, percent, amount)")
    .eq("target_type", "agency")
    .eq("agency_id", agencyId);

  const previous = (existing ?? [])
    .map((e) => e.commercial_policies as unknown as
      { id: string; name: string; treatment: string; percent: number | null; amount: number | null } | null)
    .filter(Boolean)[0];

  /* Retire rather than rewrite. The old row keeps its history and stops
     applying; `effective_commercial_policy` ignores inactive policies. */
  if (previous) {
    await supabase
      .from("commercial_policies")
      .update({ is_active: false, updated_by: actor.id })
      .eq("id", previous.id);
  }

  const { data: policy, error } = await supabase
    .from("commercial_policies")
    .insert({
      name: `${agency.name} — ${treatment}`,
      description: reason,
      treatment,
      percent: treatment === "percent_discount" ? amount : null,
      amount: treatment === "fixed_price" ? amount : null,
      currency: treatment === "fixed_price" ? "IDR" : null,
      // Above the platform-wide launch policy (50), below an individual
      // override, matching the precedence model in migration 00062.
      priority: 200,
      reason,
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error || !policy) {
    console.error("setOrganisationPolicy failed", error?.code, error?.message);
    redirect(`/admin/organisations/${agencyId}?notice=failed`);
  }

  const { error: targetErr } = await supabase
    .from("commercial_policy_targets")
    .insert({ policy_id: policy.id, target_type: "agency", agency_id: agencyId });

  if (targetErr) {
    // Without a target the policy applies to nobody, which would be a silent
    // no-op. Roll the policy back rather than leave one behind.
    await supabase.from("commercial_policies").delete().eq("id", policy.id);
    console.error("policy target failed", targetErr.message);
    redirect(`/admin/organisations/${agencyId}?notice=failed`);
  }

  await logAudit({
    action: "commercial.organisation_policy_set",
    entityType: "agency",
    entityId: agencyId,
    previous: previous
      ? { policy: previous.name, treatment: previous.treatment, percent: previous.percent, amount: previous.amount }
      : null,
    next: { treatment, percent: treatment === "percent_discount" ? amount : null,
            amount: treatment === "fixed_price" ? amount : null, reason },
  });

  revalidatePath(`/admin/organisations/${agencyId}`);
  redirect(`/admin/organisations/${agencyId}?notice=applied`);
}
