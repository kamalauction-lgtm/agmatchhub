"use client";

import { useState } from "react";
import type { ObjectionAdvice, PracticeFeedback } from "@/lib/ai/coach";
import { AiStatus, type AiStatusLabels } from "@/components/ai/ai-status";
import { CopyButton } from "@/components/ui/copy-button";

export type CoachLabels = AiStatusLabels & {
  tabObjection: string; tabPractice: string; objection: string; objectionHint: string; context: string; contextHint: string; run: string; working: string;
  meaning: string; approaches: string; sampleReply: string; followUp: string; copy: string; copied: string;
  scenario: string; yourReply: string; replyHint: string; score: string; clarity: string; empathy: string; nextStep: string; feedback: string; improved: string; tryNext: string;
  heroHint: string; heroOpen: string; examples: string[];
};

export function CoachTool({ mode, scenarios, objectionAction, practiceAction, heroUrls, labels }: {
  mode: "objection" | "practice";
  scenarios: { key: string; client: string; context: string }[];
  objectionAction: (input: unknown) => Promise<ObjectionAdvice>;
  practiceAction: (input: unknown) => Promise<PracticeFeedback>;
  heroUrls: { objection: string | null; practice: string | null };
  labels: CoachLabels;
}) {
  const [tab, setTab] = useState<"objection" | "practice">(mode);
  const [text, setText] = useState("");
  const [context, setContext] = useState("");
  const [scenario, setScenario] = useState(scenarios[0]?.key ?? "");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [obj, setObj] = useState<ObjectionAdvice | null>(null);
  const [fb, setFb] = useState<PracticeFeedback | null>(null);
  const [err, setErr] = useState(false);
  const input = "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm";
  const sc = scenarios.find((s) => s.key === scenario);

  async function run() {
    setBusy(true); setErr(false);
    try {
      if (tab === "objection") setObj(await objectionAction({ text, context }));
      else setFb(await practiceAction({ scenarioKey: scenario, reply }));
    } catch { setErr(true); } finally { setBusy(false); }
  }
  const dots = (n: number) => "●".repeat(n) + "○".repeat(5 - n);
  const hero = tab === "objection" ? heroUrls.objection : heroUrls.practice;

  return (
    <div className="space-y-5">
      <div role="tablist" className="flex gap-1 rounded-lg bg-surface p-1 text-sm font-semibold">
        {(["objection", "practice"] as const).map((k) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 rounded-md px-3 py-2 ${tab === k ? "bg-card text-crimson shadow-card" : "text-muted hover:text-foreground"}`}>
            {k === "objection" ? labels.tabObjection : labels.tabPractice}
          </button>
        ))}
      </div>
      {hero && (
        <p className="rounded-lg border border-indigo/30 bg-indigo-soft px-4 py-2 text-xs text-indigo">
          {labels.heroHint} <a href={hero} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{labels.heroOpen} ↗</a>
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[24rem_1fr]">
        <div className="space-y-4 rounded-xl border border-line bg-card p-4">
          {tab === "objection" ? (
            <>
              <label className="block text-sm font-medium">{labels.objection}
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={labels.objectionHint} className={input} maxLength={1000} />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {labels.examples.map((ex) => (
                  <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted hover:border-crimson hover:text-crimson">{ex}</button>
                ))}
              </div>
              <label className="block text-sm font-medium">{labels.context}
                <input value={context} onChange={(e) => setContext(e.target.value)} placeholder={labels.contextHint} className={input} maxLength={600} />
              </label>
            </>
          ) : (
            <>
              <label className="block text-sm font-medium">{labels.scenario}
                <select value={scenario} onChange={(e) => { setScenario(e.target.value); setFb(null); }} className={input}>
                  {scenarios.map((s) => <option key={s.key} value={s.key}>{s.client}</option>)}
                </select>
              </label>
              {sc && <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">{sc.context}</p>}
              {sc && <p className="rounded-lg bg-indigo-soft px-3 py-2 text-sm italic">“{sc.client}”</p>}
              <label className="block text-sm font-medium">{labels.yourReply}
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={6} placeholder={labels.replyHint} className={input} maxLength={2000} />
              </label>
            </>
          )}
          <button type="button" onClick={run} disabled={busy || (tab === "objection" ? text.trim().length < 3 : reply.trim().length < 3)} className="w-full rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-50">
            {busy ? labels.working : `✦ ${labels.run}`}
          </button>
          {err && <p className="text-xs text-danger">{labels.reasons.failed}</p>}
        </div>

        <div className="space-y-4">
          {tab === "objection" && obj && (
            <div className="rounded-xl border border-line bg-card p-4">
              <AiStatus source={obj.source} reason={obj.reason} model={obj.model} labels={labels} className="mb-2" />
              {obj.meaning ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.meaning}</p>
                  <p className="mt-1 text-sm leading-6">{obj.meaning}</p>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{labels.approaches}</p>
                  <ol className="mt-2 space-y-2">
                    {obj.approaches.map((a, i) => (
                      <li key={i} className="rounded-lg bg-surface px-3 py-2 text-sm"><span className="font-semibold">{a.name}.</span> {a.how}</li>
                    ))}
                  </ol>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{labels.sampleReply}</p>
                  <p className="mt-1 whitespace-pre-line rounded-lg border border-line bg-background px-3 py-2 text-sm leading-6">{obj.sampleReply}</p>
                  <CopyButton text={obj.sampleReply} label={labels.copy} copiedLabel={labels.copied} className="mt-2" />
                  <p className="mt-4 text-sm"><span className="font-semibold">{labels.followUp}:</span> {obj.followUpQuestion}</p>
                </>
              ) : (
                <p className="text-sm text-muted">{labels.reasons[obj.reason ?? "failed"] ?? labels.sourceRules}</p>
              )}
            </div>
          )}
          {tab === "practice" && fb && (
            <div className="rounded-xl border border-line bg-card p-4">
              <AiStatus source={fb.source} reason={fb.reason} model={fb.model} labels={labels} className="mb-2" />
              {fb.scores && (
                <dl className="grid grid-cols-3 gap-3 text-center">
                  {([["clarity", fb.scores.clarity], ["empathy", fb.scores.empathy], ["next_step", fb.scores.next_step]] as const).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-surface p-3">
                      <dt className="text-xs text-muted">{k === "clarity" ? labels.clarity : k === "empathy" ? labels.empathy : labels.nextStep}</dt>
                      <dd className="mt-1 text-sm font-semibold tracking-widest text-indigo">{dots(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{labels.feedback}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{fb.feedback.map((x) => <li key={x}>{x}</li>)}</ul>
              {fb.improvedReply && (
                <>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{labels.improved}</p>
                  <p className="mt-1 whitespace-pre-line rounded-lg border border-line bg-background px-3 py-2 text-sm leading-6">{fb.improvedReply}</p>
                  <CopyButton text={fb.improvedReply} label={labels.copy} copiedLabel={labels.copied} className="mt-2" />
                </>
              )}
              {fb.tryNext && <p className="mt-4 text-sm"><span className="font-semibold">{labels.tryNext}:</span> “{fb.tryNext}”</p>}
            </div>
          )}
          {((tab === "objection" && !obj) || (tab === "practice" && !fb)) && <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">✦</div>}
        </div>
      </div>
    </div>
  );
}
