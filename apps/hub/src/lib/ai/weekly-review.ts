import "server-only";
import { z } from "zod";
import { sha256Hex, canonical } from "@pg/ai";
import { createClient } from "@/lib/supabase/server";
import { runAi, type DeniedReason } from "./engine";

/**
 * The Performance Reviewer: the agent's last seven days against the seven
 * before (own past first), then anonymised peer medians when at least five
 * peers in the same country were active. Numbers from `my_weekly_review()`;
 * the paragraph is cached per week in `ai_weekly_reviews` so a page reload
 * never spends a second AI task.
 */
export type WeeklyMetrics = {
  leads_this: number; leads_last: number; replied_this: number; replied_last: number;
  response_minutes_this: number | null; response_minutes_last: number | null;
  published_this: number; published_last: number; views_this: number; views_last: number;
  inquiries_this: number; inquiries_last: number;
  peers: number; peer_leads_median: number | null; peer_response_minutes_median: number | null; peer_published_median: number | null;
};

export type WeeklyReview = {
  weekStart: string;
  metrics: WeeklyMetrics;
  insight: string | null; win: string | null; action: string | null; tone: "encouraging" | "steady" | "nudge" | null;
  source: "ai" | "rules"; reason?: DeniedReason | "failed"; model?: string | null; fromCache: boolean;
};

const schema = z.object({
  insight: z.string().min(30).max(700),
  win: z.string().max(240),
  action: z.string().min(10).max(300),
  tone: z.enum(["encouraging", "steady", "nudge"]).default("steady"),
});

/** Monday of the current week in the agents' time zone. */
export function weekStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const d = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export async function getWeeklyReview(input: { userId: string; locale: string; firstName: string; force?: boolean }): Promise<WeeklyReview> {
  const supabase = await createClient();
  const week = weekStart();
  const { data: rows } = await supabase.rpc("my_weekly_review");
  const raw = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | undefined;
  const m = Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, v == null ? null : Number(v)])) as unknown as WeeklyMetrics;
  const hash = await sha256Hex(canonical({ w: week, l: input.locale, m }));

  if (!input.force) {
    const { data: cached } = await supabase.from("ai_weekly_reviews").select("source, paragraph, metrics, metrics_hash, model, reason").eq("user_id", input.userId).eq("week_start", week).maybeSingle();
    if (cached && cached.metrics_hash === hash) {
      const p = (cached.paragraph ? JSON.parse(cached.paragraph) : null) as { insight: string; win: string; action: string; tone: WeeklyReview["tone"] } | null;
      return { weekStart: week, metrics: m, insight: p?.insight ?? null, win: p?.win ?? null, action: p?.action ?? null, tone: p?.tone ?? null, source: cached.source as "ai" | "rules", model: cached.model, reason: (cached.reason as WeeklyReview["reason"]) ?? undefined, fromCache: true };
    }
  }

  const res = await runAi(
    "weekly_review",
    {
      agent_name: input.firstName || "there",
      metrics: {
        leads: { this_week: m.leads_this, last_week: m.leads_last },
        replies_sent: { this_week: m.replied_this, last_week: m.replied_last },
        median_first_response_minutes: { this_week: m.response_minutes_this, last_week: m.response_minutes_last },
        listings_published: { this_week: m.published_this, last_week: m.published_last },
        listing_views: { this_week: m.views_this, last_week: m.views_last },
        listing_enquiries: { this_week: m.inquiries_this, last_week: m.inquiries_last },
      },
      peers: m.peers >= 5 ? { active_peers: m.peers, leads_median: m.peer_leads_median, first_response_minutes_median: m.peer_response_minutes_median, listings_published_median: m.peer_published_median } : null,
    },
    schema,
    { userId: input.userId, locale: input.locale, refType: "weekly_review" },
  );

  if (res.ok) {
    const o = res.output;
    await supabase.rpc("ai_upsert_weekly_review", { p_user: input.userId, p_week: week, p_locale: input.locale, p_source: "ai", p_paragraph: JSON.stringify(o), p_metrics: m, p_hash: hash, p_model: `${res.provider}/${res.model}`, p_reason: null });
    return { weekStart: week, metrics: m, insight: o.insight, win: o.win || null, action: o.action, tone: o.tone, source: "ai", model: `${res.provider}/${res.model}`, fromCache: false };
  }
  const reason: WeeklyReview["reason"] = res.kind === "denied" ? res.reason : "failed";
  await supabase.rpc("ai_upsert_weekly_review", { p_user: input.userId, p_week: week, p_locale: input.locale, p_source: "rules", p_paragraph: null, p_metrics: m, p_hash: hash, p_model: null, p_reason: reason });
  return { weekStart: week, metrics: m, insight: null, win: null, action: null, tone: null, source: "rules", reason, fromCache: false };
}
