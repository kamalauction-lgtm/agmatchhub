import { Badge } from "@/components/ui/badge";

/**
 * Environment label (MatchHub 2.0). Renders only when the build carries
 * `NEXT_PUBLIC_ENVIRONMENT=staging`, which is set in `.env.staging.production`
 * and nowhere else. It reads configuration, never data, so it cannot mislabel
 * a genuine offer, and it cannot appear on production because that build has
 * no such value. The text comes from messages/*, passed in by the caller.
 */
export function EnvironmentBadge({ label }: { label: string }) {
  if (process.env.NEXT_PUBLIC_ENVIRONMENT !== "staging") return null;
  return <Badge tone="accent" className="uppercase tracking-wide">◆ {label}</Badge>;
}
