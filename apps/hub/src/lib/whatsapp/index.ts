import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { sha256Hex } from "@pg/ai";
import { sendSessionText, sendTemplate } from "./client";
import { verifyMetaSignature, parseWebhook, e164 } from "./webhook";

export { whatsappConfigured } from "./client";

/**
 * WhatsApp Cloud API — the two orchestrations (E12, Decision 8).
 *
 *   sendOnLead()     the agent's one message on one lead: the DATABASE says
 *                    whether it may go (wa_send_check), the adapter sends it,
 *                    the service records it and stamps the first response.
 *   handleWebhook()  verify → dedupe → record inbound / statuses.
 *
 * No bulk path, no scheduler, no auto-reply. Nothing here reads the token
 * anywhere but client.ts, and nothing returns it.
 */

export type SendOutcome =
  | { ok: true; messageId: string }
  | { ok: false; reason: string };

/**
 * `userDb` is the agent's own client (RLS + auth.uid() apply to the check);
 * the record step runs with the service client because the rows are not
 * agent-writable.
 */
export async function sendOnLead(
  userDb: SupabaseClient,
  leadId: string,
  msg: { kind: "session"; body: string } | { kind: "template"; templateId: string; values: string[] },
): Promise<SendOutcome> {
  const { data: verdict, error } = await userDb.rpc("wa_send_check", {
    p_lead: leadId, p_kind: msg.kind, p_template: msg.kind === "template" ? msg.templateId : null,
  });
  if (error) return { ok: false, reason: "check_failed" };
  if (verdict !== "ok") return { ok: false, reason: String(verdict) };

  const service = createServiceClient();
  const { data: lead } = await service
    .from("leads").select("id, agent_id, contacts(phone), profiles:agent_id(country_code)").eq("id", leadId).maybeSingle();
  const phone = (one(lead?.contacts) as { phone: string } | null)?.phone;
  const country = (one(lead?.profiles) as { country_code: string | null } | null)?.country_code;
  if (!phone || !country) return { ok: false, reason: "no_phone" };
  const { data: acct } = await service.from("wa_accounts").select("id, phone_number_id, mode").eq("country_code", country).neq("mode", "off").maybeSingle();
  if (!acct?.phone_number_id) return { ok: false, reason: "no_account" };

  let body: string;
  let templateId: string | null = null;
  let sent;
  if (msg.kind === "session") {
    body = msg.body;
    sent = await sendSessionText(acct.phone_number_id, phone, body);
  } else {
    const { data: tpl } = await service.from("wa_templates").select("id, name, language, body").eq("id", msg.templateId).maybeSingle();
    if (!tpl) return { ok: false, reason: "template_unknown" };
    templateId = tpl.id;
    body = tpl.body.replace(/\{\{(\d+)\}\}/g, (_: string, i: string) => msg.values[Number(i) - 1] ?? "");
    sent = await sendTemplate(acct.phone_number_id, phone, tpl.name, tpl.language, msg.values);
  }

  const { data: id, error: recErr } = await service.rpc("wa_record_outbound", {
    p_lead: leadId, p_kind: msg.kind, p_template: templateId, p_body: body,
    p_wa_message_id: sent.ok ? sent.waMessageId : null,
    p_status: sent.ok ? "sent" : "failed",
    p_error: sent.ok ? null : `${sent.kind}${sent.detail ? `: ${sent.detail}` : ""}`,
  });
  if (recErr) console.error("[whatsapp] record failed", recErr.message);
  if (!sent.ok) return { ok: false, reason: sent.kind };
  return { ok: true, messageId: String(id) };
}

export type WebhookOutcome = { http: number; outcomes: string[] };

export async function handleWebhook(rawBody: string, headers: Headers, db?: SupabaseClient): Promise<WebhookOutcome> {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return { http: 503, outcomes: ["not_configured"] };
  const service = db ?? createServiceClient();
  const valid = await verifyMetaSignature(rawBody, headers.get("x-hub-signature-256"), secret);
  const bodyHash = await sha256Hex(rawBody);

  let parsed: ReturnType<typeof parseWebhook> = null;
  let json: unknown = null;
  try { json = JSON.parse(rawBody); parsed = parseWebhook(json); } catch { /* recorded below */ }
  const phoneNumberId = parsed?.messages[0]?.phoneNumberId ?? parsed?.statuses[0]?.phoneNumberId ?? null;

  const { data: ev, error } = await service
    .from("wa_webhook_events")
    .insert({
      body_hash: bodyHash, phone_number_id: phoneNumberId, signature_valid: valid,
      messages: parsed?.messages.length ?? 0, statuses: parsed?.statuses.length ?? 0,
      payload: valid ? json : null, outcome: valid ? (parsed ? "received" : "bad_payload") : "bad_signature",
    })
    .select("id").maybeSingle();
  // Meta retried the same body. Only VERIFIED deliveries are deduplicated (partial
  // unique index, 00096), so an unsigned copy can never suppress the real one.
  if (error?.code === "23505") return { http: 200, outcomes: ["duplicate"] };
  if (!valid) return { http: 401, outcomes: ["bad_signature"] };
  if (!parsed) return { http: 400, outcomes: ["bad_payload"] };

  const outcomes: string[] = [];
  for (const m of parsed.messages) {
    const { data, error: e } = await service.rpc("wa_record_inbound", {
      p_phone_number_id: m.phoneNumberId, p_from: e164(m.from), p_wa_message_id: m.waMessageId,
      p_kind: m.kind, p_body: m.body, p_media_type: m.mediaType, p_ts: m.timestamp,
    });
    outcomes.push(e ? `inbound_error: ${e.message.slice(0, 80)}` : `in:${data}`);
  }
  for (const s of parsed.statuses) {
    const { data, error: e } = await service.rpc("wa_record_status", {
      p_wa_message_id: s.waMessageId, p_status: s.status, p_error: s.error, p_pricing: s.pricingCategory, p_conversation: s.conversationId, p_ts: s.timestamp,
    });
    outcomes.push(e ? `status_error: ${e.message.slice(0, 80)}` : `status:${data}`);
  }
  if (parsed.other) outcomes.push(`other:${parsed.other}`);
  if (ev) await service.from("wa_webhook_events").update({ outcome: outcomes.join(",").slice(0, 300) || "empty" }).eq("id", ev.id);
  return { http: 200, outcomes };
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}
