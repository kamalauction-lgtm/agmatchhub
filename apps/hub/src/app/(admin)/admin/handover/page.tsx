import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, capabilityCountries } from "@/lib/authz";
import { closeChange } from "./actions";

/**
 * Handover (P1-b, storyboard screen 14).
 *
 *   · Change requests — what moderators asked agents to correct or supply,
 *     the agent's answer, and Resolve / Withdraw (00115 functions).
 *   · Prepared batches — assisted imports handed to agents (P0-d-1), and how
 *     far each agent has got: items still waiting, imported, skipped.
 *
 * Read with the admin's session: RLS limits both to the admin's countries.
 * The batch section shows only to admins who hold listing.import_assisted.
 */

type Req = {
  id: string; listing_id: string; kind: string; field: string | null; body: string; status: string;
  opened_at: string; answer: string | null; answered_at: string | null;
  listings: { human_readable_id: string; title: string; status: string; profiles: { display_name: string | null } | null } | null;
};

/** Ages are computed with the data, not during render (React purity rule). */
function withAges<T extends Record<string, unknown>>(rows: T[], key: keyof T): (T & { ageDays: number })[] {
  const now = Date.now();
  return rows.map((r) => ({ ...r, ageDays: Math.max(0, Math.floor((now - new Date(String(r[key])).getTime()) / 86_400_000)) }));
}

export default async function HandoverPage({ searchParams }: { searchParams: Promise<{ view?: string; done?: string; error?: string }> }) {
  await requireCapability("listing.moderate");
  const sp = await searchParams;
  const view = sp.view === "closed" ? "closed" : "open";
  const t = await getTranslations("adminHandover");
  const supabase = await createClient();
  const importScope = await capabilityCountries("listing.import_assisted");
  const canSeeBatches = importScope === null || importScope.length > 0;

  const { data: reqs } = await supabase
    .from("listing_change_requests")
    .select("id, listing_id, kind, field, body, status, opened_at, answer, answered_at, listings (human_readable_id, title, status, profiles (display_name))")
    .in("status", view === "open" ? ["open", "answered"] : ["resolved", "withdrawn"])
    .order(view === "open" ? "opened_at" : "closed_at", { ascending: view === "open" })
    .limit(100);
  const rows = withAges((reqs ?? []) as unknown as Req[], "opened_at");

  const { data: batchRows } = canSeeBatches
    ? await supabase
        .from("import_batches")
        .select("id, source_label, handed_over_at, imported_count, profiles (display_name), import_items (status)")
        .not("acting_admin_id", "is", null)
        .not("handed_over_at", "is", null)
        .order("handed_over_at", { ascending: false })
        .limit(50)
    : { data: [] };
  const batches = withAges((batchRows ?? []) as unknown as (Record<string, unknown> & { id: string; source_label: string | null; handed_over_at: string; profiles: unknown })[], "handed_over_at");

  const here = `/admin/handover${view === "closed" ? "?view=closed" : ""}`;
  const chip = "rounded-full px-2 py-0.5 text-[11px] font-semibold";
  const btn = "cursor-pointer rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:border-crimson hover:text-crimson";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">{t("intro")}</p>

      {sp.done && <p className="mt-4 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success" role="status">{t.has(`done.${sp.done}` as never) ? t(`done.${sp.done}` as never) : t("done.ok")}</p>}
      {sp.error && <p className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{t.has(`errors.${sp.error}` as never) ? t(`errors.${sp.error}` as never) : t("errors.update_failed")}</p>}

      <section className="mt-6" aria-labelledby="req-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="req-title" className="text-lg font-semibold">{t("requests.title")}</h2>
          <nav className="flex gap-2" aria-label={t("requests.title")}>
            {(["open", "closed"] as const).map((v) => (
              <Link key={v} href={v === "open" ? "/admin/handover" : "/admin/handover?view=closed"} aria-current={v === view ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm ${v === view ? "border-crimson bg-crimson-soft font-semibold text-crimson" : "border-line text-muted hover:text-foreground"}`}>
                {t(`requests.view.${v}` as never)}
              </Link>
            ))}
          </nav>
        </div>
        {!rows.length ? (
          <p className="mt-3 rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">{t(`requests.empty.${view}` as never)}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-line p-4" data-request={r.id} data-status={r.status}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`${chip} ${r.status === "answered" ? "bg-success/15 text-success-ink" : r.status === "open" ? "bg-warning/15 text-warning" : "bg-surface text-muted"}`}>{t(`status.${r.status}` as never)}</span>
                  <span className={`${chip} bg-surface text-muted`}>{t(`kind.${r.kind}` as never)}{r.field ? ` · ${t(`field.${r.field}` as never)}` : ""}</span>
                  <span className="font-mono text-xs text-muted">{r.listings?.human_readable_id}</span>
                  <span className="text-xs text-muted">· {r.listings?.profiles?.display_name ?? "—"} · {t("age", { days: r.ageDays })}</span>
                </div>
                <p className="mt-1 text-sm font-medium">{r.listings?.title}</p>
                <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-sm"><strong className="text-xs text-muted">{t("asked")}:</strong> {r.body}</p>
                {r.answer && <p className="mt-2 rounded-lg bg-success/5 px-3 py-2 text-sm"><strong className="text-xs text-muted">{t("answered")}:</strong> {r.answer}</p>}
                {view === "open" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={closeChange}>
                      <input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="outcome" value="resolved" /><input type="hidden" name="back" value={here} />
                      <button className={btn}>{t("resolve")}</button>
                    </form>
                    <form action={closeChange}>
                      <input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="outcome" value="withdrawn" /><input type="hidden" name="back" value={here} />
                      <button className={btn}>{t("withdraw")}</button>
                    </form>
                    <Link href={`/admin/listings?status=${r.listings?.status === "published" ? "published" : r.listings?.status === "rejected" ? "rejected" : "pending_review"}`} className="self-center text-xs font-medium text-crimson hover:underline">{t("openListing")}</Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canSeeBatches && (
        <section className="mt-10" aria-labelledby="batch-title">
          <h2 id="batch-title" className="text-lg font-semibold">{t("batches.title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("batches.hint")}</p>
          {!(batches ?? []).length ? (
            <p className="mt-3 rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">{t("batches.empty")}</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-surface text-left text-xs text-muted">
                  <tr><th className="px-3 py-2">{t("batches.agent")}</th><th className="px-3 py-2">{t("batches.handedOver")}</th><th className="px-3 py-2">{t("batches.progress")}</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody>
                  {(batches ?? []).map((b) => {
                    const items = ((b as { import_items?: { status: string }[] }).import_items ?? []);
                    const waiting = items.filter((i) => ["ready", "found", "needs_review"].includes(i.status)).length;
                    const imported = items.filter((i) => i.status === "imported").length;
                    const skipped = items.filter((i) => i.status === "skipped").length;
                    const agent = (Array.isArray(b.profiles) ? b.profiles[0] : b.profiles) as { display_name: string | null } | null;
                    return (
                      <tr key={b.id} className="border-t border-line" data-batch={b.id} data-waiting={waiting}>
                        <td className="px-3 py-2">{agent?.display_name ?? "—"}<span className="block text-xs text-muted">{b.source_label}</span></td>
                        <td className="px-3 py-2 text-xs">{t("age", { days: b.ageDays })}</td>
                        <td className="px-3 py-2 text-xs">
                          {waiting === 0 && items.length > 0
                            ? <span className={`${chip} bg-success/15 text-success-ink`}>{t("batches.done")}</span>
                            : t("batches.counts", { waiting, imported, skipped })}
                        </td>
                        <td className="px-3 py-2 text-right"><Link href={`/admin/imports/${b.id}`} className="text-xs font-medium text-crimson hover:underline">{t("batches.open")}</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
