import { SparkIcon } from "./icons";

/**
 * The disclosure that travels with every assistant surface: this is a
 * rule-based helper, not a model. Written once so the wording cannot drift
 * between the homepage teaser, the assistant page and the compare table.
 */
export function RuleBasedNotice({
  title,
  body,
  tone = "light",
}: {
  title: string;
  body: string;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <div
      role="note"
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
        dark ? "glass text-white/85" : "border-gold-light/50 bg-gold-soft text-foreground"
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
          dark ? "bg-white/15 text-command-gold" : "bg-gold-light/40 text-gold-ink"
        }`}
      >
        <SparkIcon className="h-3.5 w-3.5" />
      </span>
      <p className="leading-relaxed">
        <span className={`font-semibold ${dark ? "text-command-gold" : "text-gold-ink"}`}>{title}</span>{" "}
        <span className={dark ? "text-white/80" : "text-muted-strong"}>{body}</span>
      </p>
    </div>
  );
}
