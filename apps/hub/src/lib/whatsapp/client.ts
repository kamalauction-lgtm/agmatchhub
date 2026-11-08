import "server-only";
import { templateComponents } from "./webhook";

/**
 * Meta WhatsApp Cloud API — the two calls the platform makes.
 *
 *   POST https://graph.facebook.com/{v}/{PHONE_NUMBER_ID}/messages   Bearer WHATSAPP_ACCESS_TOKEN
 *     { messaging_product: "whatsapp", to, type: "text",     text: { body, preview_url } }
 *     { messaging_product: "whatsapp", to, type: "template", template: { name, language: { code }, components } }
 *   → { messages: [{ id: "wamid.…" }] }
 *
 * One system-user token serves every number in the WhatsApp Business Account,
 * which is why the token is an env and the phone_number_id is a row. No bulk
 * endpoint exists here on purpose (Decision 8: no mass campaigns).
 */

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0"}`;

export function whatsappConfigured(): { token: boolean; appSecret: boolean; verifyToken: boolean } {
  return {
    token: !!process.env.WHATSAPP_ACCESS_TOKEN,
    appSecret: !!process.env.WHATSAPP_APP_SECRET,
    verifyToken: !!process.env.WHATSAPP_VERIFY_TOKEN,
  };
}

export type SendResult =
  | { ok: true; waMessageId: string }
  | { ok: false; kind: "not_configured" | "auth" | "rate_limit" | "rejected" | "network"; detail?: string; code?: number };

async function post(phoneNumberId: string, payload: Record<string, unknown>): Promise<SendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return { ok: false, kind: "not_configured" };
  try {
    const res = await fetch(`${GRAPH()}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string; code?: number; error_subcode?: number } } | null;
    if (res.status === 401 || res.status === 403 || json?.error?.code === 190) return { ok: false, kind: "auth", code: json?.error?.code, detail: json?.error?.message };
    if (res.status === 429 || json?.error?.code === 80007 || json?.error?.code === 130429) return { ok: false, kind: "rate_limit", code: json?.error?.code, detail: json?.error?.message };
    if (!res.ok || !json?.messages?.[0]?.id) return { ok: false, kind: "rejected", code: json?.error?.code, detail: `${res.status} ${json?.error?.message ?? ""}`.trim().slice(0, 200) };
    return { ok: true, waMessageId: json.messages[0].id };
  } catch (e) {
    return { ok: false, kind: "network", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Free-form text — lawful only inside the 24-hour window (the database decided that already). */
export function sendSessionText(phoneNumberId: string, to: string, body: string): Promise<SendResult> {
  return post(phoneNumberId, { to: to.replace(/^\+/, ""), type: "text", text: { body: body.slice(0, 4096), preview_url: false } });
}

/** An approved template, by Meta name + language, with its body variables in order. */
export function sendTemplate(phoneNumberId: string, to: string, name: string, language: string, values: string[]): Promise<SendResult> {
  return post(phoneNumberId, {
    to: to.replace(/^\+/, ""), type: "template",
    template: { name, language: { code: language }, components: templateComponents(values) },
  });
}
