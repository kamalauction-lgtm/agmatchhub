"use client";

import { useState } from "react";
import type { TranslationResult } from "@/lib/ai/translate";
import { CompanionBadge, type Companion } from "@/components/ai/companion";

/**
 * Translation Assistant on the listing edit form: fills the English fields
 * (`title_en`, `description_en`) from the listing's own language. The agent
 * reviews and saves; nothing is written here.
 */
export function TranslateFields({ listingId, target, action, companion, labels }: {
  listingId: string;
  target: "en" | "id" | "ms";
  action: (listingId: string, target: "en" | "id" | "ms") => Promise<TranslationResult>;
  companion?: Companion;
  labels: { cta: string; working: string; done: string; notes: string; reasons: Record<string, string> };
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  async function run() {
    setBusy(true); setMsg(null);
    try {
      const r = await action(listingId, target);
      if (r.source === "ai") {
        const title = document.querySelector<HTMLInputElement>('input[name="titleEn"]');
        const desc = document.querySelector<HTMLTextAreaElement>('textarea[name="descriptionEn"]');
        if (title && r.fields.title) title.value = r.fields.title;
        if (desc && r.fields.description) desc.value = r.fields.description;
        setNotes(r.notes); setMsg(labels.done);
      } else setMsg(labels.reasons[r.reason] ?? labels.reasons.failed);
    } catch { setMsg(labels.reasons.failed); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <CompanionBadge c={companion} size="xs" />
      <button type="button" onClick={run} disabled={busy} className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold hover:border-crimson hover:text-crimson disabled:opacity-50">{busy ? labels.working : `✦ ${labels.cta}`}</button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
      {notes.length > 0 && <span className="text-[11px] text-muted">{labels.notes}: {notes.join(" · ")}</span>}
    </div>
  );
}
