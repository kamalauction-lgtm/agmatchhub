/**
 * Chart primitives for the admin reporting screens.
 *
 * Hand-drawn SVG rather than a charting library, for three reasons that all
 * apply here specifically:
 *
 *   · These are server components. A charting library would force the whole
 *     dashboard client-side to draw three small figures.
 *   · The bundle ships to Cloudflare Workers, where every kilobyte is startup
 *     time on a cold request.
 *   · The charts needed are a bar, a sparkline and a funnel. That is roughly a
 *     hundred lines of geometry; a dependency for it would be larger than the
 *     thing it replaced.
 *
 * Everything uses theme tokens, so light and dark work without a second
 * palette.
 */

export type Series = { key: string; label: string; colour: string; values: number[] };

/* -------------------------------------------------------------------------
 * Sparkline — the trend inside a stat card.
 * ---------------------------------------------------------------------- */

export function Sparkline({ values, colour = "var(--blue)" }: { values: number[]; colour?: string }) {
  if (values.length < 2) return null;
  /* All zeroes draws a solid rule along the bottom of the card, which reads as
     a divider or — worse, under a number — as a full progress bar. Nothing
     happened, so nothing is drawn. */
  if (values.every((v) => v === 0)) return null;
  const w = 96;
  const h = 22;
  const max = Math.max(...values, 1);
  // Baseline at the bottom rather than at min(): a flat series should read as
  // flat, not as a line through the middle of nowhere.
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  /* Stretches to the card's width. `preserveAspectRatio="none"` would normally
     smear the stroke along with the geometry — `vector-effect` keeps the line
     1.5px however far the box is stretched. */
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      className="h-5 w-full"
    >
      <polyline points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill={colour} fillOpacity={0.12} stroke="none" />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={colour}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------
 * Grouped bar chart — the dashboard's main figure.
 * ---------------------------------------------------------------------- */

/**
 * Daily counts, bucketed and drawn as grouped bars.
 *
 * WHY BUCKETS
 *   The range selector goes to 90 days. Ninety groups of three bars is 270
 *   bars in 700 pixels — under three pixels each, which is a texture rather
 *   than a chart. Days are summed into at most `MAX_BUCKETS` columns, and the
 *   bucket size is stated in the caption so nobody reads a 7-day column as a
 *   daily one.
 *
 * WHY BARS AND NOT A LINE
 *   These are counts of discrete events on a day — six signups, not a
 *   continuously varying quantity. A line implies interpolation between the
 *   points, which for "agents verified" is a claim about a Tuesday that
 *   nothing measured.
 */
const MAX_BUCKETS = 12;

export function BarChart({
  labels,
  series,
  height = 260,
  emptyLabel,
  bucketLabel,
}: {
  labels: string[];
  series: Series[];
  height?: number;
  emptyLabel: string;
  /** Rendered when days are grouped, e.g. "each column = 3 days". */
  bucketLabel?: (days: number) => string;
}) {
  const total = series.reduce((n, s) => n + s.values.reduce((a, b) => a + b, 0), 0);
  if (total === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted"
      >
        {emptyLabel}
      </div>
    );
  }

  const size = Math.ceil(labels.length / MAX_BUCKETS);
  const bucketed = bucket(labels, series, size);
  const cols = bucketed.labels.length;

  const w = 760;
  const padL = 38;
  const padR = 10;
  const padB = 26;
  const padT = 10;
  const innerW = w - padL - padR;
  const innerH = height - padB - padT;

  const max = Math.max(1, ...bucketed.series.flatMap((s) => s.values));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const bands = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  const colW = innerW / cols;
  const groupGap = Math.min(colW * 0.28, 14);
  const barW = Math.max(2, (colW - groupGap) / series.length);
  const y = (v: number) => padT + innerH - (v / top) * innerH;

  // At most eight date labels, whatever the range, or they collide.
  const everyNth = Math.max(1, Math.ceil(cols / 8));

  return (
    <figure className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full min-w-[560px]" role="img">
        {bands.map((v) => (
          <g key={v}>
            <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={padL - 8} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">
              {v}
            </text>
          </g>
        ))}

        {bucketed.labels.map((label, i) => {
          const groupX = padL + i * colW + groupGap / 2;
          return (
            <g key={label + i}>
              {bucketed.series.map((s, j) => {
                const v = s.values[i];
                const barH = Math.max(v > 0 ? 2 : 0, (v / top) * innerH);
                return (
                  <rect
                    key={s.key}
                    x={groupX + j * barW}
                    y={padT + innerH - barH}
                    width={Math.max(barW - 1.5, 1)}
                    height={barH}
                    rx={Math.min(3, barW / 2)}
                    fill={s.colour}
                  >
                    <title>{`${label} · ${s.label}: ${v}`}</title>
                  </rect>
                );
              })}
              {(i % everyNth === 0 || i === cols - 1) && (
                <text
                  x={groupX + (barW * series.length) / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--muted)"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.colour }} aria-hidden />
            {s.label}
          </span>
        ))}
        {size > 1 && bucketLabel && (
          <span className="text-xs text-muted">{bucketLabel(size)}</span>
        )}
      </figcaption>
    </figure>
  );
}

/** Sum consecutive days into columns, keeping the first day's label. */
function bucket(labels: string[], series: Series[], size: number) {
  if (size <= 1) return { labels, series };
  const out: string[] = [];
  for (let i = 0; i < labels.length; i += size) out.push(labels[i]);
  return {
    labels: out,
    series: series.map((s) => ({
      ...s,
      values: out.map((_, b) =>
        s.values.slice(b * size, b * size + size).reduce((a, v) => a + v, 0)
      ),
    })),
  };
}

/** 1, 2, 5, 10, 20, 50… — the gridline steps people read without effort. */
function niceStep(raw: number): number {
  if (raw <= 1) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

/* -------------------------------------------------------------------------
 * Funnel — nested stages with the drop-off between them.
 * ---------------------------------------------------------------------- */

export function Funnel({ stages }: { stages: { label: string; value: number; hint?: string }[] }) {
  const top = Math.max(1, ...stages.map((s) => s.value));

  return (
    <ol className="space-y-3">
      {stages.map((s, i) => {
        const prev = i === 0 ? null : stages[i - 1].value;
        // Conversion from the PREVIOUS stage, not from the top: "38% of
        // verified agents published" is actionable; "4% of everyone" hides
        // which step is leaking.
        const conversion = prev && prev > 0 ? Math.round((s.value / prev) * 100) : null;

        return (
          <li key={s.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{s.label}</span>
              <span className="flex items-baseline gap-2">
                {conversion !== null && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                      conversion >= 50
                        ? "bg-success-soft text-success"
                        : conversion >= 20
                          ? "bg-warning-soft text-warning"
                          : "bg-danger-soft text-danger"
                    }`}
                  >
                    {conversion}%
                  </span>
                )}
                <span className="text-base font-bold tabular-nums">{s.value}</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-blue"
                style={{ width: `${Math.max((s.value / top) * 100, s.value > 0 ? 2 : 0)}%` }}
              />
            </div>
            {s.hint && <p className="mt-1 text-xs text-muted">{s.hint}</p>}
          </li>
        );
      })}
    </ol>
  );
}
