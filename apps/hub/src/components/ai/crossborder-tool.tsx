"use client";

import { useState } from "react";
import type { CrossborderBrief } from "@/lib/ai/crossborder";
import { AiStatus, type AiStatusLabels } from "@/components/ai/ai-status";
import { CopyButton } from "@/components/ui/copy-button";

export type CrossborderLabels = AiStatusLabels & {
  listingCountry: string; buyerCountry: string; listing: string; noListing: string; run: string; working: string; facts: string; draft: string; verified: string;
  draftBanner: string; headline: string; nextSteps: string; mustCheck: string; copy: string; copied: string; topics: Record<string, string>; source: string;
};

export function CrossborderTool({ action, countries, listings, initialListingCountry, labels }: {
  action: (input: unknown) => Promise<CrossborderBrief>;
  countries: { code: string; name: string }[];
  listings: { id: string; title: string; country: string }[];
  initialListingCountry: string;
  labels: CrossborderLabels;
}) {
  const other = (c: string) => countries.find((x) => x.code !== c)?.code ?? c;
  const [f, setF] = useState({ listingCountry: initialListingCountry, buyerCountry: other(initialListingCountry), listingId: "" });
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<CrossborderBrief | null>(null);
  const [err, setErr] = useState(false);
  const input = "rounded-lg border border-line bg-background px-3 py-2 text-sm";
  const mine = listings.filter((l) => l.country === f.listingCountry);

  async function run() {
    setBusy(true); setErr(false);
    try { setR(await action({ ...f, listingId: f.listingId || null, withAi: true })); } catch { setErr(true); } finally { setBusy(false); }
  }
  const topic = (k: string) => labels.topics[k] ?? k;
  const plain = r ? [r.headline ?? "", "", ...r.points.map((p) => `• ${topic(p.topic)}: ${p.text}${p.status === "draft" ? ` (${labels.draft})` : ""}`), "", ...(r.nextSteps.length ? [labels.nextSteps + ":", ...r.nextSteps.map((s) => `- ${s}`)] : []), ...(r.mustCheck.length ? ["", labels.mustCheck + ":", ...r.mustCheck.map((s) => `- ${s}`)] : [])].join("\n") : "";

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-muted">{labels.listingCountry}
          <select value={f.listingCountry} onChange={(e) => setF({ listingCountry: e.target.value, buyerCountry: other(e.target.value), listingId: "" })} className={`${input} mt-1 w-full`}>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-muted">{labels.buyerCountry}
          <select value={f.buyerCountry} onChange={(e) => setF({ ...f, buyerCountry: e.target.value })} className={`${input} mt-1 w-full`}>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-muted">{labels.listing}
          <select value={f.listingId} onChange={(e) => setF({ ...f, listingId: e.target.value })} className={`${input} mt-1 w-full`}>
            <option value="">{labels.noListing}</option>
            {mine.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </label>
        <button type="button" onClick={run} disabled={busy} className="self-end rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-50">
          {busy ? labels.working : `✦ ${labels.run}`}
        </button>
      </div>
      {err && <p className="text-sm text-danger">{labels.reasons.failed}</p>}

      {r && (
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <section className="rounded-xl border border-line bg-card p-4">
            {!r.allVerified && <p className="mb-3 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">{labels.draftBanner}</p>}
            <AiStatus source={r.source} reason={r.reason} model={r.model} labels={labels} className="mb-2" />
            {r.listing && <p className="mb-2 text-xs text-muted">{r.listing.title} · {r.listing.price} · {r.listing.place}</p>}
            {r.headline && <h2 className="text-lg font-semibold">{r.headline}</h2>}
            <ul className="mt-3 space-y-2">
              {r.points.map((p, i) => (
                <li key={i} className="rounded-lg bg-surface px-3 py-2 text-sm">
                  <span className="mr-2 rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-muted">{topic(p.topic)}</span>
                  {p.text}
                  <span className={`ml-2 text-[11px] font-semibold ${p.status === "verified" ? "text-success" : "text-warning"}`}>{p.status === "verified" ? `✓ ${labels.verified}` : labels.draft}</span>
                </li>
              ))}
            </ul>
            {r.nextSteps.length > 0 && <><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{labels.nextSteps}</p><ul className="mt-1 list-disc pl-5 text-sm">{r.nextSteps.map((s) => <li key={s}>{s}</li>)}</ul></>}
            {r.mustCheck.length > 0 && <><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-warning">{labels.mustCheck}</p><ul className="mt-1 list-disc pl-5 text-sm">{r.mustCheck.map((s) => <li key={s}>{s}</li>)}</ul></>}
            <CopyButton text={plain} label={labels.copy} copiedLabel={labels.copied} className="mt-4" />
          </section>
          <aside className="rounded-xl border border-line bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.facts} · {r.listingCountry}</p>
            <ul className="mt-2 space-y-2 text-xs">
              {r.facts.map((fct) => (
                <li key={fct.id}>
                  <span className="font-semibold">{topic(fct.topic)}</span>
                  <span className={`ml-1 ${fct.status === "verified" ? "text-success" : "text-warning"}`}>· {fct.status === "verified" ? labels.verified : labels.draft}</span>
                  {fct.sourceUrl && <a href={fct.sourceUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue hover:underline">{labels.source} ↗</a>}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
