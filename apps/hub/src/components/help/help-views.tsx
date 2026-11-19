import Link from "next/link";
import type { HelpLang, HelpTopic } from "@/lib/help/types";
import { pick } from "@/lib/help/types";

/** The list of guides for one audience. */
export function HelpIndex({
  topics, lang, base, labels,
}: {
  topics: HelpTopic[];
  lang: HelpLang;
  base: string;
  labels: { title: string; intro: string; updated: string; langNote: string | null };
}) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">{labels.title}</h1>
      <p className="mt-1 text-sm text-muted">{labels.intro}</p>
      {labels.langNote && <p className="mt-2 text-xs text-muted">{labels.langNote}</p>}
      <ol className="mt-6 space-y-3" data-help-index="1">
        {topics.map((topic, i) => (
          <li key={topic.slug}>
            <Link href={`${base}/${topic.slug}`} className="block rounded-xl border border-line p-4 transition-colors hover:border-crimson">
              <span className="text-xs font-semibold text-muted">{i + 1}</span>
              <span className="ml-2 font-semibold">{pick(topic.title, lang)}</span>
              <span className="mt-1 block text-sm text-muted">{pick(topic.summary, lang)}</span>
              <span className="mt-1 block text-[11px] text-muted">{labels.updated} {topic.updated}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One guide: sections of numbered steps and notes. */
export function HelpArticle({
  topic, lang, base, labels,
}: {
  topic: HelpTopic;
  lang: HelpLang;
  base: string;
  labels: { back: string; updated: string; open: string };
}) {
  return (
    <article className="max-w-3xl" data-help-topic={topic.slug}>
      <Link href={base} className="text-sm text-muted hover:text-foreground">← {labels.back}</Link>
      <h1 className="mt-3 text-2xl font-semibold">{pick(topic.title, lang)}</h1>
      <p className="mt-1 text-sm text-muted">{pick(topic.summary, lang)}</p>
      <p className="mt-1 text-[11px] text-muted">{labels.updated} {topic.updated}</p>
      {topic.path && (
        <Link href={topic.path} className="mt-3 inline-block rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-crimson hover:text-crimson">
          {labels.open} →
        </Link>
      )}
      {topic.sections.map((section, si) => (
        <section key={si} className="mt-8">
          <h2 className="text-lg font-semibold">{pick(section.heading, lang)}</h2>
          {section.steps && (
            <ol className="mt-3 list-decimal space-y-2 pl-6 text-sm leading-6">
              {section.steps.map((s, i) => <li key={i}>{pick(s, lang)}</li>)}
            </ol>
          )}
          {section.notes?.map((n, i) => (
            <p key={i} className="mt-3 rounded-lg bg-surface px-4 py-3 text-sm leading-6 text-muted">{pick(n, lang)}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
