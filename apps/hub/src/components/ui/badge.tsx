import type { HTMLAttributes } from "react";

/**
 * Status badge (Phase 1 foundation). Every tone pairs a fill with its own
 * text colour, so meaning is carried by words, not colour alone. Text colours
 * are the *-ink tokens, which pass 4.5:1 on their tinted fills.
 */
const TONES = {
  neutral: "bg-surface text-muted-strong border-line-strong",
  success: "bg-success-soft text-success-ink border-transparent",
  warning: "bg-warning-soft text-warning-ink border-transparent",
  accent: "bg-accent-soft text-accent border-transparent",
  info: "bg-blue-soft text-blue border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]} ${className}`}
      {...props}
    />
  );
}
