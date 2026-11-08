"use client";

import { useState } from "react";
import type { ResearchResult } from "@/lib/ai/research";
import { AiStatus, type AiStatusLabels } from "@/components/ai/ai-status";

export type ResearchLabels = AiStatusLabels & {
  listingType: string; sale: string; rent: string; propertyType: string; regency: string; anyRegency: string; bedrooms: string; anyBedrooms: string;
  run: string; working: string; stats: string; count: string; median: string; perSqm: string; range: string; none: string;
  comparables: string; mine: string; typicalRange: string; drivers: string; caution: string; openListing: string; published: string;
};

export function ResearchTool({ action, countries, propertyTypes, regencies, marketplaceUrl, initial, labels }: {
  action: (input: unknown) => Promise<ResearchResult>;
  countries: { code: string; name: string }[];
  propertyTypes: { slug: string; label: string; country: string }[];
  regencies: { name: string; country: string }[];
  marketplaceUrl: string;
  initial: { country: string; listingType: "sale" | "rent"; propertyType: string; regency: string; bedrooms: string };
  labels: ResearchLabels;
}) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<ResearchResult | null>(null);
  const [err, setErr] = useState(false);
  const types = propertyTypes.filter((p) => p.country === f.country);
  const regs = regencies.filter((x) => x.country === f.country);
  const fmt = (n: number | null, cur?: string) => (n == null ? "—" : `${cur ?? ""} ${Math.round(n).toLocaleString()}`.trim());
  const input = "rounded-lg border border-line bg-background px-3 py-2 text-sm";

  async function run() {
    setBusy(true); setErr(false);
    try {
      setR(await action({ country: f.country, listingType: f.listingType, propertyType: f.propertyType, regency: f.regency || null, bedrooms: f.bedrooms ? Number(f.bedrooms) : null, withAi: true }));
    } catch { setErr(true); } finally { setBusy(false); }
  }

  const cur = r?.comparables[0]?.currency;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <select value={f.country} onChange={(e) => setF({ ...f, country: e.target.value, propertyType: "", regency: "" })} className={input} aria-label="country">
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <select value={f.listingType} onChange={(e) => setF({ ...f, listingType: e.target.value as "sale" | "rent" })} className={input} aria-label={labels.listingType}>
          <option value="sale">{labels.sale}</option><option value="rent">{labels.rent}</option>
        </select>
        <select value={f.propertyType} onChange={(e) => setF({ ...f, propertyType: e.target.value })} className={input} aria-label={labels.propertyType}>
          <option value="">{labels.propertyType}</option>
          {types.map((p) => <option key={p.slug} value={p.slug}>{p.label}</option>)}
        </select>
        <select value={f.regency} onChange={(e) => setF({ ...f, regency: e.target.value })} className={input} aria-label={labels.regency}>
          <option value="">{labels.anyRegency}</option>
          {regs.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
        </select>
        <select value={f.bedrooms} onChange={(e) => setF({ ...f, bedrooms: e.target.value })} className={input} aria-label={labels.bedrooms}>
          <option value="">{labels.anyBedrooms}</option>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button type="button" onClick={run} disabled={busy || !f.propertyType} className="rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-50 lg:col-span-5">
          {busy ? labels.working : `✦ ${labels.run}`}
        </button>
      </div>

      {err && <p className="text-sm text-danger">{labels.reasons.failed}</p>}

      {r && (
        <>
          <section className="rounded-xl border border-line bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{labels.stats}</h2>
            {r.stats.n === 0 ? <p className="mt-2 text-sm text-muted">{labels.none}</p> : (
              <dl className="mt-3 grid gap-3 sm:grid-cols-4">
                <div><dt className="text-xs text-muted">{labels.count}</dt><dd className="text-lg font-semibold">{r.stats.n}</dd></div>
                <div><dt className="text-xs text-muted">{labels.median}</dt><dd className="text-lg font-semibold">{fmt(r.stats.median, cur)}</dd></div>
                <div><dt className="text-xs text-muted">{labels.perSqm}</dt><dd className="text-lg font-semibold">{fmt(r.stats.perSqm, cur)}</dd></div>
                <div><dt className="text-xs text-muted">{labels.range}</dt><dd className="text-sm font-semibold">{fmt(r.stats.min, cur)} – {fmt(r.stats.max, cur)}</dd></div>
              </dl>
            )}
            {r.stats.n > 0 && (
              <div className="mt-4 space-y-2 border-t border-line pt-3">
                <AiStatus source={r.source} reason={r.reason} model={r.model} labels={labels} />
                {r.summary && <p className="text-sm leading-6">{r.summary}</p>}
                {r.typicalRange && <p className="text-sm"><span className="font-semibold">{labels.typicalRange}:</span> {r.typicalRange}</p>}
                {r.drivers.length > 0 && <p className="text-sm"><span className="font-semibold">{labels.drivers}:</span> {r.drivers.join(" · ")}</p>}
                {r.caution && <p className="text-xs text-warning">{labels.caution}: {r.caution}</p>}
              </div>
            )}
          </section>

          {r.comparables.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-line bg-card">
              <h2 className="border-b border-line px-4 py-3 text-sm font-semibold uppercase tracking-wide text-muted">{labels.comparables}</h2>
              <ul className="divide-y divide-line">
                {r.comparables.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.title}{c.mine && <span className="ml-2 rounded-full bg-indigo-soft px-2 py-0.5 text-[11px] font-semibold text-indigo">{labels.mine}</span>}</p>
                      <p className="text-xs text-muted">
                        {[c.district_name ?? c.regency_name, c.bedrooms ? `${c.bedrooms} BR` : null, c.building_size ? `${c.building_size} m²` : c.land_size ? `${c.land_size} m² (land)` : null, c.published_at ? `${labels.published} ${c.published_at.slice(0, 10)}` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{fmt(c.price, c.currency)}{c.rent_period ? ` /${c.rent_period === "monthly" ? "m" : "y"}` : ""}</span>
                      <a href={`${marketplaceUrl}/p/${c.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue hover:underline">{labels.openListing} ↗</a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
