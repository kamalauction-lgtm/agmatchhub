import Link from "next/link";
import { Sparkline } from "./charts";

/**
 * The two shells every admin screen is built from.
 *
 * They exist so the design system lives in one place rather than as a copied
 * class string. Before this, "a card" was `rounded-xl border border-line p-5`
 * written out on each page, and the third time somebody wrote `p-4` instead
 * the console stopped looking like one product.
 */

/* -------------------------------------------------------------------------
 * Panel — a titled surface.
 * ---------------------------------------------------------------------- */

export function Panel({
  title,
  hint,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  hint?: string;
  /** Top-right slot: a "see all" link, a filter, a range switch. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-card shadow-card ${className}`}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={`px-5 py-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------
 * Stat card.
 * ---------------------------------------------------------------------- */

/** The tinted icon tiles from the design sheet. */
const TONES = {
  indigo: "bg-indigo-soft text-indigo",
  green: "bg-success-soft text-success",
  orange: "bg-warning-soft text-warning",
  blue: "bg-blue-soft text-blue",
  red: "bg-crimson-soft text-crimson",
} as const;

export type Tone = keyof typeof TONES;

/**
 * One headline number, with what it did and where it came from.
 *
 * A bare count is not a report. Every card carries three things a bare count
 * lacks: the change against the previous period of the same length, the shape
 * of the run-up, and — where one exists — a link to the screen where the
 * number can be acted on.
 *
 * The delta is deliberately absolute ("+12"), never a percentage. Growing from
 * 0 to 3 has no meaningful percentage, and a dashboard that computes one shows
 * an infinity symbol in its first week.
 */
export function StatCard({
  value,
  label,
  icon,
  tone = "blue",
  hint,
  caption,
  delta,
  series,
  href,
  /** Some metrics are bad when they rise. Queues, for one. */
  invert = false,
}: {
  value: string | number;
  label: string;
  icon: string;
  tone?: Tone;
  hint?: string;
  /** The small grey line under the delta, e.g. "vs previous 30 days". */
  caption?: string;
  delta?: number | null;
  series?: number[];
  href?: string;
  invert?: boolean;
}) {
  const good = delta == null || delta === 0 ? null : invert ? delta < 0 : delta > 0;

  /* The sparkline sits on its own row under the number rather than beside the
     label. Inline, it stole about 100px from a ~270px card and truncated every
     label to "Activate…" — which is the one part of a stat card that must be
     readable. */
  const body = (
    <>
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg ${TONES[tone]}`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-muted">{label}</p>
          <p className="mt-1 text-3xl font-bold leading-none tabular-nums">{value}</p>
        </div>
      </div>

      {(delta != null || caption || hint) && (
        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {delta != null && delta !== 0 && (
            <span
              className={`text-sm font-semibold tabular-nums ${good ? "text-success" : "text-danger"}`}
            >
              {good ? "▲" : "▼"} {delta > 0 ? "+" : ""}
              {delta}
            </span>
          )}
          {(caption ?? hint) && (
            <span className="text-xs leading-snug text-muted">{caption ?? hint}</span>
          )}
        </div>
      )}

      {series && series.length > 1 && (
        <div className="mt-3 -mb-1 opacity-70">
          <Sparkline values={series} colour={good === false ? "var(--danger)" : "var(--blue)"} />
        </div>
      )}
    </>
  );

  const shell = "rounded-xl border border-line bg-card p-4 shadow-card transition-colors duration-150";

  return href ? (
    <Link
      href={href}
      className={`${shell} block hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue`}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
