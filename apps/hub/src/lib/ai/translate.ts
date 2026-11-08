import "server-only";
import { z } from "zod";
import { runAi, type DeniedReason } from "./engine";

/**
 * The Translation Assistant. There is no deterministic floor for translation,
 * so when the engine says no the caller gets the reason and the original text
 * stays untouched — never a half-translated field.
 */
export type Target = "en" | "id" | "ms";
const LANG: Record<Target, string> = { en: "English", id: "Bahasa Indonesia", ms: "Bahasa Malaysia" };

export type TranslationResult =
  | { source: "ai"; fields: Record<string, string>; notes: string[]; model: string }
  | { source: "rules"; reason: DeniedReason | "failed" };

export async function translateFields(
  fields: Record<string, string>, target: Target, sourceLang: string | null,
  ctx: { userId: string; locale: string; refType?: string; refId?: string },
): Promise<TranslationResult> {
  const keys = Object.keys(fields).filter((k) => fields[k]?.trim());
  if (!keys.length) return { source: "rules", reason: "failed" };
  const schema = z.object({
    fields: z.object(Object.fromEntries(keys.map((k) => [k, z.string().min(1).max(6000)]))),
    notes: z.array(z.string().max(160)).max(2).default([]),
  });
  const res = await runAi(
    "translate",
    { target_language: LANG[target], source_language: sourceLang ? LANG[sourceLang as Target] ?? sourceLang : "auto-detect", fields: Object.fromEntries(keys.map((k) => [k, fields[k]])) },
    schema,
    { userId: ctx.userId, locale: target, refType: ctx.refType ?? "translate", refId: ctx.refId },
  );
  if (!res.ok) return { source: "rules", reason: res.kind === "denied" ? res.reason : "failed" };
  return { source: "ai", fields: res.output.fields as Record<string, string>, notes: res.output.notes, model: `${res.provider}/${res.model}` };
}
