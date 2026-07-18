"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveDeclaration, recordConsent } from "@/lib/consents";
import { notify, getSubmissionParties } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";

const CATEGORIES = [
  "ownership_status", "authority_to_sell", "title_status", "tenure", "encumbrances",
  "caveats", "existing_tenancy", "vacant_possession", "outstanding_charges",
  "litigation", "auction_foreclosure", "developer_restrictions",
  "renovation_restrictions", "usage_restrictions", "zoning", "structural_defects",
  "known_material_defects", "flood_history", "foreign_purchaser_restrictions",
  "financing_limitations", "service_charges", "other",
] as const;

const ACK_ACTIONS = [
  "received", "reviewed", "clarification_required", "document_required",
  "legal_review_required", "ready_for_client", "not_applicable", "disputed",
] as const;

async function paths(submissionId: string, userId: string) {
  const parties = await getSubmissionParties(submissionId);
  if (!parties) return { back: "/dashboard", parties: null };
  const back =
    userId === parties.supplyAgentId
      ? `/submissions/${submissionId}`
      : `/requests/${parties.requestId}/s/${submissionId}`;
  return { back, parties };
}

export async function addDisclosure(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z
    .object({
      submissionId: z.string().uuid(),
      category: z.enum(CATEGORIES),
      description: z.string().trim().min(10).max(4000),
      informationSource: z.string().trim().max(300),
      mandatory: z.literal("on").optional(),
      clientShareable: z.literal("on").optional(),
      requiresLegal: z.literal("on").optional(),
      declarationAccepted: z.literal("on").optional(),
    })
    .safeParse({
      submissionId: formData.get("submissionId"),
      category: formData.get("category"),
      description: formData.get("description"),
      informationSource: String(formData.get("informationSource") ?? ""),
      mandatory: formData.get("mandatory") ?? undefined,
      clientShareable: formData.get("clientShareable") ?? undefined,
      requiresLegal: formData.get("requiresLegal") ?? undefined,
      declarationAccepted: formData.get("declarationAccepted") ?? undefined,
    });
  if (!parsed.success) redirect("/dashboard");
  const d = parsed.data;
  const { back } = await paths(d.submissionId, user.id);

  // §80: active declaration acceptance required on every disclosure change
  if (!d.declarationAccepted) redirect(`${back}?error=disclosure_declaration_required`);
  const locale = await getLocale();
  const declaration = await getActiveDeclaration("supply_agent_disclosure", locale);
  if (!declaration) redirect(`${back}?error=collab_failed`);

  const { data: inserted, error } = await supabase
    .from("legal_disclosures")
    .insert({
      submission_id: d.submissionId,
      category: d.category,
      description: d.description,
      information_source: d.informationSource || null,
      mandatory_disclosure: !!d.mandatory,
      client_shareable: !!d.clientShareable,
      requires_legal_verification: !!d.requiresLegal,
      status: d.requiresLegal ? "requires_legal_verification" : "declared",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !inserted) redirect(`${back}?error=collab_failed`);

  await recordConsent({ declaration, submissionRef: d.submissionId });
  await logAudit({
    action: "disclosure.declared",
    entityType: "legal_disclosure",
    entityId: inserted.id,
    reason: d.category,
  });

  const parties = await getSubmissionParties(d.submissionId);
  if (parties) {
    await notify({
      userId: parties.requestingAgentId,
      kind: "disclosure.declared",
      href: `/requests/${parties.requestId}/s/${d.submissionId}`,
    });
  }
  redirect(back);
}

export async function acknowledgeDisclosure(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z
    .object({
      submissionId: z.string().uuid(),
      disclosureId: z.string().uuid(),
      action: z.enum(ACK_ACTIONS),
      notes: z.string().trim().max(2000),
      clientSafeSummary: z.string().trim().max(2000),
    })
    .safeParse({
      submissionId: formData.get("submissionId"),
      disclosureId: formData.get("disclosureId"),
      action: formData.get("action"),
      notes: String(formData.get("notes") ?? ""),
      clientSafeSummary: String(formData.get("clientSafeSummary") ?? ""),
    });
  if (!parsed.success) redirect("/dashboard");
  const d = parsed.data;
  const { back } = await paths(d.submissionId, user.id);

  if (d.action === "ready_for_client" && d.clientSafeSummary.length < 10) {
    redirect(`${back}?error=disclosure_summary_required`);
  }

  const { error } = await supabase.from("legal_disclosure_acknowledgements").insert({
    disclosure_id: d.disclosureId,
    acknowledged_by: user.id,
    action: d.action,
    notes: d.notes || null,
    client_safe_summary: d.action === "ready_for_client" ? d.clientSafeSummary : null,
  });
  if (error) redirect(`${back}?error=collab_failed`);

  await logAudit({
    action: `disclosure.${d.action}`,
    entityType: "legal_disclosure",
    entityId: d.disclosureId,
  });

  const parties = await getSubmissionParties(d.submissionId);
  if (parties) {
    await notify({
      userId: parties.supplyAgentId,
      kind: "disclosure.acknowledged",
      href: `/submissions/${d.submissionId}`,
    });
  }
  redirect(back);
}
