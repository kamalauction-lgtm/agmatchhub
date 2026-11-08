import Link from "next/link";
import { getTranslations, getFormatter } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCompanions } from "@/lib/ai/cast";
import { CompanionBadge } from "@/components/ai/companion";

/**
 * Listing Refresh Planner — which of the agent's listings expire or go stale
 * this week and what to do about each (00098 `my_refresh_plan`, rules only).
 * Renders nothing when there is nothing to do.
 */
type Row = { listing_id: string; human_readable_id: string; title: string; status: string; reason: string; due_at: string | null; photos: number; views_14d: number; inquiries_30d: number };

const HREF: Record<string, (id: string) => string> = {
  expiring: (id) => `/listings/${id}/edit`,
  no_photos: (id) => `/listings/${id}/edit`,
  reverify: (id) => `/listings/${id}/edit`,
  stale: (id) => `/studio/${id}`,
  old_draft: (id) => `/listings/${id}/edit`,
};

export async function RefreshPlanner() {
  const supabase = await createClient();
  const t = await getTranslations("aiTools.refresh");
  const format = await getFormatter();
  const { data } = await supabase.rpc("my_refresh_plan");
  const rows = (data ?? []) as Row[];
  if (!rows.length) return null;
  const { refresh_planner: c } = await getCompanions(["refresh_planner"]);

  return (
    <section className="mb-6 rounded-xl border border-line bg-card shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <CompanionBadge c={c} size="sm" />
          <div>
            <h2 className="text-sm font-semibold">{t("title")}</h2>
            <p className="text-xs text-muted">{t("hint", { count: rows.length })}</p>
          </div>
        </div>
      </header>
      <ul className="divide-y divide-line">
        {rows.slice(0, 8).map((r) => (
          <li key={r.listing_id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.title}</p>
              <p className="text-xs text-muted">
                <span className={`mr-2 rounded-full px-2 py-0.5 font-semibold ${r.reason === "expiring" ? "bg-danger/10 text-danger" : r.reason === "no_photos" ? "bg-warning/10 text-warning" : "bg-surface text-muted"}`}>{t(`reason.${r.reason}` as never)}</span>
                {r.due_at ? format.dateTime(new Date(r.due_at), { day: "numeric", month: "short" }) : null}
                {r.reason === "stale" ? ` · ${t("stats", { views: r.views_14d, inquiries: r.inquiries_30d })}` : ""}
              </p>
            </div>
            <Link href={(HREF[r.reason] ?? HREF.expiring)(r.listing_id)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-crimson hover:text-crimson">{t(`action.${r.reason}` as never)}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
