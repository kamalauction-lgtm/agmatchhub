"use client";

import { useState } from "react";
import { processItem, saveItemOverrides, setItemStatus } from "@/app/(agent)/listings/import/actions";
import { importReadyItems } from "@/app/(agent)/listings/import/commit-actions";

/**
 * The review table.
 *
 * Two things it is careful about:
 *
 * 1. **Fetching is one item per request.** "Fetch all" walks the list in the
 *    browser, one server action at a time. That is the background processing:
 *    no request loads 128 external pages, a slow portal delays one row, and a
 *    broken listing fails alone. Progress survives a refresh because state
 *    lives in `import_items`, not in this component.
 *
 * 2. **Imported values and the agent's edits stay distinguishable.** A field
 *    shows a tick when it came from the source and a warning when it did not,
 *    so the agent can see what they are trusting rather than a form full of
 *    values with no provenance.
 */

type Item = {
  id: string;
  sourceUrl: string | null;
  status: string;
  extracted: Record<string, unknown>;
  overrides: Record<string, unknown>;
  warnings: string[];
  error: string | null;
  listingId: string | null;
  duplicateOfListingId: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  ready: "bg-success/10 text-success",
  imported: "bg-success/10 text-success",
  needs_review: "bg-warning/10 text-warning",
  duplicate: "bg-warning/10 text-warning",
  failed: "bg-danger/10 text-danger",
  found: "bg-surface text-muted",
  processing: "bg-surface text-muted",
  skipped: "bg-surface text-muted",
};

export function ImportReview({
  batchId,
  items,
  declaration,
  labels,
  errorLabels,
}: {
  batchId: string;
  items: Item[];
  declaration: { id: string; body: string } | null;
  labels: Record<string, string>;
  errorLabels: Record<string, string>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [accepted, setAccepted] = useState(false);

  const pending = items.filter((i) => i.status === "found" || i.status === "failed");
  const readyCount = items.filter((i) => i.status === "ready").length;

  /** Walk the unfetched items one at a time. */
  async function processAll() {
    setRunning(true);
    setDone(0);
    for (const item of pending) {
      const fd = new FormData();
      fd.set("itemId", item.id);
      try {
        await processItem(fd);
      } catch {
        // A thrown action is one dead item, not a dead batch.
      }
      setDone((n) => n + 1);
    }
    setRunning(false);
    // The rows are server-rendered, so a refresh is how the new statuses show.
    window.location.reload();
  }

  const value = (i: Item, key: string) => i.overrides[key] ?? i.extracted[key];
  const fromSource = (i: Item, key: string) =>
    i.extracted[key] !== undefined && i.extracted[key] !== null && i.extracted[key] !== "";

  const field = (i: Item, key: string, label: string) => {
    const v = value(i, key);
    const has = v !== undefined && v !== null && v !== "";
    return (
      <div key={key} className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted">{label}</span>
        <span className={has ? "font-medium" : "text-warning"}>
          {has ? `${String(v).slice(0, 40)} ${fromSource(i, key) ? "✓" : ""}` : `⚠ ${labels.missing}`}
        </span>
      </div>
    );
  };

  const input =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson";

  return (
    <>
      {pending.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
          <button
            type="button"
            onClick={processAll}
            disabled={running}
            className="rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-60"
          >
            {running ? `${labels.processing} ${done}/${pending.length}` : `${labels.processAll} (${pending.length})`}
          </button>
          <p className="text-xs text-muted">{labels.reviewSubtitle}</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((i) => {
          const title = String(value(i, "title") ?? i.sourceUrl ?? "—");
          const isEditing = editing === i.id;

          return (
            <article key={i.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[i.status] ?? "bg-surface"}`}>
                      {labels[i.status] ?? i.status}
                    </span>
                  </div>
                  {/* The sentence, not the code. A blocked fetch has to tell
                      the agent what to do instead, or the row is a dead end. */}
                  {i.error && (
                    <p className="mt-1.5 text-xs text-danger">
                      {errorLabels[i.error] ?? i.error}
                    </p>
                  )}
                  <h3 className="mt-1.5 truncate font-semibold">{title}</h3>
                  {i.sourceUrl && (
                    <a
                      href={i.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="mt-0.5 block truncate text-xs text-crimson hover:underline"
                    >
                      {labels.sourceLink}
                    </a>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {i.status === "imported" && i.listingId && (
                    <a href={`/listings/${i.listingId}/edit`}
                       className="rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:border-crimson hover:text-crimson">
                      {labels.edit}
                    </a>
                  )}
                  {/* Read the source again. The button an agent needs when a
                      page was half-read the first time — without it the only
                      remedy is deleting the batch and pasting the links again. */}
                  {i.status !== "imported" && i.sourceUrl && (
                    <form action={processItem}>
                      <input type="hidden" name="itemId" value={i.id} />
                      <button type="submit"
                        className="rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:border-crimson hover:text-crimson">
                        {labels.refetch}
                      </button>
                    </form>
                  )}
                  {i.status !== "imported" && (
                    <button
                      type="button"
                      onClick={() => setEditing(isEditing ? null : i.id)}
                      className="rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:border-crimson hover:text-crimson"
                    >
                      {isEditing ? labels.cancel : labels.edit}
                    </button>
                  )}
                  {i.status !== "imported" && i.status !== "skipped" && (
                    <form action={setItemStatus}>
                      <input type="hidden" name="itemId" value={i.id} />
                      <input type="hidden" name="status" value="skipped" />
                      <button type="submit"
                        className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted hover:border-danger hover:text-danger">
                        {labels.skip}
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {/* Duplicate: warn, offer both doors, never decide silently. */}
              {i.status === "duplicate" && (
                <div className="mt-3 rounded-lg bg-warning/10 p-3 text-xs text-warning">
                  <p className="font-medium">{labels.duplicateWarning}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {i.duplicateOfListingId && (
                      <a href={`/listings/${i.duplicateOfListingId}/edit`}
                         className="rounded border border-warning/40 px-2 py-1 font-semibold">
                        {labels.openExisting}
                      </a>
                    )}
                    <form action={setItemStatus}>
                      <input type="hidden" name="itemId" value={i.id} />
                      <input type="hidden" name="status" value="ready" />
                      <button type="submit" className="rounded border border-warning/40 px-2 py-1 font-semibold">
                        {labels.importAnyway}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {!isEditing && i.status !== "found" && i.status !== "imported" && (
                <div className="mt-3 grid gap-1 border-t border-line pt-3 sm:grid-cols-2 sm:gap-x-8">
                  {field(i, "title", labels.fieldTitle)}
                  {field(i, "price", labels.fieldPrice)}
                  {field(i, "propertyType", labels.fieldPropertyType)}
                  {field(i, "listingType", labels.fieldListingType)}
                  {field(i, "bedrooms", labels.fieldBedrooms)}
                  {field(i, "buildingSize", labels.fieldBuildingSize)}
                </div>
              )}

              {isEditing && (
                <form action={saveItemOverrides} className="mt-3 border-t border-line pt-3">
                  <input type="hidden" name="itemId" value={i.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold sm:col-span-2">
                      {labels.fieldTitle}
                      <input name="title" defaultValue={String(value(i, "title") ?? "")} maxLength={140} className={input} />
                    </label>
                    <label className="block text-xs font-semibold">
                      {labels.fieldPrice}
                      <input name="price" type="number" min={1} defaultValue={String(value(i, "price") ?? "")} className={input} />
                    </label>
                    <label className="block text-xs font-semibold">
                      {labels.fieldListingType}
                      <select name="listingType" defaultValue={String(value(i, "listingType") ?? "")} className={input}>
                        <option value="">—</option>
                        <option value="sale">{labels.forSale}</option>
                        <option value="rent">{labels.forRent}</option>
                      </select>
                    </label>
                    <label className="block text-xs font-semibold">
                      {labels.fieldPropertyType}
                      <select name="propertyType" defaultValue={String(value(i, "propertyType") ?? "")} className={input}>
                        <option value="">—</option>
                        {["rumah","apartemen","ruko","rukan","kondominium","villa","kost","gudang","pabrik","kantor","toko","hotel","tanah","kavling","lainnya"].map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold">
                      {labels.fieldBedrooms}
                      <input name="bedrooms" type="number" min={0} max={50} defaultValue={String(value(i, "bedrooms") ?? "")} className={input} />
                    </label>
                    <label className="block text-xs font-semibold">
                      {labels.fieldBathrooms}
                      <input name="bathrooms" type="number" min={0} max={50} defaultValue={String(value(i, "bathrooms") ?? "")} className={input} />
                    </label>
                    <label className="block text-xs font-semibold">
                      {labels.fieldBuildingSize}
                      <input name="buildingSize" type="number" min={0} step="0.01" defaultValue={String(value(i, "buildingSize") ?? "")} className={input} />
                    </label>
                    <label className="block text-xs font-semibold sm:col-span-2">
                      {labels.fieldDescription}
                      <textarea name="description" rows={4} maxLength={4000} defaultValue={String(value(i, "description") ?? "")} className={input} />
                    </label>
                  </div>
                  <button type="submit" className="mt-3 rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong">
                    {labels.save}
                  </button>
                </form>
              )}
            </article>
          );
        })}
      </div>

      {/* Authority — versioned declaration, not a bare checkbox ------------- */}
      {readyCount > 0 && declaration && (
        <form action={importReadyItems} className="mt-8 rounded-xl border border-crimson/40 p-5">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="declarationVersionId" value={declaration.id} />

          <h2 className="text-sm font-semibold">{labels.authorityHeading}</h2>
          <label className="mt-3 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              required
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-crimson"
            />
            {/* The exact wording that gets stored on the consent record. */}
            <span className="text-muted">{declaration.body}</span>
          </label>

          <button
            type="submit"
            disabled={!accepted}
            className="mt-4 w-full rounded-lg bg-crimson px-5 py-3 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-50 sm:w-auto"
          >
            {labels.importReady} ({readyCount})
          </button>
          <p className="mt-2 text-xs text-muted">{labels.photosNote}</p>
        </form>
      )}
    </>
  );
}
