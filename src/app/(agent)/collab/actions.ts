"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { detectContactDetails } from "@/lib/contact-detection";
import { notify, getSubmissionParties } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";

/** Where to send the actor back: RA and SA view the same submission on different routes. */
async function backPath(submissionId: string, userId: string): Promise<string> {
  const parties = await getSubmissionParties(submissionId);
  if (!parties) return "/dashboard";
  return userId === parties.supplyAgentId
    ? `/submissions/${submissionId}`
    : `/requests/${parties.requestId}/s/${submissionId}`;
}

async function notifyOther(
  submissionId: string,
  actorId: string,
  kind: string,
  payload: Record<string, string | number> = {},
) {
  const parties = await getSubmissionParties(submissionId);
  if (!parties) return;
  const otherId =
    actorId === parties.supplyAgentId ? parties.requestingAgentId : parties.supplyAgentId;
  const href =
    otherId === parties.supplyAgentId
      ? `/submissions/${submissionId}`
      : `/requests/${parties.requestId}/s/${submissionId}`;
  await notify({ userId: otherId, kind, payload, href });
}

// ---------------------------------------------------------------------------
// Messaging (§24)
// ---------------------------------------------------------------------------

export async function sendMessage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z
    .object({
      submissionId: z.string().uuid(),
      body: z.string().trim().min(1).max(4000),
    })
    .safeParse({
      submissionId: formData.get("submissionId"),
      body: formData.get("body"),
    });
  if (!parsed.success) redirect("/dashboard");
  const { submissionId, body } = parsed.data;
  const back = await backPath(submissionId, user.id);

  // Thread (one per submission) — RLS enforces participation
  let { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("submission_id", submissionId)
    .maybeSingle();
  if (!conv) {
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({ submission_id: submissionId })
      .select("id")
      .single();
    if (error || !created) redirect(`${back}?error=collab_failed`);
    conv = created;
  }

  const flagReason = detectContactDetails(body);
  const { error: msgErr } = await supabase.from("messages").insert({
    conversation_id: conv.id,
    sender_id: user.id,
    body,
    flagged: !!flagReason,
    flag_reason: flagReason,
  });
  if (msgErr) redirect(`${back}?error=collab_failed`);

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conv.id);

  if (flagReason) {
    await logAudit({
      action: "message.flagged",
      entityType: "message",
      entityId: conv.id,
      reason: flagReason,
    });
  }
  await notifyOther(submissionId, user.id, "message.new");
  redirect(back);
}

// ---------------------------------------------------------------------------
// Offers (§27)
// ---------------------------------------------------------------------------

export async function submitOffer(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z
    .object({
      submissionId: z.string().uuid(),
      offerType: z.enum(["purchase", "rental"]),
      amount: z.string().trim().transform(Number).pipe(z.number().positive()),
      currency: z.string().length(3),
      conditions: z.string().trim().max(2000),
      validUntil: z.string().trim(),
    })
    .safeParse({
      submissionId: formData.get("submissionId"),
      offerType: formData.get("offerType"),
      amount: formData.get("amount"),
      currency: formData.get("currency"),
      conditions: String(formData.get("conditions") ?? ""),
      validUntil: String(formData.get("validUntil") ?? ""),
    });
  if (!parsed.success) redirect("/dashboard");
  const d = parsed.data;
  const back = await backPath(d.submissionId, user.id);

  const { data: humanId, error: idErr } = await supabase.rpc("next_human_id", {
    p_prefix: "OFF",
  });
  if (idErr) redirect(`${back}?error=collab_failed`);

  const { error } = await supabase.from("offers").insert({
    human_readable_id: humanId,
    submission_id: d.submissionId,
    offered_by: user.id,
    offer_type: d.offerType,
    amount: d.amount,
    currency: d.currency,
    conditions: d.conditions || null,
    valid_until: d.validUntil || null,
  });
  if (error) redirect(`${back}?error=collab_failed`);

  await logAudit({
    action: "offer.submitted",
    entityType: "offer",
    entityId: humanId as string,
  });
  await notifyOther(d.submissionId, user.id, "offer.received", { ref: humanId as string });
  redirect(back);
}

export async function respondOffer(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z
    .object({
      submissionId: z.string().uuid(),
      offerId: z.string().uuid(),
      action: z.enum(["accept", "reject", "counter", "withdraw", "accept_counter", "reject_counter"]),
      counterAmount: z.string().trim(),
      counterTerms: z.string().trim().max(2000),
    })
    .safeParse({
      submissionId: formData.get("submissionId"),
      offerId: formData.get("offerId"),
      action: formData.get("action"),
      counterAmount: String(formData.get("counterAmount") ?? ""),
      counterTerms: String(formData.get("counterTerms") ?? ""),
    });
  if (!parsed.success) redirect("/dashboard");
  const d = parsed.data;
  const back = await backPath(d.submissionId, user.id);

  const amount = d.counterAmount === "" ? null : Number(d.counterAmount);
  if (d.action === "counter" && (amount == null || !Number.isFinite(amount) || amount <= 0)) {
    redirect(`${back}?error=counter_amount_required`);
  }

  const { error } = await supabase.rpc("respond_to_offer", {
    p_offer_id: d.offerId,
    p_action: d.action,
    p_amount: amount,
    p_terms: d.counterTerms || null,
  });
  if (error) redirect(`${back}?error=collab_failed`);

  await logAudit({
    action: `offer.${d.action}`,
    entityType: "offer",
    entityId: d.offerId,
  });
  await notifyOther(d.submissionId, user.id, `offer.${d.action}`);
  redirect(back);
}

// ---------------------------------------------------------------------------
// Viewings (§26)
// ---------------------------------------------------------------------------

export async function requestViewing(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z
    .object({
      submissionId: z.string().uuid(),
      proposedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      proposedTime: z.string().trim().max(40),
      viewingType: z.enum(["physical", "virtual"]),
      notes: z.string().trim().max(1000),
    })
    .safeParse({
      submissionId: formData.get("submissionId"),
      proposedDate: formData.get("proposedDate"),
      proposedTime: String(formData.get("proposedTime") ?? ""),
      viewingType: formData.get("viewingType"),
      notes: String(formData.get("notes") ?? ""),
    });
  if (!parsed.success) redirect("/dashboard");
  const d = parsed.data;
  const back = await backPath(d.submissionId, user.id);

  const { data: humanId, error: idErr } = await supabase.rpc("next_human_id", {
    p_prefix: "VIEW",
  });
  if (idErr) redirect(`${back}?error=collab_failed`);

  const { error } = await supabase.from("viewing_appointments").insert({
    human_readable_id: humanId,
    submission_id: d.submissionId,
    proposed_by: user.id,
    proposed_date: d.proposedDate,
    proposed_time: d.proposedTime || null,
    viewing_type: d.viewingType,
    notes: d.notes || null,
  });
  if (error) redirect(`${back}?error=collab_failed`);

  await notifyOther(d.submissionId, user.id, "viewing.requested", { ref: humanId as string });
  redirect(back);
}

export async function respondViewing(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z
    .object({
      submissionId: z.string().uuid(),
      viewingId: z.string().uuid(),
      status: z.enum(["confirmed", "reschedule_requested", "completed", "cancelled"]),
    })
    .safeParse({
      submissionId: formData.get("submissionId"),
      viewingId: formData.get("viewingId"),
      status: formData.get("status"),
    });
  if (!parsed.success) redirect("/dashboard");
  const d = parsed.data;
  const back = await backPath(d.submissionId, user.id);

  const { error } = await supabase
    .from("viewing_appointments")
    .update({ status: d.status, responded_by: user.id })
    .eq("id", d.viewingId)
    .eq("submission_id", d.submissionId);
  if (error) redirect(`${back}?error=collab_failed`);

  await notifyOther(d.submissionId, user.id, `viewing.${d.status}`);
  redirect(back);
}

// ---------------------------------------------------------------------------
// Contact release (§25)
// ---------------------------------------------------------------------------

export async function requestContactRelease(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z
    .object({ submissionId: z.string().uuid() })
    .safeParse({ submissionId: formData.get("submissionId") });
  if (!parsed.success) redirect("/dashboard");
  const { submissionId } = parsed.data;
  const back = await backPath(submissionId, user.id);

  const { error } = await supabase.rpc("request_contact_release", {
    p_submission_id: submissionId,
  });
  if (error) redirect(`${back}?error=collab_failed`);

  await logAudit({
    action: "contact_release.requested",
    entityType: "contact_release",
    entityId: submissionId,
  });
  await notifyOther(submissionId, user.id, "contact_release.requested");
  redirect(back);
}
