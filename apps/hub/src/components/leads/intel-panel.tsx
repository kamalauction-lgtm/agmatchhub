"use client";

import { useState } from "react";
import type { LeadIntel, LeadMatch } from "@/app/(agent)/leads/ai-actions";
import { CompanionBadge, type Companion } from "@/components/ai/companion";

/**
 * Qualifier + matcher on one lead. The score is shown as dots with its reason
 * next to it — never a bare number — and the card is always rendered: a low
 * score changes the order of the list, not whether the lead is on it.
 */

export type IntelLabels = {
  qualify: string;
  requalify: string;
  working: string;
  intent: string;
  sourceAi: string;     // [model]
  sourceRules: string;
  reasons: Record<string, string>;
  action: string;
  findMatches: string;
  finding: string;
  matchesTitle: string;
  noMatches: string;
  own: string;
  pool: string;
  why: Record<string, string>;
  openListing: string;
};

export function IntelPanel({
  leadId,
  initial,
  qualifyAction,
  matchAction,
  marketplaceUrl,
  companion,
  matchCompanion,
  labels,
}: {
  leadId: string;
  initial: LeadIntel | null;
  /** Zayn qualifies; Niko finds the alternatives. */
  companion?: Companion;
  matchCompanion?: Companion;
  qualifyAction: (leadId: string) => Promise<LeadIntel>;
  matchAction: (leadId: string) => Promise<LeadMatch[]>;
  marketplaceUrl: string;
  labels: IntelLabels;
}) {
  const [intel, setIntel] = useState<LeadIntel | null>(initial);
  const [busy, setBusy] = useState<"qualify" | "match" | null>(null);
  const [matches, setMatches] = useState<LeadMatch[] | null>(null);

  async function doQualify() {
    setBusy("qualify");
    try { setIntel(await qualifyAction(leadId)); } catch { /* panel keeps what it had */ } finally { setBusy(null); }
  }
  async function doMatch() {
    setBusy("match");
    try { setMatches(await matchAction(leadId)); } catch { setMatches([]); } finally { setBusy(null); }
  }

  const btn = "rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold hover:border-crimson hover:text-crimson disabled:opacity-50";
  const money = (m: LeadMatch) =>
    m.price != null ? `${m.currency} ${Math.round(m.price).toLocaleString("id-ID")}${m.rent_period ? `/${m.rent_period === "monthly" ? "mo" : "yr"}` : ""}` : "—";

  return (
    <div className="mt-3 space-y-3">
      {/* Intent ---------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <CompanionBadge c={companion} size="xs" />
        {intel ? (
          <>
            <span className="flex items-center gap-1" title={labels.intent}>
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} aria-hidden className={`h-2 w-2 rounded-full ${n <= intel.intent ? (intel.intent >= 4 ? "bg-success" : intel.intent === 3 ? "bg-warning" : "bg-muted") : "bg-line"}`} />
              ))}
              <span className="ml-1 font-semibold">{labels.intent} {intel.intent}/5</span>
            </span>
            <span className="text-muted">{intel.reason}</span>
            {intel.suggestedAction && <span className="text-muted">· {labels.action}: {intel.suggestedAction}</span>}
            <span className="text-[11px] text-muted">
              {intel.source === "ai" ? labels.sourceAi.replace("[model]", intel.model ?? "AI") : (labels.reasons[intel.reason_code ?? ""] ?? labels.sourceRules)}
            </span>
          </>
        ) : null}
        <button type="button" onClick={doQualify} disabled={busy !== null} className={btn}>
          {busy === "qualify" ? labels.working : intel ? labels.requalify : labels.qualify}
        </button>
        <button type="button" onClick={doMatch} disabled={busy !== null} className={btn}>
          {busy === "match" ? labels.finding : labels.findMatches}
        </button>
      </div>

      {/* Matches --------------------------------------------------------- */}
      {matches && (
        <div className="rounded-lg border border-line bg-surface/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.matchesTitle}</p>
            <CompanionBadge c={matchCompanion} size="xs" />
          </div>
          {matches.length === 0 ? (
            <p className="mt-1 text-sm text-muted">{labels.noMatches}</p>
          ) : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-3">
              {matches.map((m) => (
                <li key={m.listing_id} className="rounded-lg border border-line bg-card p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-5">{m.title}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.source === "own" ? "bg-blue-soft text-blue" : "bg-indigo-soft text-indigo"}`}>
                      {m.source === "own" ? labels.own : labels.pool}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {money(m)} · {m.district_name ?? m.regency_name ?? "—"}{m.bedrooms != null ? ` · ${m.bedrooms} BR` : ""}{m.building_size ? ` · ${m.building_size} m²` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted">{m.reasons.map((r) => labels.why[r] ?? r).join(" · ")}</p>
                  {marketplaceUrl && (
                    <a href={`${marketplaceUrl}/properti/${m.slug}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-semibold text-blue hover:underline">
                      {labels.openListing} →
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
