"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveDeclaration, recordConsent } from "@/lib/consents";
import { generateLinkToken, generateLinkPassword } from "@/lib/request-links";
import { logAudit } from "@/lib/audit";
import { getLocale } from "next-intl/server";

const schema = z.object({
  requestId: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  clientDisplayName: z.string().trim().max(120).transform((v) => v || null),
  introMessage: z.string().trim().max(2000).transform((v) => v || null),
  expiresInDays: z.enum(["7", "14", "30", "60"]),
  submissionIds: z.array(z.string().uuid()).min(1),
  declarationAccepted: z.literal("on"),
});

export async function createPresentation(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const requestIdRaw = String(formData.get("requestId") ?? "");
  const back = `/requests/${requestIdRaw}/presentation`;

  const parsed = schema.safeParse({
    requestId: requestIdRaw,
    title: formData.get("title"),
    clientDisplayName: String(formData.get("clientDisplayName") ?? ""),
    introMessage: String(formData.get("introMessage") ?? ""),
    expiresInDays: formData.get("expiresInDays"),
    submissionIds: formData.getAll("submissionIds").map(String),
    declarationAccepted: formData.get("declarationAccepted"),
  });
  if (!parsed.success) {
    const declMissing = !formData.get("declarationAccepted");
    redirect(`${back}?error=${declMissing ? "declaration_required" : "invalid_fields"}`);
  }
  const d = parsed.data;

  // Ownership + submissions really belong to this request and are reviewable
  const { data: request } = await supabase
    .from("property_requests")
    .select("id, requesting_agent_id, country_code")
    .eq("id", d.requestId)
    .single();
  if (!request || request.requesting_agent_id !== user.id) redirect("/requests");

  const { data: subs } = await supabase
    .from("property_submissions")
    .select("id, status")
    .eq("request_id", d.requestId)
    .in("id", d.submissionIds);
  if (!subs || subs.length !== d.submissionIds.length) {
    redirect(`${back}?error=invalid_fields`);
  }

  // §29 declaration — active acceptance, exact wording recorded
  const locale = await getLocale();
  const declaration = await getActiveDeclaration("requesting_agent_presentation", locale);
  if (!declaration) redirect(`${back}?error=save_failed`);

  const { data: humanId, error: idErr } = await supabase.rpc("next_human_id", {
    p_prefix: "PRE",
  });
  if (idErr) redirect(`${back}?error=save_failed`);

  const expiresAt = new Date(
    Date.now() + Number(d.expiresInDays) * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: pres, error: presErr } = await supabase
    .from("client_presentations")
    .insert({
      human_readable_id: humanId,
      request_id: d.requestId,
      requesting_agent_id: user.id,
      title: d.title,
      client_display_name: d.clientDisplayName,
      intro_message: d.introMessage,
      token: generateLinkToken(),
      password: generateLinkPassword(),
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (presErr || !pres) redirect(`${back}?error=save_failed`);

  const rows = d.submissionIds.map((sid, i) => ({
    presentation_id: pres.id,
    submission_id: sid,
    position: i,
    custom_note: (String(formData.get(`note_${sid}`) ?? "").trim() || null),
  }));
  const { error: propsErr } = await supabase
    .from("client_presentation_properties")
    .insert(rows);
  if (propsErr) redirect(`${back}?error=save_failed`);

  const consentOk = await recordConsent({
    declaration,
    requestRef: d.requestId,
    presentationRef: pres.id,
    countryCode: request.country_code,
  });
  if (!consentOk) redirect(`${back}?error=save_failed`);

  // Move shortlisted selections forward in the workflow (§18)
  for (const s of subs) {
    if (["shortlisted", "suitable", "under_review", "submitted"].includes(s.status)) {
      await supabase.rpc("ra_review_submission", {
        p_submission_id: s.id,
        p_new_status: "approved_for_client",
        p_reason: null,
      });
    }
  }

  await logAudit({
    action: "presentation.created",
    entityType: "client_presentation",
    entityId: pres.id,
    next: { properties: d.submissionIds.length },
  });

  redirect(`/requests/${d.requestId}?presentation=1`);
}
