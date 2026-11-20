import Image from "next/image";
import Link from "next/link";
import type { HelpLang, HelpTopic } from "@/lib/help/types";
import { pick, topicCover, walkSteps } from "@/lib/help/types";
import { HelpCardProgress, HelpWalkthrough, type WalkLabels } from "./help-walkthrough";

/** EN | ID switch for the guides; keeps the reader on the same page. */
function LangSwitch({ lang, href, label }: { lang: HelpLang; href: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-line bg-card p-1" role="group" aria-label={label} data-help-lang={lang}>
      {(["en", "id"] as const).map((l) => (
        <Link
          key={l}
          href={`${href}?lang=${l}`}
          aria-current={l === lang ? "true" : undefined}
          className={`min-h-8 rounded-full px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-crimson ${l === lang ? "bg-crimson-btn text-white" : "text-muted-strong hover:text-foreground"}`}
        >
          {l === "en" ? "English" : "Indonesia"}
        </Link>
      ))}
    </div>
  );
}

export type IndexLabels = {
  title: string;
  intro: string;
  updated: string;
  langNote: string | null;
  language: string;
  stepsCount: string; // "{n} steps"
  doneOf: string;
  start: string;
};

/** The guides for one audience, as picture cards. */
export function HelpIndex({
  topics, lang, base, labels,
}: {
  topics: HelpTopic[];
  lang: HelpLang;
  base: string;
  labels: IndexLabels;
}) {
  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{labels.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-strong">{labels.intro}</p>
          {labels.langNote && <p className="mt-2 text-xs text-muted">{labels.langNote}</p>}
        </div>
        <LangSwitch lang={lang} href={base} label={labels.language} />
      </div>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-help-index="1">
        {topics.map((topic, i) => {
          const cover = topicCover(topic, lang);
          const total = walkSteps(topic, lang).length;
          return (
            <li key={topic.slug}>
              <Link
                href={`${base}/${topic.slug}?lang=${lang}`}
                className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors duration-200 hover:border-crimson focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
              >
                <div className="relative aspect-[16/9] overflow-hidden border-b border-line bg-surface">
                  {cover && (
                    <Image src={cover} alt="" fill sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw" className="object-cover object-left-top" />
                  )}
                  <span className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-crimson-btn text-sm font-bold text-white shadow">
                    {i + 1}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <span className="font-semibold group-hover:text-crimson">{pick(topic.title, lang)}</span>
                  <span className="mt-1 flex-1 text-sm text-muted-strong">{pick(topic.summary, lang)}</span>
                  <span className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                    <span>{labels.stepsCount.replace("{n}", String(total))}</span>
                    <span aria-hidden>·</span>
                    <span>{labels.updated} {topic.updated}</span>
                    <HelpCardProgress audience={topic.audience} slug={topic.slug} total={total} label={labels.doneOf} />
                  </span>
                  <span className="mt-3 text-sm font-semibold text-crimson">{labels.start} →</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export type ArticleLabels = WalkLabels & { updated: string; open: string; language: string };

/** One guide as an interactive walkthrough. */
export function HelpArticle({
  topic, lang, base, initialStep, labels,
}: {
  topic: HelpTopic;
  lang: HelpLang;
  base: string;
  initialStep: number;
  labels: ArticleLabels;
}) {
  return (
    <article className="max-w-6xl" data-help-topic={topic.slug}>
      <Link href={`${base}?lang=${lang}`} className="text-sm text-muted-strong hover:text-foreground">← {labels.allGuides}</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{pick(topic.title, lang)}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-strong">{pick(topic.summary, lang)}</p>
          <p className="mt-1 text-[11px] text-muted">{labels.updated} {topic.updated}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LangSwitch lang={lang} href={`${base}/${topic.slug}`} label={labels.language} />
          {topic.path && (
            <Link
              href={topic.path}
              data-help-open="1"
              className="inline-flex min-h-9 items-center rounded-lg border border-line bg-card px-3 text-sm font-semibold transition-colors hover:border-crimson hover:text-crimson focus-visible:outline-2 focus-visible:outline-crimson"
            >
              {labels.open} ↗
            </Link>
          )}
        </div>
      </div>
      <HelpWalkthrough
        key={lang}
        steps={walkSteps(topic, lang)}
        audience={topic.audience}
        slug={topic.slug}
        initialStep={initialStep}
        base={`${base}?lang=${lang}`}
        labels={labels}
      />
    </article>
  );
}

/**
 * The way back from a screen to its guide: a small "? Guide" link placed next
 * to a page title. `step` is 1-based and opens the guide on that step.
 */
export function HelpHint({ href, step, label }: { href: string; step?: number; label: string }) {
  return (
    <Link
      href={step ? `${href}?step=${step}` : href}
      data-help-hint="1"
      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-xs font-semibold text-muted-strong transition-colors hover:border-crimson hover:text-crimson focus-visible:outline-2 focus-visible:outline-crimson"
    >
      <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-full bg-crimson-btn text-[10px] font-bold text-white">?</span>
      {label}
    </Link>
  );
}
