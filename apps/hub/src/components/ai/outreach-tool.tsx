"use client";

import { useState } from "react";
import type { OutreachDraft } from "@/lib/ai/outreach";
import { AiStatus, type AiStatusLabels } from "@/components/ai/ai-status";
import { CopyButton } from "@/components/ui/copy-button";

export type OutreachLabels = AiStatusLabels & {
  property: string; propertyHint: string; source: string; sourceHint: string; offer: string; offerHint: string; ownerName: string; channel: string;
  whatsapp: string; email: string; run: string; working: string; message: string; subject: string; followUp: string; tips: string; copy: string; copied: string;
  openWhatsapp: string; phone: string; phoneHint: string; notStored: string;
};

export function OutreachTool({ action, labels }: { action: (input: unknown) => Promise<OutreachDraft>; labels: OutreachLabels }) {
  const [f, setF] = useState({ property: "", source: "", offer: "", ownerName: "", channel: "whatsapp" as "whatsapp" | "email", phone: "" });
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<OutreachDraft | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState(false);
  const input = "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm";
  const label = "block text-sm font-medium";

  async function run() {
    setBusy(true); setErr(false);
    try {
      const d = await action({ property: f.property, source: f.source, offer: f.offer, ownerName: f.ownerName || null, channel: f.channel });
      setR(d); setText(d.message);
    } catch { setErr(true); } finally { setBusy(false); }
  }
  const wa = f.phone.replace(/[^\d]/g, "");

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-4 rounded-xl border border-line bg-card p-4">
        <label className={label}>{labels.property}
          <textarea value={f.property} onChange={(e) => setF({ ...f, property: e.target.value })} rows={3} placeholder={labels.propertyHint} className={input} maxLength={400} />
        </label>
        <label className={label}>{labels.source}
          <input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder={labels.sourceHint} className={input} maxLength={300} />
        </label>
        <label className={label}>{labels.offer}
          <textarea value={f.offer} onChange={(e) => setF({ ...f, offer: e.target.value })} rows={2} placeholder={labels.offerHint} className={input} maxLength={400} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>{labels.ownerName}
            <input value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} className={input} maxLength={80} />
          </label>
          <label className={label}>{labels.channel}
            <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value as "whatsapp" | "email" })} className={input}>
              <option value="whatsapp">{labels.whatsapp}</option><option value="email">{labels.email}</option>
            </select>
          </label>
        </div>
        <label className={label}>{labels.phone}
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder={labels.phoneHint} className={input} inputMode="tel" maxLength={20} />
        </label>
        <p className="text-[11px] text-muted">{labels.notStored}</p>
        <button type="button" onClick={run} disabled={busy || f.property.trim().length < 5} className="w-full rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-50">
          {busy ? labels.working : `✦ ${labels.run}`}
        </button>
        {err && <p className="text-xs text-danger">{labels.reasons.failed}</p>}
      </div>

      <div className="space-y-4">
        {r ? (
          <>
            <div className="rounded-xl border border-line bg-card p-4">
              <AiStatus source={r.source} reason={r.reason} model={r.model} labels={labels} className="mb-2" />
              {f.channel === "email" && r.subject && <p className="mb-2 text-sm"><span className="font-semibold">{labels.subject}:</span> {r.subject}</p>}
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.message}</p>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-6" />
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton text={text} label={labels.copy} copiedLabel={labels.copied} />
                {f.channel === "whatsapp" && wa && (
                  <a href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90">{labels.openWhatsapp}</a>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.followUp}</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-6">{r.followUp}</p>
              <CopyButton text={r.followUp} label={labels.copy} copiedLabel={labels.copied} className="mt-3" />
            </div>
            {r.tips.length > 0 && (
              <div className="rounded-xl border border-dashed border-line p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.tips}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">{r.tips.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">✦</div>
        )}
      </div>
    </div>
  );
}
