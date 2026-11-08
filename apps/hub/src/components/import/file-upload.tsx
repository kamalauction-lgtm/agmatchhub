"use client";

import { useState } from "react";
import { uploadSpreadsheet } from "@/app/(agent)/listings/import/upload-actions";

/**
 * Upload an .xlsx or .csv.
 *
 * The file name is shown once chosen, because on a phone the native picker
 * closes and leaves no other sign that anything was selected — and an agent who
 * cannot tell whether their file attached will press the button twice.
 */

const MAX_BYTES = 5_000_000;

export function FileUpload({ labels }: { labels: Record<string, string> }) {
  const [filename, setFilename] = useState<string | null>(null);
  const [tooBig, setTooBig] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={uploadSpreadsheet}
      onSubmit={() => setBusy(true)}
      className="mt-4 space-y-3"
    >
      <label className="block cursor-pointer rounded-lg border border-dashed border-line px-4 py-5 text-center transition hover:border-crimson">
        <input
          type="file"
          name="file"
          required
          accept=".xlsx,.xlsm,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFilename(f?.name ?? null);
            // Checked here so a phone on a slow connection is not asked to
            // upload 20MB before being told no. The server checks again.
            setTooBig(!!f && f.size > MAX_BYTES);
          }}
        />
        <span className="block text-sm font-semibold text-crimson">
          {filename ?? labels.choose}
        </span>
        <span className="mt-1 block text-xs text-muted">{labels.formats}</span>
      </label>

      {tooBig && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
          {labels.tooLarge}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || tooBig || !filename}
        className="w-full rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-50"
      >
        {busy ? "…" : labels.cta}
      </button>

      {/* What the file must contain, said before the upload rather than after
          it fails. */}
      <p className="text-xs text-muted">{labels.needs}</p>
      {/* A plain anchor, deliberately: this is a Route Handler returning a CSV
          attachment, not a page. `next/link` would make the client router
          fetch it as a navigation and the download would never start. */}
      <a
        href="/listings/import/template"
        download
        className="text-xs font-semibold text-crimson hover:underline"
      >
        {labels.template}
      </a>
    </form>
  );
}
