import type { GalleryItem } from "@/lib/listings/gallery";
import { moveMediaForm, removeMediaForm, setCoverForm } from "@/app/(agent)/listings/[id]/edit/gallery-actions";

/**
 * The agent's gallery editor (P0-e-3a). Server-rendered; every control is a
 * plain form, so it works without JavaScript and each press is one audited
 * database call. The rules live in the database (00112); this only shows
 * which controls apply.
 */

export type GalleryLabels = {
  title: string;
  hint: string;
  empty: string;
  cover: string;
  makeCover: string;
  moveUp: string;
  moveDown: string;
  remove: string;
  removeImportedNote: string;
  state: Record<string, string>;
  notice?: string;
};

export function GalleryEditor({
  listingId,
  items,
  published,
  labels,
}: {
  listingId: string;
  items: GalleryItem[];
  published: boolean;
  labels: GalleryLabels;
}) {
  const btn = "rounded-md border border-line px-2 py-1 text-xs font-medium hover:border-crimson hover:text-crimson disabled:opacity-40";
  const coverable = (it: GalleryItem) =>
    !it.isCover && !["failed", "quarantined"].includes(it.state) && (!published || it.state === "ready");

  return (
    <section id="gallery" className="mb-8 rounded-xl border border-line p-4" aria-labelledby="gallery-title">
      <h2 id="gallery-title" className="text-lg font-semibold">{labels.title}</h2>
      <p className="mt-1 text-sm text-muted">{labels.hint}</p>
      {labels.notice && (
        <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm" role="status">{labels.notice}</p>
      )}
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{labels.empty}</p>
      ) : (
        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((it, n) => (
            <li key={it.id} className="rounded-lg border border-line p-2" data-media={it.id} data-state={it.state}>
              <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-surface">
                {it.thumbUrl ? (
                  // Signed or public URLs of the agent's own photos; not optimised on purpose.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : null}
                {it.isCover && (
                  <span className="absolute left-1 top-1 rounded bg-crimson px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {labels.cover}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">{n + 1}. {labels.state[it.state] ?? it.state}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {coverable(it) && (
                  <form action={setCoverForm}>
                    <input type="hidden" name="listingId" value={listingId} />
                    <input type="hidden" name="mediaId" value={it.id} />
                    <button className={btn}>{labels.makeCover}</button>
                  </form>
                )}
                <form action={moveMediaForm}>
                  <input type="hidden" name="listingId" value={listingId} />
                  <input type="hidden" name="mediaId" value={it.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button className={btn} disabled={n === 0} aria-label={labels.moveUp}>↑</button>
                </form>
                <form action={moveMediaForm}>
                  <input type="hidden" name="listingId" value={listingId} />
                  <input type="hidden" name="mediaId" value={it.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button className={btn} disabled={n === items.length - 1} aria-label={labels.moveDown}>↓</button>
                </form>
                <form action={removeMediaForm}>
                  <input type="hidden" name="listingId" value={listingId} />
                  <input type="hidden" name="mediaId" value={it.id} />
                  <button className={btn} title={it.imported ? labels.removeImportedNote : undefined}>{labels.remove}</button>
                </form>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
