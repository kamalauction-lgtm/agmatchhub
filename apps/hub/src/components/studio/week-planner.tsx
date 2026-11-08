"use client";

import { useState } from "react";
import Link from "next/link";
import type { PlanSlot } from "@/lib/ai/social-plan-rules";
import type { PlannedWeek } from "@/lib/ai/social-plan";
import { AiStatus, type AiStatusLabels } from "@/components/ai/ai-status";
import { CopyButton } from "@/components/ui/copy-button";

export type PlannerLabels = AiStatusLabels & {
  weekStart: string; plan: string; working: string; empty: string; noAccounts: string; connect: string; keep: string; time: string;
  scheduleAll: string; scheduledHint: string; copy: string; copied: string; igNeedsImage: string; angle: Record<string, string>; weekdays: string[];
};

type Plan = PlannedWeek & { weekStart: string; images: Record<string, string | null> };

export function WeekPlanner({ planAction, scheduleAction, hasAccounts, defaultWeekStart, labels }: {
  planAction: (input: { weekStart: string; withAi: boolean }) => Promise<Plan>;
  scheduleAction: (fd: FormData) => void;
  hasAccounts: { facebook: boolean; instagram: boolean };
  defaultWeekStart: string;
  labels: PlannerLabels;
}) {
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [slots, setSlots] = useState<(PlanSlot & { keep: boolean; time: string })[]>([]);
  const [err, setErr] = useState(false);
  const tz = (() => { const m = -new Date().getTimezoneOffset(); const s = m >= 0 ? "+" : "-"; const a = Math.abs(m); return `${s}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`; })();

  async function run() {
    setBusy(true); setErr(false);
    try {
      const p = await planAction({ weekStart, withAi: true });
      setPlan(p);
      setSlots(p.slots.map((s) => ({ ...s, keep: true, time: "10:00" })));
    } catch { setErr(true); } finally { setBusy(false); }
  }
  const canSchedule = (s: PlanSlot) => (s.platform === "instagram" ? hasAccounts.instagram && !!plan?.images[s.listingId] : hasAccounts.facebook);
  const kept = slots.filter((s) => s.keep && canSchedule(s));
  const payload = JSON.stringify(kept.map((s) => ({ day: s.day, time: s.time, tz, platform: s.platform, listingId: s.listingId, caption: s.caption, imageUrl: plan?.images[s.listingId] ?? null })));
  const anyAccount = hasAccounts.facebook || hasAccounts.instagram;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-4">
        <label className="text-xs font-medium text-muted">{labels.weekStart}
          <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="mt-1 block rounded-lg border border-line bg-background px-3 py-2 text-sm" />
        </label>
        <button type="button" onClick={run} disabled={busy} className="rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-50">{busy ? labels.working : `✦ ${labels.plan}`}</button>
        {!anyAccount && <p className="text-xs text-muted">{labels.noAccounts} <Link href="/studio/accounts" className="font-semibold text-crimson hover:underline">{labels.connect}</Link></p>}
        {err && <p className="text-xs text-danger">{labels.reasons.failed}</p>}
      </div>

      {plan && !plan.slots.length && <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">{labels.empty}</p>}

      {plan && plan.slots.length > 0 && (
        <>
          <AiStatus source={plan.source} reason={plan.reason} model={plan.model} labels={labels} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {slots.map((s, i) => (
              <article key={`${s.day}-${s.platform}`} className={`rounded-xl border bg-card p-3 ${s.keep ? "border-line" : "border-dashed border-line opacity-60"}`}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold">{labels.weekdays[s.weekday]} · {s.day.slice(5)}</span>
                  <span className="rounded-full bg-surface px-2 py-0.5 font-semibold">{s.platform === "instagram" ? "📸 Instagram" : "📘 Facebook"}</span>
                </div>
                {plan.images[s.listingId] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={plan.images[s.listingId]!} alt="" className="mt-2 aspect-video w-full rounded-lg object-cover" />
                )}
                <p className="mt-2 truncate text-xs text-muted">{s.title}{s.angle ? ` · ${labels.angle[s.angle] ?? s.angle}` : ""}</p>
                <textarea value={s.caption} onChange={(e) => setSlots((p) => p.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} rows={6} className="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs leading-5" />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={s.keep} onChange={(e) => setSlots((p) => p.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} className="h-4 w-4" /> {labels.keep}</label>
                  <label className="flex items-center gap-1">{labels.time} <input type="time" value={s.time} onChange={(e) => setSlots((p) => p.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} className="rounded border border-line bg-background px-1 py-0.5" /></label>
                  <CopyButton text={s.caption} label={labels.copy} copiedLabel={labels.copied} className="ml-auto" />
                </div>
                {s.platform === "instagram" && !plan.images[s.listingId] && <p className="mt-1 text-[11px] text-warning">{labels.igNeedsImage}</p>}
              </article>
            ))}
          </div>
          {anyAccount && (
            <form action={scheduleAction} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
              <input type="hidden" name="slots" value={payload} />
              <button type="submit" disabled={!kept.length} className="rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-50">{labels.scheduleAll.replace("{count}", String(kept.length))}</button>
              <p className="text-xs text-muted">{labels.scheduledHint}</p>
            </form>
          )}
        </>
      )}
    </div>
  );
}
