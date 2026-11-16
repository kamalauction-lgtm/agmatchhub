"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyLinkSession, linkCookieName } from "@/lib/request-links";
import { getActiveDeclaration, recordConsent } from "@/lib/consents";
import { logAudit } from "@/lib/audit";
import { getLocale } from "next-intl/server";
import { agentHasAccess } from "@/lib/agents/access";
import {
  propertyFieldsSchema, deriveRisk, buildSubmissionRow, hasSourceDetail,
  IMG_MIMES, MAX_IMG_BYTES,
} from "@/lib/submissions/core";

// Agent flow: property fields + the actively-ticked SA declaration (§28).
const schema = propertyFieldsSchema.extend({
  declarationAccepted: z.literal("on"),
});

export async function submitProperty(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const back = `/r/${encodeURIComponent(token)}/submit`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);

  if (!(await agentHasAccess(supabase))) redirect("/dashboard");

  // Link must be valid AND this browser must have passed the password gate
  const service = createServiceClient();
  const { data: link } = await service
    .from("request_links")
    .select("id, request_id, active, expires_at, property_requests(public_listing)")
    .eq("token", token)
    .maybeSingle();
  if (!link || !link.active || new Date(link.expires_at) < new Date()) {
    redirect(`/r/${encodeURIComponent(token)}`);
  }
  const reqMetaGate = Array.isArray(link.property_requests)
    ? link.property_requests[0]
    : link.property_requests;
  const unlocked =
    !!(reqMetaGate as { public_listing?: boolean } | null)?.public_listing ||
    verifyLinkSession((await cookies()).get(linkCookieName(link.id))?.value, link.id);
  if (!unlocked) redirect(`/r/${encodeURIComponent(token)}`);

  const raw: Record<string, string> = {};
  for (const key of Object.keys(schema.shape)) raw[key] = String(formData.get(key) ?? "");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const declMissing = parsed.error.issues.some((i) => i.path[0] === "declarationAccepted");
    redirect(`${back}?error=${declMissing ? "declaration_required" : "invalid_fields"}`);
  }
  const d = parsed.data;

  // All media optional (owner request): cover if provided, up to 5 gallery
  const cover = formData.get("coverImage") as File | null;
  const hasCover = !!cover && cover.size > 0;
  const gallery = (formData.getAll("galleryImages") as File[])
    .filter((f) => f && f.size > 0).slice(0, 5);

  // Resolve country from the search box (name or code, any case);
  // falls back to the requirement's country when blank or unmatched.
  let countryCode: string | null = null;
  if (d.countrySearch) {
    const q = d.countrySearch.trim();
    const { data: byCode } = await service
      .from("countries").select("code").ilike("code", q).maybeSingle();
    if (byCode) countryCode = byCode.code;
    else {
      const { data: byName } = await service
        .from("countries").select("code").ilike("name", `%${q}%`).limit(1).maybeSingle();
      if (byName) countryCode = byName.code;
    }
  }

  const uploadImage = async (file: File, label: string): Promise<string> => {
    const ext = IMG_MIMES[file.type];
    if (!ext) throw new Error("invalid_file_type");
    if (file.size > MAX_IMG_BYTES) throw new Error("file_too_large");
    const path = `${user.id}/${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("property-original-private")
      .upload(path, file, { contentType: file.type });
    if (error) throw new Error("upload_failed");
    return path;
  };

  let coverPath: string | null = null;
  const galleryPaths: string[] = [];
  try {
    if (hasCover) coverPath = await uploadImage(cover!, "cover");
    for (const g of gallery) galleryPaths.push(await uploadImage(g, "gallery"));
  } catch (e) {
    redirect(`${back}?error=${e instanceof Error ? e.message : "upload_failed"}`);
  }

  // Declaration: re-fetch active version server-side and record exact text (§31)
  const locale = await getLocale();
  const declaration = await getActiveDeclaration("supply_agent_submission", locale);
  if (!declaration) redirect(`${back}?error=save_failed`);

  const { data: humanId, error: idErr } = await supabase.rpc("next_human_id", { p_prefix: "SUB" });
  if (idErr) redirect(`${back}?error=save_failed`);

  const risk = deriveRisk(d.sourceType, d.sourcePermission);
  const resolvedCountry = countryCode
    ?? (await service.from("property_requests").select("country_code").eq("id", link.request_id).single()).data?.country_code
    ?? "MY";

  const { data: inserted, error: insErr } = await supabase
    .from("property_submissions")
    .insert(buildSubmissionRow(d, {
      humanId,
      requestId: link.request_id,
      supplyAgentId: user.id,
      countryCode: resolvedCountry,
      risk,
    }))
    .select("id")
    .single();
  if (insErr || !inserted) redirect(`${back}?error=save_failed`);
  const submissionId = inserted.id;

  // Confidential companion + source detail + media + history (RLS: SA-own)
  if (d.minAcceptablePrice != null || d.internalRemarks) {
    await supabase.from("property_submission_private").insert({
      submission_id: submissionId,
      min_acceptable_price: d.minAcceptablePrice,
      internal_remarks: d.internalRemarks,
    });
  }
  if (hasSourceDetail(d.sourceType)) {
    await supabase.from("property_submission_sources").insert({
      submission_id: submissionId,
      source_agent_name: d.sourceAgentName,
      source_agency: d.sourceAgency,
      permission_to_share: d.sourcePermission === "" ? null : d.sourcePermission === "yes",
      chain_agent_count: d.chainAgentCount,
    });
  }
  const mediaRows = [
    ...(coverPath
      ? [{ submission_id: submissionId, storage_path: coverPath, kind: "image" as const, is_cover: true, position: 0 }]
      : []),
    ...galleryPaths.map((p, i) => ({
      submission_id: submissionId, storage_path: p, kind: "image" as const,
      is_cover: !coverPath && i === 0, position: i + 1,
    })),
  ];
  if (mediaRows.length) {
    await supabase.from("property_submission_media").insert(mediaRows);
  }
  await supabase.from("submission_status_history").insert({
    submission_id: submissionId,
    previous_status: null,
    new_status: "submitted",
    changed_by: user.id,
    actor_role: "supply_agent",
  });

  await recordConsent({ declaration, submissionRef: submissionId });
  await logAudit({
    action: "submission.created",
    entityType: "property_submission",
    entityId: submissionId,
    next: { human_id: humanId, request_id: link.request_id, risk },
  });

  // §73: open the commission-sharing proposal immediately when commission was
  // declared. Default 50:50; SA may adjust the split. Never blocks submission.
  if (d.commissionType) {
    try {
      const listing = d.listingSplit ?? 50;
      const buyer = d.buyerSplit ?? 50;
      const isFifty = Math.round(listing * 100) === 5000 && Math.round(buyer * 100) === 5000;
      const pctOk = Math.round((listing + buyer) * 100) === 10000;
      await supabase.rpc("propose_commission_version", {
        p_submission_id: submissionId,
        p_method: isFifty || !pctOk ? "fifty_fifty" : "custom_percentage",
        p_listing_pct: isFifty || !pctOk ? null : listing,
        p_buyer_pct: isFifty || !pctOk ? null : buyer,
        p_total_type: d.commissionType,
        p_total_percentage: d.commissionType === "percentage" ? d.commissionPercentage : null,
        p_total_amount: d.commissionType === "fixed" ? d.commissionAmount : null,
        p_calculation_basis: d.monthlyRental != null && d.askingPrice == null
          ? "monthly_rental" : "asking_price",
        p_payer_type: "owner",
        p_custom_terms: d.commissionConditions,
      });
    } catch (e) {
      console.error("[submission] commission proposal failed:",
        e instanceof Error ? e.message : e);
    }
  }

  redirect(`/submissions?submitted=${humanId}`);
}
