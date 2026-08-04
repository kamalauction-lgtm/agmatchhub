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

  const expiresAt = new Date(
    Date.now() + Number(d.expiresInDays) * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Reuse the request's existing presentation so the SAME client link stays
  // live — edits (add/remove properties, details) update it in place. Only the
  // first time do we mint a new token/link.
  const { data: existing } = await supabase
    .from("client_presentations")
    .select("id")
    .eq("request_id", d.requestId)
    .eq("requesting_agent_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let presId: string;
  const isUpdate = !!existing;

  if (existing) {
    presId = existing.id;
    const { error: upErr } = await supabase
      .from("client_presentations")
      .update({
        title: d.title,
        client_display_name: d.clientDisplayName,
        intro_message: d.introMessage,
        expires_at: expiresAt,
        active: true,
      })
      .eq("id", presId);
    if (upErr) redirect(`${back}?error=save_failed`);

    // Sync the property set: drop unticked (feedback cascades), add newly
    // ticked, and reposition everything to the chosen order.
    const { data: cur } = await supabase
      .from("client_presentation_properties")
      .select("submission_id")
      .eq("presentation_id", presId);
    const curIds = new Set((cur ?? []).map((r) => r.submission_id));
    const wantIds = new Set(d.submissionIds);
    const toRemove = [...curIds].filter((x) => !wantIds.has(x));
    if (toRemove.length) {
      await supabase
        .from("client_presentation_properties")
        .delete()
        .eq("presentation_id", presId)
        .in("submission_id", toRemove);
    }
    for (let i = 0; i < d.submissionIds.length; i += 1) {
      const sid = d.submissionIds[i];
      const note = String(formData.get(`note_${sid}`) ?? "").trim() || null;
      if (curIds.has(sid)) {
        await supabase
          .from("client_presentation_properties")
          .update({ position: i, custom_note: note })
          .eq("presentation_id", presId)
          .eq("submission_id", sid);
      } else {
        await supabase
          .from("client_presentation_properties")
          .insert({ presentation_id: presId, submission_id: sid, position: i, custom_note: note });
      }
    }
  } else {
    const { data: humanId, error: idErr } = await supabase.rpc("next_human_id", {
      p_prefix: "PRE",
    });
    if (idErr) redirect(`${back}?error=save_failed`);

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
    presId = pres.id;

    const rows = d.submissionIds.map((sid, i) => ({
      presentation_id: presId,
      submission_id: sid,
      position: i,
      custom_note: (String(formData.get(`note_${sid}`) ?? "").trim() || null),
    }));
    const { error: propsErr } = await supabase
      .from("client_presentation_properties")
      .insert(rows);
    if (propsErr) redirect(`${back}?error=save_failed`);
  }

  const consentOk = await recordConsent({
    declaration,
    requestRef: d.requestId,
    presentationRef: presId,
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
    action: isUpdate ? "presentation.updated" : "presentation.created",
    entityType: "client_presentation",
    entityId: presId,
    next: { properties: d.submissionIds.length },
  });

  redirect(`/requests/${d.requestId}?presentation=${isUpdate ? "updated" : "1"}`);
}
