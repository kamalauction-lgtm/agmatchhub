import type { ZodType } from "zod";
import { ProviderError } from "./types";

/**
 * Turn a model's text into the typed object a feature promised.
 *
 * Models are asked for JSON and mostly comply; the two ways they do not —
 * wrapping it in a ```json fence, or adding a sentence before it — are
 * handled here rather than by re-prompting, which would double the cost of
 * the commonest failure. Anything that still does not parse, or parses but
 * does not satisfy the schema, is a `bad_output` error: the engine falls back
 * to the deterministic path and the ledger records why.
 */
export function parseJsonOutput<T>(raw: string, schema: ZodType<T>): T {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{") && !text.startsWith("[")) {
    const start = text.search(/[{[]/);
    if (start >= 0) text = text.slice(start);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProviderError("bad_output", "model output was not JSON");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ProviderError("bad_output", `model output failed schema: ${parsed.error.issues[0]?.path.join(".") ?? "?"}`);
  }
  return parsed.data;
}

/** A fetch with a hard deadline; Workers abort a request at ~30 s anyway. */
export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new ProviderError("timeout", `provider did not answer within ${timeoutMs} ms`);
    throw new ProviderError("network", (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

/** Map an HTTP status to the error class the ledger records. */
export function classify(status: number): ProviderError["kind"] {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  return "upstream";
}
