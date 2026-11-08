import type { GenerateRequest, GenerateResult } from "../types";
import { ProviderError } from "../types";
import { costMicros } from "../cost";
import { classify, fetchWithTimeout, parseJsonOutput } from "../json";

/**
 * Anthropic Messages API over REST. Same shape as the Gemini adapter so the
 * engine does not care which one a feature's row names.
 */
const URL = "https://api.anthropic.com/v1/messages";

export async function anthropicGenerate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
  const started = Date.now();
  const res = await fetchWithTimeout(
    URL,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": req.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: req.route.model,
        max_tokens: req.route.maxOutputTokens,
        temperature: req.temperature ?? 0.4,
        system: `${req.system}\n\nRespond with a single JSON object and nothing else.`,
        messages: [{
          role: "user",
          content: [
            ...(req.attachments ?? []).map((a) =>
              a.mimeType === "application/pdf"
                ? { type: "document", source: { type: "base64", media_type: a.mimeType, data: a.dataBase64 } }
                : { type: "image", source: { type: "base64", media_type: a.mimeType, data: a.dataBase64 } }),
            { type: "text", text: req.user },
          ],
        }],
      }),
    },
    req.timeoutMs ?? 25_000,
  );

  if (!res.ok) throw new ProviderError(classify(res.status), `anthropic ${res.status}`, res.status);
  const body = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    stop_reason?: string;
  };
  const text = body.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
  if (!text) throw new ProviderError("bad_output", "anthropic returned no text");

  const usage = { tokensIn: body.usage?.input_tokens ?? 0, tokensOut: body.usage?.output_tokens ?? 0 };
  return {
    output: parseJsonOutput(text, req.schema),
    usage,
    costMicros: costMicros(req.route, usage),
    provider: "anthropic",
    model: req.route.model,
    latencyMs: Date.now() - started,
  };
}
