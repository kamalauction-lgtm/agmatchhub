"use client";

import { useState } from "react";
import { startImport } from "@/app/(agent)/listings/import/actions";

/**
 * Choose a portal, then either paste a profile URL or paste listing links.
 *
 * Two tabs rather than two forms stacked: on a 375px screen a second form below
 * the fold is a form nobody finds. The whole flow is built for someone standing
 * in a lift with a link on their clipboard.
 */

export type StarterLabels = Record<string, string>;

export function ImportStarter({
  portals,
  labels,
}: {
  portals: { value: string; label: string }[];
  labels: StarterLabels;
}) {
  const [mode, setMode] = useState<"profile" | "urls">("urls");
  const [busy, setBusy] = useState(false);

  const tab = (id: "profile" | "urls", text: string) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
        mode === id ? "bg-crimson text-white" : "border border-line hover:border-crimson hover:text-crimson"
      }`}
    >
      {text}
    </button>
  );

  return (
    <form action={startImport} onSubmit={() => setBusy(true)} className="space-y-4">
      <label className="block text-xs font-semibold">
        {labels.portal}
        <select
          name="portal"
          defaultValue={portals[0]?.value}
          className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson"
        >
          {portals.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        {tab("urls", labels.tabUrls)}
        {tab("profile", labels.tabProfile)}
      </div>
      <input type="hidden" name="mode" value={mode} />

      {mode === "urls" ? (
        <label className="block text-xs font-semibold">
          {labels.urlsHelp}
          {/* One per line. Making an agent submit ten links one at a time is
              the kind of friction that stops a migration happening at all. */}
          <textarea
            name="input"
            required
            rows={5}
            inputMode="url"
            placeholder={labels.urlsPlaceholder}
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5 font-mono text-xs outline-none focus:border-crimson"
          />
        </label>
      ) : (
        <label className="block text-xs font-semibold">
          {labels.profileHelp}
          <input
            name="input"
            required
            type="url"
            inputMode="url"
            placeholder={labels.profilePlaceholder}
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson"
          />
        </label>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-crimson px-5 py-3 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-60 sm:w-auto"
      >
        {busy ? "…" : mode === "urls" ? labels.urlsCta : labels.profileCta}
      </button>

      {/* Said plainly and up front: some portals block automated reading, and
          finding that out after pasting 40 links would be worse. */}
      <p className="text-xs text-muted">{labels.note}</p>
    </form>
  );
}
