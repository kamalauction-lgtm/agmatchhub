"use client";

import { useState } from "react";
import type { PhotoCheckResult } from "@/lib/ai/photo-check";
import { AiStatus, type AiStatusLabels } from "@/components/ai/ai-status";
import { CompanionBadge, type Companion } from "@/components/ai/companion";

export type PhotoCheckLabels = AiStatusLabels & {
  title: string; hint: string; check: string; working: string; noPhotos: string; tooFew: string; noCover: string; allGood: string; bestCover: string;
  rule: Record<string, string>; issue: Record<string, string>; duplicateOf: string; summary: string;
};

/**
 * Photo Checker on the listing edit page: the rules' findings are shown at
 * once (free); "Check with AI" sends up to eight photos to the model for
 * blur, faces, plates, documents and watermarks. Nothing is changed — the
 * agent removes or replaces photos themselves.
 */
export function PhotoCheckPanel({ listingId, initial, action, companion, labels }: {
  listingId: string;
  initial: PhotoCheckResult;
  action: (listingId: string) => Promise<PhotoCheckResult>;
  companion?: Companion;
  labels: PhotoCheckLabels;
}) {
  const [r, setR] = useState<PhotoCheckResult>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  async function run() {
    setBusy(true); setErr(false);
    try { setR(await action(listingId)); } catch { setErr(true); } finally { setBusy(false); }
  }
  const ruleBy = new Map(r.ruleFlags.map((f) => [f.index, f]));
  const clean = r.count > 0 && !r.ruleFlags.length && r.photos.every((p) => p.ok) && !r.tooFew && r.hasCover;

  return (
    <section className="mb-6 rounded-xl border border-line bg-card shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <CompanionBadge c={companion} size="sm" />
          <div><h2 className="text-sm font-semibold">{labels.title}</h2><p className="text-xs text-muted">{labels.hint}</p></div>
        </div>
        {r.count > 0 && (
          <button type="button" onClick={run} disabled={busy} className="rounded-lg bg-crimson px-3 py-1.5 text-xs font-semibold text-white hover:bg-crimson-strong disabled:opacity-50">{busy ? labels.working : `✦ ${labels.check}`}</button>
        )}
      </header>
      <div className="px-5 py-3">
        {r.count === 0 ? <p className="text-sm text-muted">{labels.noPhotos}</p> : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              {r.tooFew && <span className="rounded-full bg-warning/10 px-2 py-0.5 font-semibold text-warning">{labels.tooFew}</span>}
              {!r.hasCover && <span className="rounded-full bg-warning/10 px-2 py-0.5 font-semibold text-warning">{labels.noCover}</span>}
              {clean && <span className="rounded-full bg-success/10 px-2 py-0.5 font-semibold text-success">{labels.allGood}</span>}
            </div>
            {(r.source === "ai" || r.reason) && <AiStatus source={r.source} reason={r.reason} model={r.model} labels={labels} className="mt-2" />}
            {err && <p className="mt-2 text-xs text-danger">{labels.reasons.failed}</p>}
            {r.summary && <p className="mt-2 text-sm">{r.summary}</p>}
            {r.bestCoverIndex && <p className="mt-1 text-xs text-muted">{labels.bestCover.replace("{n}", String(r.bestCoverIndex))}</p>}
            <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              {r.photos.map((p) => {
                const rf = ruleBy.get(p.index);
                const bad = !!rf || !p.ok;
                return (
                  <li key={p.id} className={`overflow-hidden rounded-lg border ${bad ? "border-warning" : "border-line"}`} title={[...(rf?.issues ?? []).map((i) => labels.rule[i]), ...p.issues.map((i) => labels.issue[i]), p.note].filter(Boolean).join(" · ")}>
                    {p.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                    ) : <div className="aspect-square bg-surface" />}
                    <div className="px-1.5 py-1 text-[10px] leading-tight">
                      <span className="font-semibold">#{p.index}</span>
                      {rf?.issues.map((i) => <span key={i} className="ml-1 text-warning">{labels.rule[i]}{i === "duplicate" && rf.duplicateOf ? ` ${labels.duplicateOf.replace("{n}", String(rf.duplicateOf))}` : ""}</span>)}
                      {p.issues.map((i) => <span key={i} className="ml-1 text-danger">{labels.issue[i]}</span>)}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
