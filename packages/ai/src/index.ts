import { anthropicGenerate } from "./adapters/anthropic";
import { geminiEmbed, geminiGenerate } from "./adapters/gemini";
import type { EmbedRequest, EmbedResult, GenerateRequest, GenerateResult, Provider } from "./types";
import { ProviderError } from "./types";

export * from "./types";
export { redact } from "./redact";
export type { Redaction } from "./redact";
export { sha256Hex, canonical } from "./hash";
export { costMicros } from "./cost";
export { parseJsonOutput } from "./json";

/**
 * One call, any provider. The engine in `apps/hub` decides WHETHER to call
 * (quota, caps, flags, verification) and records the result; this package
 * decides only HOW, per the route it is handed. Business logic never imports
 * an adapter directly.
 */
export async function generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
  switch (req.route.provider) {
    case "gemini":
      return geminiGenerate(req);
    case "anthropic":
      return anthropicGenerate(req);
    default:
      throw new ProviderError("upstream", `no adapter for provider ${String((req.route as { provider: Provider }).provider)}`);
  }
}

export async function embed(req: EmbedRequest): Promise<EmbedResult> {
  if (req.route.provider === "gemini") return geminiEmbed(req);
  throw new ProviderError("upstream", `embeddings not supported on ${req.route.provider}`);
}

/** Which environment variable holds a provider's key — the only place that mapping lives. */
export function apiKeyEnvName(provider: Provider): string {
  return provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
}
