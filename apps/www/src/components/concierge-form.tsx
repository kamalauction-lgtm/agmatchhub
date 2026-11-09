import Link from "next/link";
import { SparkIcon } from "./icons";

/**
 * The concierge prompt. A plain GET form: the request lands in the URL, so a
 * result is shareable and works without JavaScript — the same contract the
 * search bar keeps. Example chips are real links to real queries.
 */
export function ConciergeForm({
  action,
  defaultValue = "",
  placeholder,
  submitLabel,
  examples,
  examplesLabel,
  onDark = false,
  autoFocus = false,
}: {
  action: string;
  defaultValue?: string;
  placeholder: string;
  submitLabel: string;
  examples: string[];
  examplesLabel: string;
  onDark?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <form action={action} method="get" className="w-full">
        <div
          className={`flex flex-col gap-2 rounded-2xl p-2 sm:flex-row sm:items-center ${
            onDark ? "glass glow-electric" : "border border-line bg-surface-raised shadow-card"
          }`}
        >
          <span
            aria-hidden
            className={`hidden h-10 w-10 shrink-0 place-items-center rounded-xl sm:grid ${
              onDark ? "bg-electric text-white pulse-ring" : "bg-electric-soft text-electric"
            }`}
          >
            <SparkIcon className="h-5 w-5" />
          </span>
          <input
            type="search"
            name="q"
            defaultValue={defaultValue}
            placeholder={placeholder}
            aria-label={placeholder}
            autoFocus={autoFocus}
            maxLength={300}
            className={`min-h-11 flex-1 rounded-xl bg-transparent px-3 text-base outline-none ${
              onDark ? "text-white placeholder:text-white/55" : "text-foreground placeholder:text-muted"
            }`}
          />
          <button
            type="submit"
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-electric px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-electric-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <SparkIcon className="h-4 w-4 sm:hidden" />
            {submitLabel}
          </button>
        </div>
      </form>

      {examples.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`text-xs ${onDark ? "text-white/60" : "text-muted"}`}>{examplesLabel}</span>
          {examples.map((ex) => (
            <Link
              key={ex}
              href={`${action}?q=${encodeURIComponent(ex)}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
                onDark
                  ? "bg-white/10 text-white hover:bg-white/20"
                  : "border border-line bg-surface-raised text-foreground hover:border-electric hover:text-electric"
              }`}
            >
              {ex}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
