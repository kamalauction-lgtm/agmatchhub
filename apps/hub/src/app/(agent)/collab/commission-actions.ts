"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { notify, getSubmissionParties } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";

async function backPath(submissionId: string, userId: string): Promise<string> {
  const parties = await getSubmissionParties(submissionId);
  if (!parties) return "/dashboard";
  return userId === parties.supplyAgentId
    ? `/submissions/${submissionId}`
    : `/requests/${parties.requestId}/s/${submissionId}`;
}

async function notifyOther(submissionId: string, actorId: string, kind: string) {
  const parties = await getSubmissionParties(submissionId);
  if (!parties) return;
  const otherId =
    actorId === parties.supplyAgentId ? parties.requestingAgentId : parties.supplyAgentId;
  const href =
    otherId === parties.supplyAgentId
      ? `/submissions/${submissionId}`
      : `/requests/${parties.requestId}/s/${submissionId}`;
  await notify({ userId: otherId, kind, href });
}

const optNum = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().nonnegative().nullable());

export async function proposeCommission(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z
    .object({
      submissionId: z.string().uuid(),
      method: z.enum(["fifty_fifty", "custom_percentage", "custom_fixed"]),
      listingPct: optNum,
      buyerPct: optNum,
      listingAmt: optNum,
      buyerAmt: optNum,
      customTerms: z.string().trim().max(2000),
      amendmentReason: z.string().trim().max(500),
      totalType: z.enum(["", "percentage", "fixed", "rental_months", "to_be_confirmed"]),
      totalPercentage: optNum,
      totalAmount: optNum,
      calculationBasis: z.enum(["", "final_sale_price", "asking_price",
        "accepted_offer_price", "monthly_rental", "annual_rental", "total_lease_value", "other"]),
      payerType: z.enum(["", "seller", "owner", "landlord", "developer",
        "listing_agency", "supply_agent", "other"]),
    })
    .safeParse({
      submissionId: formData.get("submissionId"),
      method: formData.get("method"),
      listingPct: String(formData.get("listingPct") ?? ""),
      buyerPct: String(formData.get("buyerPct") ?? ""),
      listingAmt: String(formData.get("listingAmt") ?? ""),
      buyerAmt: String(formData.get("buyerAmt") ?? ""),
      customTerms: String(formData.get("customTerms") ?? ""),
      amendmentReason: String(formData.get("amendmentReason") ?? ""),
      totalType: String(formData.get("totalType") ?? ""),
      totalPercentage: String(formData.get("totalPercentage") ?? ""),
      totalAmount: String(formData.get("totalAmount") ?? ""),
      calculationBasis: String(formData.get("calculationBasis") ?? ""),
      payerType: String(formData.get("payerType") ?? ""),
    });
  if (!parsed.success) redirect("/dashboard");
  const d = parsed.data;
  const back = await backPath(d.submissionId, user.id);

  // Server-side split validation also lives in the DB function (§83);
  // this early check just produces a friendlier error.
  if (d.method === "custom_percentage") {
    if (d.listingPct == null || d.buyerPct == null ||
        Math.round((d.listingPct + d.buyerPct) * 100) !== 10000) {
      redirect(`${back}?error=commission_pct_total`);
    }
  }
  if (d.method === "custom_fixed" && (d.listingAmt == null || d.buyerAmt == null)) {
    redirect(`${back}?error=commission_amounts_required`);
  }

  const { data: versionId, error } = await supabase.rpc("propose_commission_version", {
    p_submission_id: d.submissionId,
    p_method: d.method,
    p_listing_pct: d.listingPct,
    p_buyer_pct: d.buyerPct,
    p_listing_amt: d.listingAmt,
    p_buyer_amt: d.buyerAmt,
    p_custom_terms: d.customTerms || null,
    p_amendment_reason: d.amendmentReason || null,
    p_total_type: d.totalType || null,
    p_total_percentage: d.totalPercentage,
    p_total_amount: d.totalAmount,
    p_calculation_basis: d.calculationBasis || null,
    p_payer_type: d.payerType || null,
  });
  if (error) {
    const code = error.message.includes("total 100") ? "commission_pct_total"
      : error.message.includes("amendment reason") ? "commission_reason_required"
      : error.message.includes("exceeds declared total") ? "commission_over_allocated"
      : "collab_failed";
    redirect(`${back}?error=${code}`);
  }

  await logAudit({
    action: "commission.version_proposed",
    entityType: "commission_agreement_version",
    entityId: String(versionId),
  });
  await notifyOther(d.submissionId, user.id, "commission.proposed");
  redirect(back);
}

export async function acceptCommission(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z
    .object({ submissionId: z.string().uuid(), versionId: z.string().uuid() })
    .safeParse({
      submissionId: formData.get("submissionId"),
      versionId: formData.get("versionId"),
    });
  if (!parsed.success) redirect("/dashboard");
  const d = parsed.data;
  const back = await backPath(d.submissionId, user.id);

  const { error } = await supabase.rpc("accept_commission_version", {
    p_version_id: d.versionId,
  });
  if (error) redirect(`${back}?error=collab_failed`);

  await logAudit({
    action: "commission.version_accepted",
    entityType: "commission_agreement_version",
    entityId: d.versionId,
  });
  await notifyOther(d.submissionId, user.id, "commission.accepted");
  redirect(back);
}
