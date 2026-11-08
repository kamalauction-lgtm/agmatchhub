// Relative on purpose: the db package's vitest resolves `@/` to the marketplace app.
import { hmacHex, timingSafeEqual } from "../payments/crypto";

/**
 * Meta WhatsApp Cloud API webhook — the pure half (unit-tested, no I/O).
 *
 *   verification  GET  ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
 *                 → echo hub.challenge when the token matches
 *   delivery      POST JSON, header X-Hub-Signature-256: sha256=<hmac hex>
 *                 HMAC-SHA256 of the RAW body with the app secret
 *   shape         { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages",
 *                   value: { metadata: { phone_number_id }, messages: [...], statuses: [...] } }] }] }
 *
 * Only `messages` and `statuses` are read. Anything else is counted and ignored.
 */

export async function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = await hmacHex("SHA-256", appSecret, rawBody);
  return timingSafeEqual(expected, header.slice(7).toLowerCase());
}

/** The GET handshake: the challenge to echo, or null to refuse. */
export function verificationChallenge(params: URLSearchParams, verifyToken: string | undefined): string | null {
  if (!verifyToken) return null;
  if (params.get("hub.mode") !== "subscribe") return null;
  if (!timingSafeEqual(params.get("hub.verify_token") ?? "", verifyToken)) return null;
  return params.get("hub.challenge");
}

export type InboundMessage = {
  phoneNumberId: string;
  from: string;              // E.164 without '+', as Meta sends it
  waMessageId: string;
  timestamp: string;         // ISO
  kind: "text" | "media" | "reaction" | "other";
  body: string | null;
  mediaType: string | null;
  profileName: string | null;
};

export type StatusUpdate = {
  phoneNumberId: string;
  waMessageId: string;
  status: string;            // sent · delivered · read · failed
  timestamp: string;
  recipient: string;
  error: string | null;
  pricingCategory: string | null;
  conversationId: string | null;
};

export type ParsedWebhook = { messages: InboundMessage[]; statuses: StatusUpdate[]; other: number };

type MetaMessage = {
  from?: string; id?: string; timestamp?: string; type?: string;
  text?: { body?: string }; image?: { caption?: string }; video?: { caption?: string }; document?: { caption?: string; filename?: string };
  reaction?: { emoji?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};
type MetaStatus = {
  id?: string; status?: string; timestamp?: string; recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string }[];
  pricing?: { category?: string }; conversation?: { id?: string };
};

const MEDIA = new Set(["image", "video", "document", "audio", "sticker", "location", "contacts"]);

export function parseWebhook(body: unknown): ParsedWebhook | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { object?: string; entry?: { changes?: { field?: string; value?: Record<string, unknown> }[] }[] };
  if (b.object !== "whatsapp_business_account" || !Array.isArray(b.entry)) return null;
  const out: ParsedWebhook = { messages: [], statuses: [], other: 0 };
  for (const entry of b.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || !change.value) { out.other++; continue; }
      const v = change.value;
      const phoneNumberId = String((v.metadata as { phone_number_id?: string } | undefined)?.phone_number_id ?? "");
      const names = new Map(((v.contacts as { wa_id?: string; profile?: { name?: string } }[] | undefined) ?? []).map((c) => [c.wa_id ?? "", c.profile?.name ?? null]));
      for (const m of (v.messages as MetaMessage[] | undefined) ?? []) {
        if (!m.id || !m.from) continue;
        const type = m.type ?? "unknown";
        const kind: InboundMessage["kind"] = type === "text" ? "text" : MEDIA.has(type) ? "media" : type === "reaction" ? "reaction" : "other";
        const body =
          m.text?.body ?? m.image?.caption ?? m.video?.caption ?? m.document?.caption ?? m.document?.filename
          ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? m.reaction?.emoji ?? null;
        out.messages.push({
          phoneNumberId, from: m.from, waMessageId: m.id, timestamp: toIso(m.timestamp), kind, body,
          mediaType: kind === "media" ? type : null, profileName: names.get(m.from) ?? null,
        });
      }
      for (const s of (v.statuses as MetaStatus[] | undefined) ?? []) {
        if (!s.id || !s.status) continue;
        const err = s.errors?.[0];
        out.statuses.push({
          phoneNumberId, waMessageId: s.id, status: s.status, timestamp: toIso(s.timestamp), recipient: s.recipient_id ?? "",
          error: err ? `${err.code ?? ""} ${err.title ?? err.message ?? ""}`.trim() || null : null,
          pricingCategory: s.pricing?.category ?? null, conversationId: s.conversation?.id ?? null,
        });
      }
    }
  }
  return out;
}

function toIso(ts: string | undefined): string {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

/** '6281…' as Meta sends it → '+6281…' as contacts.phone stores it. */
export function e164(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  return digits ? `+${digits}` : waId;
}

/** Template body `{{1}} … {{n}}` → Meta's components array for a send. */
export function templateComponents(values: string[]): { type: "body"; parameters: { type: "text"; text: string }[] }[] {
  if (!values.length) return [];
  return [{ type: "body", parameters: values.map((text) => ({ type: "text", text: text.slice(0, 1024) })) }];
}

/** Fill a registry body for the preview the agent sees before sending. */
export function renderTemplate(body: string, values: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, i) => values[Number(i) - 1] ?? `{{${i}}}`);
}
