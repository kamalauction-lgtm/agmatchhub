"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { attachItemPhotos, attachItemPhotosForm } from "@/app/(agent)/listings/import/photo-actions";

/**
 * Photos for imported listings (P0-e-1a). One item per server call, in order,
 * so a slow source delays one row and a failure never touches the listing.
 */

export type PhotoItem = {
  id: string;
  title: string;
  state: "none" | "pending" | "done" | "partial" | "failed";
  saved: number;
  total: number;
  attempts: number;
  reasons: string[];
  /** Photos saved but rejected by processing (P0-e-2a). */
  processingFailed: number;
};

export function PhotoAttach({
  items,
  enabled,
  maxAttempts,
  labels,
}: {
  items: PhotoItem[];
  enabled: boolean;
  maxAttempts: number;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [running, setRunning] = useState<string | null>(null);

  const runnable = items.filter((i) => i.state !== "done" && i.attempts < maxAttempts);

  const run = (ids: string[]) =>
    startTransition(async () => {
      for (const id of ids) {
        setRunning(id);
        const fd = new FormData();
        fd.set("itemId", id);
        await attachItemPhotos(fd);
      }
      setRunning(null);
      router.refresh();
    });

  const reasonText = (r: string) => labels[`reason_${r}`] ?? labels.reason_source_error;

  return (
    <section className="mb-8 rounded-xl border border-line p-5">
      <h2 className="text-sm font-semibold">{labels.title}</h2>
      <p className="mt-1 text-xs text-muted">{enabled ? labels.intro : labels.disabled}</p>

      {enabled && runnable.length > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(runnable.map((i) => i.id))}
          className="mt-4 min-h-11 cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-50"
        >
          {busy ? labels.attaching : `${labels.attachAll} (${runnable.length})`}
        </button>
      )}

      <ul className="mt-4 divide-y divide-line text-sm">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{i.title}</p>
              <p className="text-xs text-muted">
                {i.state === "pending"
                  ? labels.waiting.replace("{total}", String(i.total))
                  : labels.savedOf.replace("{saved}", String(i.saved)).replace("{total}", String(i.total))}
                {running === i.id ? ` · ${labels.attaching}` : ""}
              </p>
              {i.reasons.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-warning">
                  {[...new Set(i.reasons)].map((r) => <li key={r}>{reasonText(r)}</li>)}
                </ul>
              )}
              {i.state !== "done" && i.attempts >= maxAttempts && (
                <p className="mt-1 text-xs text-muted">{labels.exhausted}</p>
              )}
              {i.saved > 0 && <p className="mt-1 text-xs text-muted">{labels.privateNote}</p>}
              {i.processingFailed > 0 && (
                <p className="mt-1 text-xs text-warning">{labels.processingFailed.replace("{n}", String(i.processingFailed))}</p>
              )}
            </div>
            {enabled && i.state !== "done" && i.attempts < maxAttempts && (
              <form action={attachItemPhotosForm}>
                <input type="hidden" name="itemId" value={i.id} />
                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold hover:border-crimson hover:text-crimson disabled:opacity-50"
                >
                  {i.state === "pending" ? labels.attachAll : labels.retry}
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
