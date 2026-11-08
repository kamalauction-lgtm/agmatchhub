"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { notify } from "@/lib/notifications";
import { signLinkSession, verifyLinkSession, linkCookieName } from "@/lib/request-links";

const FAIL_WINDOW_MIN = 10;
const FAIL_LIMIT = 8;

async function loadPresentation(token: string) {
  const service = createServiceClient();
  const { data } = await service
    .from("client_presentations")
    .select("id, active, expires_at, password, allow_feedback, allow_offer, allow_viewing_request, requesting_agent_id, request_id")
    .eq("token", token)
    .maybeSingle();
  return data;
}

async function logEvent(presentationId: string, event: string) {
  const service = createServiceClient();
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await service
    .from("client_access_logs")
    .insert({ presentation_id: presentationId, event, user_agent: ua });
}

export async function unlockPresentation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "").trim().toUpperCase();
  const p = await loadPresentation(token);
  if (!p || !p.active || new Date(p.expires_at) < new Date()) {
    redirect(`/p/${token}?error=unavailable`);
  }

  const service = createServiceClient();
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60 * 1000).toISOString();
  const { count: fails } = await service
    .from("client_access_logs")
    .select("id", { count: "exact", head: true })
    .eq("presentation_id", p.id)
    .eq("event", "password_fail")
    .gte("created_at", since);
  if ((fails ?? 0) >= FAIL_LIMIT) {
    await logEvent(p.id, "locked_out");
    redirect(`/p/${token}?error=locked`);
  }

  if (password !== p.password) {
    await logEvent(p.id, "password_fail");
    redirect(`/p/${token}?error=wrong_password`);
  }

  await logEvent(p.id, "password_ok");
  await service.rpc("increment_presentation_views", { p_presentation_id: p.id });
  (await cookies()).set(linkCookieName(p.id), signLinkSession(p.id), {
    httpOnly: true,
    sameSite: "lax",
    path: `/p/${token}`,
  });
  redirect(`/p/${token}`);
}

const feedbackSchema = z.object({
  token: z.string().min(10),
  ppid: z.string().uuid().optional().or(z.literal("")),
  kind: z.enum(["shortlist", "not_interested", "rank", "question",
    "offer_suggestion", "viewing_request", "comment"]),
  rankValue: z.enum(["", "first", "second", "third", "maybe"]),
  message: z.string().trim().max(2000),
  offerAmount: z.string().trim(),
  preferredDate: z.string().trim(),
});

export async function submitClientFeedback(formData: FormData) {
  const parsed = feedbackSchema.safeParse({
    token: formData.get("token"),
    ppid: formData.get("ppid"),
    kind: formData.get("kind"),
    rankValue: String(formData.get("rankValue") ?? ""),
    message: String(formData.get("message") ?? ""),
    offerAmount: String(formData.get("offerAmount") ?? ""),
    preferredDate: String(formData.get("preferredDate") ?? ""),
  });
  if (!parsed.success) redirect("/");
  const d = parsed.data;

  const p = await loadPresentation(d.token);
  if (!p || !p.active || new Date(p.expires_at) < new Date()) {
    redirect(`/p/${d.token}?error=unavailable`);
  }
  // Password-gate proof required — client actions never run unauthenticated
  const cookieVal = (await cookies()).get(linkCookieName(p.id))?.value;
  if (!verifyLinkSession(cookieVal, p.id)) redirect(`/p/${d.token}`);

  if (!p.allow_feedback) redirect(`/p/${d.token}`);
  if (d.kind === "offer_suggestion" && !p.allow_offer) redirect(`/p/${d.token}`);
  if (d.kind === "viewing_request" && !p.allow_viewing_request) redirect(`/p/${d.token}`);

  const service = createServiceClient();
  // ppid must belong to this presentation (no cross-presentation injection)
  let ppid: string | null = null;
  if (d.ppid) {
    const { data: pp } = await service
      .from("client_presentation_properties")
      .select("id")
      .eq("id", d.ppid)
      .eq("presentation_id", p.id)
      .maybeSingle();
    if (!pp) redirect(`/p/${d.token}`);
    ppid = pp.id;
  }

  const offerAmount = d.offerAmount === "" ? null : Number(d.offerAmount);
  if (offerAmount != null && (!Number.isFinite(offerAmount) || offerAmount < 0)) {
    redirect(`/p/${d.token}?error=invalid`);
  }

  await service.from("client_feedback").insert({
    presentation_id: p.id,
    presentation_property_id: ppid,
    kind: d.kind,
    rank_value: d.rankValue || null,
    message: d.message || null,
    offer_amount: offerAmount,
    preferred_date: d.preferredDate || null,
  });

  // §40: tell the RA immediately; no confidential values in the payload
  await notify({
    userId: p.requesting_agent_id,
    kind: `client.${d.kind}`,
    href: `/requests/${p.request_id}`,
  });

  redirect(`/p/${d.token}?done=${d.kind}`);
}
