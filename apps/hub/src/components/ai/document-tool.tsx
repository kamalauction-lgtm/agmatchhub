"use client";

import { useState } from "react";
import type { DocumentSummary } from "@/lib/ai/documents";
import { AiStatus, type AiStatusLabels } from "@/components/ai/ai-status";
import { CopyButton } from "@/components/ui/copy-button";

export type DocumentLabels = AiStatusLabels & {
  upload: string; uploadHint: string; orPaste: string; pasteHint: string; run: string; working: string; kind: string; summary: string; parties: string; dates: string;
  amounts: string; obligations: string; verify: string; unreadable: string; copy: string; copied: string; transient: string; disclaimer: string;
  errors: Record<string, string>;
};

export function DocumentTool({ labels }: { labels: DocumentLabels }) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<DocumentSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null); setR(null);
    try {
      const fd = new FormData();
      if (file) fd.append("file", file);
      if (text.trim()) fd.append("text", text.trim());
      fd.append("name", file?.name ?? "pasted");
      const res = await fetch("/api/ai/document", { method: "POST", body: fd });
      if (!res.ok) { setErr("failed"); return; }
      setR((await res.json()) as DocumentSummary);
    } catch { setErr("failed"); } finally { setBusy(false); }
  }

  const plain = r && r.source === "ai"
    ? [`${labels.kind}: ${r.kind}`, "", r.summary, "", ...(r.keyDates.length ? [labels.dates + ":", ...r.keyDates.map((d) => `- ${d.label}: ${d.date}`), ""] : []), ...(r.amounts.length ? [labels.amounts + ":", ...r.amounts.map((a) => `- ${a.label}: ${a.amount}`), ""] : []), ...(r.obligations.length ? [labels.obligations + ":", ...r.obligations.map((o) => `- ${o}`), ""] : []), ...(r.verify.length ? [labels.verify + ":", ...r.verify.map((v) => `- ${v}`)] : [])].join("\n")
    : "";

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-4 rounded-xl border border-line bg-card p-4">
        <label className="block text-sm font-medium">{labels.upload}
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
          <span className="mt-1 block text-xs text-muted">{labels.uploadHint}</span>
        </label>
        <p className="text-center text-xs text-muted">{labels.orPaste}</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={labels.pasteHint} className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm" maxLength={60000} />
        <button type="button" onClick={run} disabled={busy || (!file && text.trim().length < 20)} className="w-full rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-50">
          {busy ? labels.working : `✦ ${labels.run}`}
        </button>
        <p className="text-[11px] text-muted">{labels.transient}</p>
        {err && <p className="text-xs text-danger">{labels.errors[err] ?? labels.reasons.failed}</p>}
      </div>

      <div className="space-y-4">
        {r && r.source === "rules" && (
          <p className="rounded-xl border border-line bg-card p-4 text-sm text-muted">{labels.errors[r.reason] ?? labels.reasons[r.reason] ?? labels.sourceRules}</p>
        )}
        {r && r.source === "ai" && (
          <div className="rounded-xl border border-line bg-card p-4">
            <AiStatus source="ai" model={r.model} labels={labels} className="mb-2" />
            {!r.readable && <p className="mb-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">{labels.unreadable}</p>}
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.kind}</p>
            <p className="text-sm font-semibold">{r.kind}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">{labels.summary}</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-6">{r.summary}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {r.parties.length > 0 && <Block title={labels.parties} items={r.parties} />}
              {r.keyDates.length > 0 && <Block title={labels.dates} items={r.keyDates.map((d) => `${d.label}: ${d.date}`)} />}
              {r.amounts.length > 0 && <Block title={labels.amounts} items={r.amounts.map((a) => `${a.label}: ${a.amount}`)} />}
              {r.obligations.length > 0 && <Block title={labels.obligations} items={r.obligations} />}
            </div>
            {r.verify.length > 0 && (
              <div className="mt-4 rounded-lg border border-warning/40 bg-warning/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-warning">{labels.verify}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{r.verify.map((v) => <li key={v}>{v}</li>)}</ul>
              </div>
            )}
            <p className="mt-4 text-[11px] text-muted">{labels.disclaimer}</p>
            <CopyButton text={plain} label={labels.copy} copiedLabel={labels.copied} className="mt-3" />
          </div>
        )}
        {!r && <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">✦</div>}
      </div>
    </div>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}
