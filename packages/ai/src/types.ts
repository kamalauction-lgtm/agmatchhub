import type { ZodType } from "zod";

/** A provider the platform can route a feature to. Rows in `ai_models` name one. */
export type Provider = "gemini" | "anthropic";

/** What the database row for a feature resolves to at call time. */
export type ModelRoute = {
  feature: string;
  provider: Provider;
  model: string;
  maxOutputTokens: number;
  /** micro-USD per 1,000 tokens, from `ai_models` */
  inputCostMicrosPer1k: number;
  outputCostMicrosPer1k: number;
};

export type Usage = { tokensIn: number; tokensOut: number };

export type GenerateRequest<T> = {
  route: ModelRoute;
  apiKey: string;
  system: string;
  /** The user turn. Already redacted by the caller where the feature allows. */
  user: string;
  /** Output contract. The adapter asks for JSON and the result is parsed with it. */
  schema: ZodType<T>;
  temperature?: number;
  /** Abort after this many ms (Workers give a request ~30 s of wall time). */
  timeoutMs?: number;
};

export type GenerateResult<T> = {
  output: T;
  usage: Usage;
  costMicros: number;
  provider: Provider;
  model: string;
  latencyMs: number;
};

export type EmbedRequest = {
  route: ModelRoute;
  apiKey: string;
  text: string;
  /** Output size; must match the vector column (listing_embeddings is 1536). */
  dimensions?: number;
  timeoutMs?: number;
};
export type EmbedResult = { vector: number[]; usage: Usage; costMicros: number; latencyMs: number };

/**
 * A provider failure the engine can reason about. `kind` is what gets written
 * to the ledger — never the response body, which may echo the prompt.
 */
export class ProviderError extends Error {
  constructor(
    public readonly kind: "auth" | "rate_limit" | "timeout" | "bad_output" | "upstream" | "network",
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
