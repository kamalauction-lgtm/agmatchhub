"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveDeclaration, recordConsent } from "@/lib/consents";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { getLocale } from "next-intl/server";
import {
  propertyFieldsSchema, deriveRisk, buildSubmissionRow, hasSourceDetail,
  IMG_MIMES, MAX_IMG_BYTES,
} from "@/lib/submissions/core";
import { adminCreateAgent, emailAgentCredentials } from "@/lib/agents/admin-create";
import { CRED_COOKIE } from "@/lib/agents/constants";

const newAgentSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  mobileNumber: z.string().trim().max(40).optional().or(z.literal("")),
  whatsappNumber: z.string().trim().max(40).optional().or(z.literal("")),
  agencyName: z.string().trim().max(160).optional().or(z.literal("")),
  licenceType: z.string().trim().max(40).optional().or(z.literal("")),
  licenceNumber: z.string().trim().max(80).optional().or(z.literal("")),
});

export async function addPropertyOnBehalf(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "");
  const back = `/admin/requests/${encodeURIComponent(requestId)}/add-property`;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("has_capability", { p_capability: "request.manage" });
  if (!isAdmin) redirect("/dashboard");

  const service = createServiceClient();
  const { data: req } = await service
    .from("property_requests")
    .select("id, country_code, requesting_agent_id, human_readable_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) redirect("/admin/requests");

  // ---- Resolve the supply agent (existing pick or new account) ----------
  const mode = String(formData.get("agentMode") ?? "existing");
  let agentId: string;
  let newCred: { email: string; name: string; password: string } | null = null;

  if (mode === "new") {
    const parsed = newAgentSchema.safeParse({
      displayName: formData.get("displayName") ?? "",
      email: formData.get("email") ?? "",
      mobileNumber: formData.get("mobileNumber") ?? "",
      whatsappNumber: formData.get("whatsappNumber") ?? "",
      agencyName: formData.get("agencyName") ?? "",
      licenceType: formData.get("licenceType") ?? "",
      licenceNumber: formData.get("licenceNumber") ?? "",
    });
    if (!parsed.success) redirect(`${back}?error=agent_invalid`);
    const a = parsed.data;
    const res = await adminCreateAgent({
      displayName: a.displayName,
      email: a.email,
      mobileNumber: a.mobileNumber || null,
      whatsappNumber: a.whatsappNumber || null,
      agencyName: a.agencyName || null,
      licenceType: a.licenceType || null,
      licenceNumber: a.licenceNumber || null,
      countryCode: req.country_code ?? null,
      adminId: user.id,
    });
    if (!res.ok) redirect(`${back}?error=${res.error === "email_in_use" ? "email_in_use" : "agent_failed"}`);
    agentId = res.userId;
    newCred = { email: a.email, name: a.displayName, password: res.password };
    await emailAgentCredentials({ to: a.email, displayName: a.displayName, password: res.password });
  } else {
    const aid = z.string().uuid().safeParse(formData.get("agentId"));
    if (!aid.success) redirect(`${back}?error=agent_required`);
    const { data: prof } = await service.from("profiles").select("id").eq("id", aid.data).maybeSingle();
    if (!prof) redirect(`${back}?error=agent_required`);
    agentId = aid.data;
  }

  // ---- Validate property fields (shared schema) -------------------------
  const raw: Record<string, string> = {};
  for (const key of Object.keys(propertyFieldsSchema.shape)) raw[key] = String(formData.get(key) ?? "");
  const parsed = propertyFieldsSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))].slice(0, 6).join(",");
    redirect(`${back}?error=invalid_fields&fields=${encodeURIComponent(fields)}`);
  }
  const d = parsed.data;

  // Resolve country from the search box, else the requirement's country.
  let countryCode: string | null = null;
  if (d.countrySearch) {
    const q = d.countrySearch.trim();
    const { data: byCode } = await service.from("countries").select("code").ilike("code", q).maybeSingle();
    if (byCode) countryCode = byCode.code;
    else {
      const { data: byName } = await service.from("countries").select("code").ilike("name", `%${q}%`).limit(1).maybeSingle();
      if (byName) countryCode = byName.code;
    }
  }
  const resolvedCountry = countryCode ?? req.country_code ?? "MY";

  // ---- Optional media (uploaded to the AGENT's private folder) ----------
  const coverFile = formData.get("coverImage") as File | null;
  const hasCover = !!coverFile && coverFile.size > 0;
  const gallery = (formData.getAll("galleryImages") as File[]).filter((f) => f && f.size > 0).slice(0, 5);

  const uploadImage = async (file: File, label: string): Promise<string> => {
    const ext = IMG_MIMES[file.type];
    if (!ext) throw new Error("invalid_file_type");
    if (file.size > MAX_IMG_BYTES) throw new Error("file_too_large");
    const path = `${agentId}/${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await service.storage
      .from("property-original-private")
      .upload(path, file, { contentType: file.type });
    if (error) throw new Error("upload_failed");
    return path;
  };

  let coverPath: string | null = null;
  const galleryPaths: string[] = [];
  try {
    if (hasCover) coverPath = await uploadImage(coverFile!, "cover");
    for (const g of gallery) galleryPaths.push(await uploadImage(g, "gallery"));
  } catch (e) {
    redirect(`${back}?error=${e instanceof Error ? e.message : "upload_failed"}`);
  }

  // ---- Insert the submission (service role; attributed to the agent) ----
  const { data: humanId } = await service.rpc("next_human_id", { p_prefix: "SUB" });
  if (!humanId) redirect(`${back}?error=save_failed`);
  const risk = deriveRisk(d.sourceType, d.sourcePermission);

  const { data: inserted, error: insErr } = await service
    .from("property_submissions")
    .insert(buildSubmissionRow(d, {
      humanId,
      requestId,
      supplyAgentId: agentId,
      countryCode: resolvedCountry,
      risk,
      createdByAdminId: user.id,
    }))
    .select("id")
    .single();
  if (insErr || !inserted) redirect(`${back}?error=save_failed`);
  const submissionId = inserted.id;

  if (d.minAcceptablePrice != null || d.internalRemarks) {
    await service.from("property_submission_private").insert({
      submission_id: submissionId,
      min_acceptable_price: d.minAcceptablePrice,
      internal_remarks: d.internalRemarks,
    });
  }
  if (hasSourceDetail(d.sourceType)) {
    await service.from("property_submission_sources").insert({
      submission_id: submissionId,
      source_agent_name: d.sourceAgentName,
      source_agency: d.sourceAgency,
      permission_to_share: d.sourcePermission === "" ? null : d.sourcePermission === "yes",
      chain_agent_count: d.chainAgentCount,
    });
  }
  const mediaRows = [
    ...(coverPath ? [{ submission_id: submissionId, storage_path: coverPath, kind: "image" as const, is_cover: true, position: 0 }] : []),
    ...galleryPaths.map((p, i) => ({
      submission_id: submissionId, storage_path: p, kind: "image" as const,
      is_cover: !coverPath && i === 0, position: i + 1,
    })),
  ];
  if (mediaRows.length) await service.from("property_submission_media").insert(mediaRows);

  await service.from("submission_status_history").insert({
    submission_id: submissionId,
    previous_status: null,
    new_status: "submitted",
    changed_by: user.id,
    actor_role: "admin",
  });

  // Admin accepts the SA declaration on the agent's behalf (§28/§31).
  const locale = await getLocale();
  const declaration = await getActiveDeclaration("supply_agent_submission", locale);
  if (declaration) await recordConsent({ declaration, submissionRef: submissionId });

  await logAudit({
    action: "submission.created_on_behalf",
    entityType: "property_submission",
    entityId: submissionId,
    next: { human_id: humanId, request_id: requestId, supply_agent_id: agentId, risk },
  });

  // §73 commission proposal, attributed to the agent (admin variant RPC).
  if (d.commissionType) {
    try {
      const listing = d.listingSplit ?? 50;
      const buyer = d.buyerSplit ?? 50;
      const isFifty = Math.round(listing * 100) === 5000 && Math.round(buyer * 100) === 5000;
      const pctOk = Math.round((listing + buyer) * 100) === 10000;
      await service.rpc("propose_commission_version_admin", {
        p_submission_id: submissionId,
        p_admin_id: user.id,
        p_method: isFifty || !pctOk ? "fifty_fifty" : "custom_percentage",
        p_listing_pct: isFifty || !pctOk ? null : listing,
        p_buyer_pct: isFifty || !pctOk ? null : buyer,
        p_total_type: d.commissionType,
        p_total_percentage: d.commissionType === "percentage" ? d.commissionPercentage : null,
        p_total_amount: d.commissionType === "fixed" ? d.commissionAmount : null,
        p_calculation_basis: d.monthlyRental != null && d.askingPrice == null ? "monthly_rental" : "asking_price",
        p_payer_type: "owner",
        p_custom_terms: d.commissionConditions,
      });
    } catch (e) {
      console.error("[on-behalf] commission proposal failed:", e instanceof Error ? e.message : e);
    }
  }

  // The AGENT is notified (email + push on their own account) — the point of
  // on-behalf entry is that the agent stays in the loop.
  await notify({
    userId: agentId,
    kind: "submission.added_for_you",
    payload: { ref: humanId },
    href: "/submissions",
  });

  // One-time credential reveal for a freshly created account (cookie, not URL).
  if (newCred) {
    (await cookies()).set(CRED_COOKIE, JSON.stringify(newCred), {
      httpOnly: true, secure: true, sameSite: "lax", path: "/admin", maxAge: 300,
    });
    redirect(`/admin/requests/${requestId}?done=added_new_agent`);
  }
  redirect(`/admin/requests/${requestId}?done=added`);
}
