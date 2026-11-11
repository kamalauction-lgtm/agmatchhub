import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { loadActionQueue } from "@/lib/admin/action-queue";
import { QUEUE_WEIGHT, type QueueKind } from "@/lib/admin/queue-score";

/** The clock, read outside render (react-hooks/purity). */
function nowIso() {
  return new Date(Date.now()).toISOString();
}

const SHOWN = 12;

/**
 * Command Centre action queue (screen 1): everything waiting on an admin, in
 * one list sorted by risk and age, with a count per kind. Only the kinds the
 * admin's capabilities allow appear; rows are RLS-scoped to their countries.
 */
export async function ActionQueue() {
  const t = await getTranslations("admin.actionQueue");
  const now = nowIso();
  const items = await loadActionQueue(now);
  const counts = new Map<QueueKind, number>();
  for (const i of items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  const kinds = (Object.keys(QUEUE_WEIGHT) as QueueKind[]).filter((k) => counts.has(k));
  const age = (since: string) => {
    const h = Math.max(0, (Date.parse(now) - Date.parse(since)) / 3_600_000);
    return h < 1 ? t("lessThanHour") : h < 48 ? t("hours", { n: Math.floor(h) }) : t("days", { n: Math.floor(h / 24) });
  };
  const row = (i: (typeof items)[number]) => (
    <li key={`${i.kind}-${i.id}`} className="flex flex-wrap items-baseline gap-2 px-4 py-2.5 text-sm" data-queue-kind={i.kind} data-queue-id={i.id}>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${QUEUE_WEIGHT[i.kind] >= 5 ? "bg-danger/15 text-danger" : QUEUE_WEIGHT[i.kind] >= 3 ? "bg-warning/15 text-warning" : "bg-surface text-muted"}`}>
        {t(`kind.${i.kind}`)}
      </span>
      <Link href={i.href} className="min-w-0 flex-1 truncate font-medium hover:underline">{i.title || "—"}</Link>
      <span className="text-xs text-muted">{age(i.since)}</span>
    </li>
  );

  return (
    <section aria-labelledby="queue-title" className="rounded-xl border border-line" data-action-queue={items.length}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="queue-title" className="font-semibold">{t("title")}</h2>
        <p className="text-xs text-muted">{t("hint")}</p>
      </div>
      {kinds.length > 0 && (
        <ul className="flex flex-wrap gap-2 border-b border-line px-4 py-3 text-xs">
          {kinds.map((k) => (
            <li key={k} className="rounded-full bg-surface px-3 py-1" data-queue-tile={k}>
              {t(`kind.${k}`)} <span className="font-semibold">{counts.get(k)}</span>
            </li>
          ))}
        </ul>
      )}
      {!items.length ? (
        <p className="px-4 py-6 text-center text-sm text-muted">{t("empty")}</p>
      ) : (
        <>
          <ol className="divide-y divide-line">{items.slice(0, SHOWN).map(row)}</ol>
          {items.length > SHOWN && (
            <details className="border-t border-line">
              <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-crimson">{t("more", { n: items.length - SHOWN })}</summary>
              <ol className="divide-y divide-line">{items.slice(SHOWN).map(row)}</ol>
            </details>
          )}
        </>
      )}
    </section>
  );
}
