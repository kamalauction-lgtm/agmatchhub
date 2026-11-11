import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { decideReport } from "./actions";

/**
 * Buyer reports on marketplace listings (D9, 00120): the flag queue on the
 * moderation screen (screen 9). RLS shows only reports on listings in the
 * moderator's countries. Reporters are anonymous; nothing identifying them is
 * read here. Acting on the listing itself is normal moderation, linked from
 * each card; closing the report records the outcome and is audited.
 */

type ReportRow = {
  id: string; reason_code: string; details: string | null; created_at: string; status: string; decided_at: string | null; decision_note: string | null;
  listings: { id: string; human_readable_id: string; title: string; slug: string; status: string } | null;
};

export const dynamic = "force-dynamic";

export default async function ListingReportsPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  await requireCapability("listing.moderate");
  const sp = await searchParams;
  const t = await getTranslations("adminListingReports");
  const supabase = await createClient();

  const [{ data: open }, { data: recent }] = await Promise.all([
    supabase.from("listing_reports")
      .select("id, reason_code, details, created_at, status, decided_at, decision_note, listings (id, human_readable_id, title, slug, status)")
      .eq("status", "open").order("created_at", { ascending: true }).limit(200),
    supabase.from("listing_reports")
      .select("id, reason_code, details, created_at, status, decided_at, decision_note, listings (id, human_readable_id, title, slug, status)")
      .neq("status", "open").order("decided_at", { ascending: false }).limit(20),
  ]);

  // One card per listing, oldest report first.
  const byListing = new Map<string, { listing: NonNullable<ReportRow["listings"]>; reports: ReportRow[] }>();
  for (const r of (open ?? []) as unknown as ReportRow[]) {
    if (!r.listings) continue;
    const g = byListing.get(r.listings.id) ?? { listing: r.listings, reports: [] };
    g.reports.push(r);
    byListing.set(r.listings.id, g);
  }
  const cards = [...byListing.values()].sort((a, b) => b.reports.length - a.reports.length);
  const reason = (c: string) => (t.has(`reasons.${c}` as never) ? t(`reasons.${c}` as never) : c);
  const day = (iso: string) => iso.slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/admin/listings" className="text-sm text-muted hover:text-foreground">← {t("back")}</Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-sm text-muted" data-open={cards.length}>{t("hint")}</p>

      {sp.done && (sp.done === "dismissed" || sp.done === "actioned") && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success" role="status">{t(`done.${sp.done}`)}</p>
      )}
      {sp.error && (
        <p className="mb-6 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">
          {t.has(`errors.${sp.error}` as never) ? t(`errors.${sp.error}` as never) : t("errors.failed")}
        </p>
      )}

      {!cards.length ? (
        <p className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="space-y-4">
          {cards.map(({ listing, reports }) => (
            <li key={listing.id} className="rounded-xl border border-line p-4" data-reported={listing.id} data-reports={reports.length}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="min-w-0 flex-1 font-semibold">{listing.title}<span className="ml-2 text-xs font-normal text-muted">{listing.human_readable_id}</span></p>
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">{t("count", { n: reports.length })}</span>
              </div>
              <p className="mt-1 text-xs">
                <Link href={`/admin/listings?status=${listing.status === "published" ? "published" : listing.status}`} className="font-medium text-crimson hover:underline">{t("openModeration")}</Link>
              </p>
              <ul className="mt-3 space-y-3">
                {reports.map((r) => (
                  <li key={r.id} className="rounded-lg bg-surface p-3 text-sm" data-report={r.id}>
                    <p><span className="font-medium">{reason(r.reason_code)}</span> <span className="text-xs text-muted">· {day(r.created_at)}</span></p>
                    {r.details && <p className="mt-1 whitespace-pre-line break-words text-muted">{r.details}</p>}
                    <form action={decideReport} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="reportId" value={r.id} />
                      <label className="sr-only" htmlFor={`note-${r.id}`}>{t("note")}</label>
                      <input id={`note-${r.id}`} name="note" maxLength={1000} placeholder={t("note")} className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-background px-3 text-sm" />
                      <button type="submit" name="outcome" value="actioned" className="min-h-10 cursor-pointer rounded-lg bg-crimson px-3 text-sm font-semibold text-white hover:bg-crimson-strong">{t("actioned")}</button>
                      <button type="submit" name="outcome" value="dismissed" className="min-h-10 cursor-pointer rounded-lg border border-line px-3 text-sm font-medium hover:border-crimson hover:text-crimson">{t("dismiss")}</button>
                    </form>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {(recent ?? []).length > 0 && (
        <section className="mt-10" aria-labelledby="recent-title">
          <h2 id="recent-title" className="text-lg font-semibold">{t("recent")}</h2>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line text-sm">
            {((recent ?? []) as unknown as ReportRow[]).map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-2 px-3 py-2" data-closed={r.id}>
                <span className="min-w-0 flex-1">{r.listings?.title ?? "—"} · {reason(r.reason_code)}</span>
                <span className="text-xs text-muted">{t(`status.${r.status}` as never)}{r.decided_at ? ` · ${day(r.decided_at)}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
