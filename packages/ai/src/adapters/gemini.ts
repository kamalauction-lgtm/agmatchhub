import type { EmbedRequest, EmbedResult, GenerateRequest, GenerateResult } from "../types";
import { ProviderError } from "../types";
import { costMicros } from "../cost";
import { classify, fetchWithTimeout, parseJsonOutput } from "../json";

/**
 * Google Gemini over REST (generativelanguage.googleapis.com).
 *
 * No SDK: the SDK pulls Node-only modules the Workers runtime does not have,
 * and the REST surface we need is three fields wide. The key travels in a
 * header, not the query string, so it never lands in a log line.
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function geminiGenerate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
  const started = Date.now();
  const res = await fetchWithTimeout(
    `${BASE}/models/${encodeURIComponent(req.route.model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": req.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{
          role: "user",
          parts: [
            ...(req.attachments ?? []).map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.dataBase64 } })),
            { text: req.user },
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: req.route.maxOutputTokens,
          temperature: req.temperature ?? 0.4,
          // Hero's lesson (Sales Lab, Sep 2026): a non-zero thinking budget on
          // flash models eats the output budget and returns truncated JSON.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
    req.timeoutMs ?? 25_000,
  );

  if (!res.ok) throw new ProviderError(classify(res.status), `gemini ${res.status}`, res.status);
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  };
  if (body.promptFeedback?.blockReason) throw new ProviderError("bad_output", `gemini blocked: ${body.promptFeedback.blockReason}`);
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new ProviderError("bad_output", "gemini returned no text");

  const usage = {
    tokensIn: body.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: body.usageMetadata?.candidatesTokenCount ?? 0,
  };
  return {
    output: parseJsonOutput(text, req.schema),
    usage,
    costMicros: costMicros(req.route, usage),
    provider: "gemini",
    model: req.route.model,
    latencyMs: Date.now() - started,
  };
}

export async function geminiEmbed(req: EmbedRequest): Promise<EmbedResult> {
  const started = Date.now();
  const res = await fetchWithTimeout(
    `${BASE}/models/${encodeURIComponent(req.route.model)}:embedContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": req.apiKey },
      body: JSON.stringify({
        content: { parts: [{ text: req.text }] },
        taskType: "RETRIEVAL_DOCUMENT",
        ...(req.dimensions ? { outputDimensionality: req.dimensions } : {}),
      }),
    },
    req.timeoutMs ?? 15_000,
  );
  if (!res.ok) throw new ProviderError(classify(res.status), `gemini embed ${res.status}`, res.status);
  const body = (await res.json()) as { embedding?: { values?: number[] } };
  const vector = body.embedding?.values;
  if (!vector?.length) throw new ProviderError("bad_output", "gemini returned no embedding");
  // Embedding calls do not report usage; approximate by characters / 4.
  const usage = { tokensIn: Math.ceil(req.text.length / 4), tokensOut: 0 };
  return { vector, usage, costMicros: costMicros(req.route, usage), latencyMs: Date.now() - started };
}
