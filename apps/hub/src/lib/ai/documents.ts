import "server-only";
import { z } from "zod";
import type { Attachment } from "@pg/ai";
import { runAi, type DeniedReason } from "./engine";

/**
 * The Document Summariser: a PDF or image the agent uploads, or text they
 * paste, summarised for a property agent. Transient by design — the file is
 * read, sent to the model, and dropped; only the ledger row remains (feature,
 * tokens, hash of the size). The agent verifies anything legal or financial.
 */
export type DocumentSummary = {
  kind: string; summary: string; parties: string[]; keyDates: { label: string; date: string }[]; amounts: { label: string; amount: string }[];
  obligations: string[]; verify: string[]; readable: boolean;
  source: "ai"; model: string;
} | { source: "rules"; reason: DeniedReason | "failed" | "unsupported" | "too_large" | "empty" };

const schema = z.object({
  kind: z.string().max(80),
  summary: z.string().min(40).max(2000),
  parties: z.array(z.string().max(120)).max(6).default([]),
  key_dates: z.array(z.object({ label: z.string().max(80), date: z.string().max(40) })).max(10).default([]),
  amounts: z.array(z.object({ label: z.string().max(80), amount: z.string().max(60) })).max(10).default([]),
  obligations: z.array(z.string().max(200)).max(8).default([]),
  verify: z.array(z.string().max(200)).max(5).default([]),
  readable: z.boolean().default(true),
});

export const DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;
export const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"];

export async function summariseDocument(
  input: { name: string; file?: { mimeType: string; bytes: ArrayBuffer } | null; text?: string | null },
  ctx: { userId: string; locale: string },
): Promise<DocumentSummary> {
  let attachments: Attachment[] | undefined;
  let pasted = "";
  if (input.file) {
    if (!DOCUMENT_TYPES.includes(input.file.mimeType)) return { source: "rules", reason: "unsupported" };
    if (input.file.bytes.byteLength > DOCUMENT_MAX_BYTES) return { source: "rules", reason: "too_large" };
    if (input.file.mimeType === "text/plain") pasted = new TextDecoder().decode(input.file.bytes).slice(0, 60_000);
    else attachments = [{ mimeType: input.file.mimeType, dataBase64: Buffer.from(input.file.bytes).toString("base64") }];
  } else if (input.text?.trim()) {
    pasted = input.text.trim().slice(0, 60_000);
  }
  if (!attachments && !pasted) return { source: "rules", reason: "empty" };

  const res = await runAi(
    "document_summary",
    { name: input.name, pasted: pasted ? `Pasted text follows:\n${pasted}` : "The document is attached." },
    schema,
    { userId: ctx.userId, locale: ctx.locale, refType: "document", attachments, timeoutMs: 60_000 },
  );
  if (!res.ok) return { source: "rules", reason: res.kind === "denied" ? res.reason : "failed" };
  const o = res.output;
  return { kind: o.kind, summary: o.summary, parties: o.parties, keyDates: o.key_dates, amounts: o.amounts, obligations: o.obligations, verify: o.verify, readable: o.readable, source: "ai", model: `${res.provider}/${res.model}` };
}
