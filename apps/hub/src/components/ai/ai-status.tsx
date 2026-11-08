/**
 * The one-line provenance every AI surface shows: "✦ AI · model" when the
 * model answered, or the reason the deterministic path answered instead.
 * Pure, so it renders in server and client components alike.
 */
export type AiStatusLabels = { sourceAi: string; sourceRules: string; reasons: Record<string, string> };

export function AiStatus({ source, reason, model, labels, className = "" }: {
  source: "ai" | "rules" | undefined;
  reason?: string;
  model?: string | null;
  labels: AiStatusLabels;
  className?: string;
}) {
  if (!source) return null;
  const text = source === "ai"
    ? labels.sourceAi.replace("[model]", model ?? "AI")
    : (reason && labels.reasons[reason]) || labels.sourceRules;
  return (
    <p className={`text-[11px] text-muted ${className}`}>
      <span className={`mr-2 rounded-full px-2 py-0.5 font-semibold ${source === "ai" ? "bg-indigo-soft text-indigo" : "bg-card text-muted"}`}>
        {source === "ai" ? "✦ AI" : "✍︎"}
      </span>
      {text}
    </p>
  );
}

export const AI_REASON_KEYS = ["quota", "daily_cap", "platform_cap", "circuit_open", "disabled", "feature_off", "unverified", "no_provider", "failed"] as const;
