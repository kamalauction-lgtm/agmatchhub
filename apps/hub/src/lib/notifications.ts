import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/webpush";
import { notificationTitle } from "@/lib/notification-titles";

/** High-frequency kinds that stay in-app + push only (no inbox flooding). */
const NO_EMAIL_KINDS = new Set(["message.new"]);

/**
 * Notification fan-out (§40): in-app row + web push + email, all in the
 * recipient's language. Inserted with the service client so users cannot
 * spam each other directly. `payload` must never contain confidential values
 * (no prices, no commission, no client identity).
 */
export async function notify(opts: {
  userId: string;
  kind: string;               // e.g. "message.new", "offer.received"
  payload?: Record<string, string | number>;
  href?: string;
}): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("notifications").insert({
    user_id: opts.userId,
    kind: opts.kind,
    payload: opts.payload ?? {},
    href: opts.href ?? null,
  });
  if (error) console.error("[notify] failed:", opts.kind, error.message);

  // Delivery channels are best-effort; never break the triggering action.
  try {
    const [{ data: profile }, { data: priv }] = await Promise.all([
      service.from("profiles").select("preferred_language, display_name").eq("id", opts.userId).maybeSingle(),
      service.from("users_private").select("email").eq("user_id", opts.userId).maybeSingle(),
    ]);
    const locale = profile?.preferred_language ?? "en";
    const title = notificationTitle(opts.kind, locale);
    const ref = opts.payload?.ref ? String(opts.payload.ref) : undefined;

    await sendPushToUser(opts.userId, {
      title,
      body: ref,
      href: opts.href ?? "/notifications",
    });

    if (priv?.email && !NO_EMAIL_KINDS.has(opts.kind)) {
      await sendEmail({
        to: priv.email,
        subject: `MatchHub: ${title}`,
        heading: title,
        body: ref ? `Reference: ${ref}` : undefined,
        ctaUrl: opts.href ?? "/notifications",
        ctaLabel: "Open MatchHub",
      });
    }
  } catch (e) {
    console.error("[notify] delivery error:", e instanceof Error ? e.message : e);
  }
}

/** Notify every platform admin (new agents, new requirements, reports). */
export async function notifyAdmins(opts: {
  kind: string;
  payload?: Record<string, string | number>;
  href?: string;
}): Promise<void> {
  const service = createServiceClient();
  const { data: admins } = await service
    .from("user_roles")
    .select("user_id, roles!inner(key)")
    .in("roles.key", ["super_admin", "admin"]);
  const ids = [...new Set((admins ?? []).map((a) => a.user_id))];
  for (const userId of ids) {
    await notify({ userId, kind: opts.kind, payload: opts.payload, href: opts.href });
  }
}

/** Both parties of a submission; used to notify "the other side". */
export async function getSubmissionParties(
  submissionId: string,
): Promise<{ supplyAgentId: string; requestingAgentId: string; requestId: string } | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("property_submissions")
    .select("supply_agent_id, request_id, property_requests(requesting_agent_id)")
    .eq("id", submissionId)
    .maybeSingle();
  if (!data) return null;
  const req = Array.isArray(data.property_requests)
    ? data.property_requests[0]
    : data.property_requests;
  if (!req) return null;
  return {
    supplyAgentId: data.supply_agent_id,
    requestingAgentId: req.requesting_agent_id,
    requestId: data.request_id,
  };
}
