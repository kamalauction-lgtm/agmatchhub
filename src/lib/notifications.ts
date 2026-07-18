import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * In-app notification (§40). Inserted with the service client so users cannot
 * spam each other directly. `payload` must never contain confidential values
 * (no prices, no commission, no client identity) — titles are built from
 * i18n keys + safe references at render time.
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
