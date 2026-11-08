"use client";

import { useState } from "react";
import type { OfferSummary } from "@/lib/ai/offer-summary";
import { AiStatus, type AiStatusLabels } from "@/components/ai/ai-status";
import { CopyButton } from "@/components/ui/copy-button";

/** Offer Summary Writer, inline under one offer: plain words for the owner and for the buyer. */
export function OfferSummaryButton({ offerId, role, action, labels }: {
  offerId: string;
  role: "ra" | "sa";
  action: (input: { offerId: string; role: "ra" | "sa" }) => Promise<OfferSummary | null>;
  labels: AiStatusLabels & { cta: string; working: string; forOwner: string; forBuyer: string; keyTerms: string; caveats: string; nextStep: string; copy: string; copied: string };
}) {
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<OfferSummary | null>(null);
  const [err, setErr] = useState(false);
  async function run() {
    setBusy(true); setErr(false);
    try { setR(await action({ offerId, role })); } catch { setErr(true); } finally { setBusy(false); }
  }
  return (
    <div className="mt-2">
      <button type="button" onClick={run} disabled={busy} className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold hover:border-crimson hover:text-crimson disabled:opacity-50">{busy ? labels.working : `✦ ${labels.cta}`}</button>
      {err && <p className="mt-1 text-xs text-danger">{labels.reasons.failed}</p>}
      {r && (
        <div className="mt-2 space-y-2 rounded-lg border border-line bg-card p-3 text-xs">
          <AiStatus source={r.source} reason={r.reason} model={r.model} labels={labels} />
          <div><p className="font-semibold uppercase tracking-wide text-muted">{labels.forOwner}</p><p className="mt-0.5 whitespace-pre-line text-sm">{r.forOwner}</p><CopyButton text={r.forOwner} label={labels.copy} copiedLabel={labels.copied} className="mt-1" /></div>
          <div><p className="font-semibold uppercase tracking-wide text-muted">{labels.forBuyer}</p><p className="mt-0.5 whitespace-pre-line text-sm">{r.forBuyer}</p><CopyButton text={r.forBuyer} label={labels.copy} copiedLabel={labels.copied} className="mt-1" /></div>
          {r.keyTerms.length > 0 && <p><span className="font-semibold">{labels.keyTerms}:</span> {r.keyTerms.join(" · ")}</p>}
          {r.caveats.length > 0 && <p className="text-warning"><span className="font-semibold">{labels.caveats}:</span> {r.caveats.join(" · ")}</p>}
          <p><span className="font-semibold">{labels.nextStep}:</span> {r.nextStep}</p>
        </div>
      )}
    </div>
  );
}
