import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";

/**
 * Astra AI brief panel (Dashboard 2.0). The AI Manager's panel, placed under
 * the command band so the brief is the first thing an agent reads.
 *
 * Everything shown here is passed in by the page from data it already had:
 * the rules-ranked actions from `lib/dashboard/brief.ts`, the cached AI
 * paragraph from `lib/ai/brief.ts` (or the reason there is none), the month's
 * quota, and the persona row. The panel decides layout only. It never invents
 * an action, a number or a recommendation, and it says plainly whether the
 * words came from a model or from the rules.
 */

export type AstraAction = {
  key: string;
  label: string;
  href: string;
  tone: "danger" | "warning" | "normal";
};

export type AstraBriefPanelProps = {
  manager: { name: string; portrait: string | null; avatar: string | null } | null;
  /** Rules-ranked actions, already translated, in priority order. */
  actions: AstraAction[];
  allClear: boolean;
  /** The model's paragraph when there is one; null means rules-only. */
  aiParagraph: string | null;
  /** Caption under the brief: where the words came from, or why there is no paragraph. */
  sourceCaption: string;
  aiModel: string | null;
  quota: string | null;
  labels: {
    title: string;
    role: string;
    priorities: string;
    allClear: string;
    sourceAi: string;
    sourceRules: string;
    regenerate: string;
  };
  /** Server action bound by the page; the button is rendered only when there are actions. */
  regenerate: (formData: FormData) => void | Promise<void>;
};

const TONE_DOT = {
  danger: "bg-danger",
  warning: "bg-warning",
  normal: "bg-blue",
} as const;

export function AstraBriefPanel(p: AstraBriefPanelProps) {
  const portrait = p.manager?.portrait ?? p.manager?.avatar ?? null;
  return (
    <section
      aria-labelledby="astra-brief-title"
      className="overflow-hidden rounded-2xl border border-line bg-card shadow-card"
    >
      <div className="grid gap-0 sm:grid-cols-[9rem_1fr] lg:grid-cols-[11rem_1fr]">
        {/* Astra ---------------------------------------------------------- */}
        <div className="relative flex items-end gap-4 bg-blue-soft p-5 sm:block sm:p-0">
          {portrait ? (
            <>
              <Image
                src={portrait}
                alt={p.manager?.name ?? ""}
                width={176}
                height={176}
                unoptimized
                className="h-20 w-20 shrink-0 rounded-2xl object-cover object-top ring-2 ring-blue/30 sm:h-full sm:min-h-[11rem] sm:w-full sm:rounded-none sm:ring-0"
              />
              <span aria-hidden className="pointer-events-none absolute inset-0 hidden bg-gradient-to-t from-card/70 to-transparent sm:block" />
            </>
          ) : (
            <div aria-hidden className="grid h-20 w-20 place-items-center rounded-2xl bg-blue/10 text-3xl text-blue sm:h-full sm:min-h-[11rem] sm:w-full sm:rounded-none">✦</div>
          )}
          <div className="min-w-0 sm:absolute sm:inset-x-0 sm:bottom-0 sm:p-4">
            <p className="truncate text-base font-bold text-foreground">{p.manager?.name ?? p.labels.title}</p>
            <p className="text-xs font-medium text-blue">✦ {p.labels.role}</p>
          </div>
        </div>

        {/* Brief ---------------------------------------------------------- */}
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
            <h2 id="astra-brief-title" className="text-base font-semibold">{p.labels.title}</h2>
            {p.aiParagraph ? (
              <Badge tone="info">{p.labels.sourceAi}{p.aiModel ? ` · ${p.aiModel}` : ""}</Badge>
            ) : (
              <Badge tone="neutral">{p.labels.sourceRules}</Badge>
            )}
          </div>

          {p.aiParagraph && (
            <p className="border-b border-line px-5 py-4 text-[15px] leading-7 text-foreground">{p.aiParagraph}</p>
          )}

          {p.allClear ? (
            <div className="p-5">
              <EmptyState icon="✦" title={p.labels.allClear} className="border-transparent bg-success-soft py-8" />
            </div>
          ) : (
            <div className="px-5 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{p.labels.priorities}</p>
              <ol className="grid gap-2 md:grid-cols-2">
                {p.actions.map((a, i) => (
                  <li key={a.key}>
                    <Link
                      href={a.href}
                      className={buttonClass("secondary", "w-full justify-between text-left")}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[a.tone]}`} />
                        <span className="min-w-0 truncate">
                          <span className="mr-1.5 tabular-nums text-muted">{i + 1}.</span>
                          {a.label}
                        </span>
                      </span>
                      <span aria-hidden className="shrink-0 text-blue">→</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-2.5 text-xs text-muted">
            <span className="min-w-0">{p.sourceCaption}</span>
            <span className="flex items-center gap-3">
              {p.quota && <span className="tabular-nums">{p.quota}</span>}
              {!p.allClear && (
                <form action={p.regenerate}>
                  <button type="submit" className={buttonClass("ghost", "min-h-8 px-2.5 text-xs")}>
                    {p.labels.regenerate}
                  </button>
                </form>
              )}
            </span>
          </footer>
        </div>
      </div>
    </section>
  );
}
