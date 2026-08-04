"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateLinkToken, generateLinkPassword } from "@/lib/request-links";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approve", "amendment", "cancel"]),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  expiryDays: z.coerce.number().int().min(1).max(365).default(30),
});

export async function reviewRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  const parsed = schema.safeParse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    notes: formData.get("notes"),
    expiryDays: formData.get("expiryDays") || 30,
  });
  if (!parsed.success) redirect("/admin/requests?error=invalid");
  const { requestId, decision, notes, expiryDays } = parsed.data;

  const { data: request } = await supabase
    .from("property_requests")
    .select("status, expiry_date, human_readable_id")
    .eq("id", requestId)
    .single();
  if (!request) redirect("/admin/requests?error=not_found");
  if (!["pending_admin_approval", "resubmitted", "under_admin_review"].includes(request.status)) {
    redirect(`/admin/requests/${requestId}?error=wrong_status`);
  }

  if (decision !== "approve" && !notes) {
    redirect(`/admin/requests/${requestId}?error=notes_required`);
  }

  if (decision === "amendment") {
    await supabase
      .from("property_requests")
      .update({ status: "amendment_required", amendment_reason: notes })
      .eq("id", requestId);
    await logAudit({
      action: "request.amendment_required",
      entityType: "property_request",
      entityId: requestId,
      reason: notes || undefined,
    });
    redirect(`/admin/requests/${requestId}?done=amendment`);
  }

  if (decision === "cancel") {
    await supabase
      .from("property_requests")
      .update({ status: "cancelled", amendment_reason: notes })
      .eq("id", requestId);
    await logAudit({
      action: "request.cancelled_by_admin",
      entityType: "property_request",
      entityId: requestId,
      reason: notes || undefined,
    });
    redirect(`/admin/requests/${requestId}?done=cancel`);
  }

  // Approve: activate request + generate the secure share link (§15)
  const token = generateLinkToken();
  const password = generateLinkPassword();
  const expiresAt = request.expiry_date
    ? new Date(`${request.expiry_date}T23:59:59Z`)
    : new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  const { error: statusErr } = await supabase
    .from("property_requests")
    .update({
      status: "link_active",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      amendment_reason: null,
    })
    .eq("id", requestId);
  if (statusErr) redirect(`/admin/requests/${requestId}?error=save_failed`);

  const { error: linkErr } = await supabase.from("request_links").insert({
    request_id: requestId,
    token,
    password,
    active: true,
    expires_at: expiresAt.toISOString(),
    created_by: user.id,
  });
  if (linkErr) redirect(`/admin/requests/${requestId}?error=save_failed`);

  await logAudit({
    action: "request.approved_link_generated",
    entityType: "property_request",
    entityId: requestId,
    next: { human_id: request.human_readable_id, expires_at: expiresAt.toISOString() },
  });

  redirect(`/admin/requests/${requestId}?done=approve`);
}
