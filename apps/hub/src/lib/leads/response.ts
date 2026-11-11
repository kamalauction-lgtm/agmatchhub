/**
 * Lead response-time arithmetic (screen 10). Pure: no imports, so the
 * /admin/leads page and the unit tests share exactly the same rules.
 *
 *   answered on time  first_responded_at ≤ first_response_due
 *   on-time rate      on time ÷ leads whose due time has passed or that were
 *                     answered (a lead still inside its window is not yet
 *                     late or on time, so it is left out)
 *   median            minutes from created_at to first_responded_at, answered leads
 *   overdue now       unanswered and past its due time
 */

export type LeadTiming = {
  agent_id: string;
  created_at: string;
  first_response_due: string | null;
  first_responded_at: string | null;
};

export type ResponseStats = {
  total: number;
  responded: number;
  onTimeRate: number | null;
  medianMinutes: number | null;
  overdueNow: number;
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function statsOf(rows: LeadTiming[], now: string): ResponseStats {
  let onTime = 0, decided = 0, overdueNow = 0;
  const minutes: number[] = [];
  for (const r of rows) {
    if (r.first_responded_at) {
      minutes.push(Math.max(0, (Date.parse(r.first_responded_at) - Date.parse(r.created_at)) / 60_000));
      decided++;
      if (!r.first_response_due || r.first_responded_at <= r.first_response_due) onTime++;
    } else if (r.first_response_due && r.first_response_due < now) {
      decided++;
      overdueNow++;
    }
  }
  return {
    total: rows.length,
    responded: minutes.length,
    onTimeRate: decided ? onTime / decided : null,
    medianMinutes: median(minutes),
    overdueNow,
  };
}

/** Overall and per-agent stats; agents sorted by overdue, then by lead count. */
export function leadResponseStats(rows: LeadTiming[], now: string): ResponseStats & { byAgent: (ResponseStats & { agentId: string })[] } {
  const groups = new Map<string, LeadTiming[]>();
  for (const r of rows) groups.set(r.agent_id, [...(groups.get(r.agent_id) ?? []), r]);
  const byAgent = [...groups.entries()]
    .map(([agentId, rs]) => ({ agentId, ...statsOf(rs, now) }))
    .sort((a, b) => b.overdueNow - a.overdueNow || b.total - a.total);
  return { ...statsOf(rows, now), byAgent };
}
