import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { ImportReview } from "@/components/import/import-review";
import { bulkItemStatus, handoverBatch } from "../actions";
import { itemChanges, itemQuality } from "@/lib/import/quality";

/**
 * One prepared batch (P0-d-1). The admin fetches, fixes and skips items with
 * the agent's own review screen — given no declaration, it shows no import
 * button, because committing is the agent's act (00107). Hand-over tells the
 * agent the batch is waiting for them.
 */

export const dynamic = "force-dynamic";

const REVIEW_LABEL_KEYS = [
  "reviewTitle", "reviewSubtitle", "process", "processAll", "processing",
  "selectAll", "importReady", "importedNotice", "openExisting", "importAnyway",
  "skip", "unskip", "save", "edit", "cancel", "sourceLink", "noItems", "refetch",
  "authorityHeading", "authorityConfirm", "fieldTitle", "fieldPrice",
  "fieldPropertyType", "fieldListingType", "fieldBedrooms", "fieldBathrooms",
  "fieldBuildingSize", "fieldDescription", "imported", "missing",
  "duplicateWarning", "photosNote", "forSale", "forRent",
] as const;

const ITEM_ERROR_CODES = [
  "invalid_url", "unsupported_scheme", "blocked_host", "private_address",
  "too_many_redirects", "too_large", "timeout", "unsupported_content",
  "blocked_by_site", "not_found", "no_listing_data", "unavailable",
  "fetch_failed", "import_failed",
] as const;

export default async function AdminImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ error?: string; done?: string; n?: string }>;
}) {
  await requireCapability("listing.import_assisted");
  const { batchId } = await params;
  const { error, done, n } = await searchParams;
  const t = await getTranslations("adminImports");
  const ti = await getTranslations("listingImport");
  const supabase = await createClient();

  // RLS: only batches of agents in the admin's countries are visible at all.
  const { data: batch } = await supabase
    .from("import_batches")
    .select("id, agent_id, acting_admin_id, source_portal, source_label, status, error, handed_over_at, imported_count, profiles(display_name)")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) notFound();
  const { data: canWrite } = await supabase.rpc("admin_can_import_batch", { p_batch: batchId });

  const { data: items } = await supabase
    .from("import_items")
    .select("id, source_url, status, extracted, overrides, warnings, error, listing_id, duplicate_of_listing_id, media_state, media_saved, media_total")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });

  const agent = (Array.isArray(batch.profiles) ? batch.profiles[0] : batch.profiles) as { display_name: string | null } | null;
  const rows = items ?? [];
  // P1-a: committed items show the listing's own database quality score (00083).
  const listingIds = rows.map((r) => r.listing_id).filter(Boolean) as string[];
  const { data: lq } = listingIds.length
    ? await supabase.from("listing_quality_scores").select("listing_id, total_score").in("listing_id", listingIds)
    : { data: [] as { listing_id: string; total_score: number }[] };
  const listingScore = new Map((lq ?? []).map((q) => [q.listing_id, q.total_score]));
  const review = rows.map((r) => ({
    ...r,
    quality: itemQuality({ extracted: r.extracted as Record<string, unknown>, overrides: r.overrides as Record<string, unknown> }),
    changes: itemChanges({ extracted: r.extracted as Record<string, unknown>, overrides: r.overrides as Record<string, unknown> }),
    title: String(((r.overrides as Record<string, unknown>)?.title ?? (r.extracted as Record<string, unknown>)?.title ?? "") || r.source_url),
  }));
  const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "string" ? (v.length > 60 ? v.slice(0, 57) + "…" : v) : String(v));
  const ready = rows.filter((r) => r.status === "ready").length;
  const labels = Object.fromEntries(REVIEW_LABEL_KEYS.map((k) => [k, ti(k)]));
  const errorLabels = Object.fromEntries(
    ITEM_ERROR_CODES.filter((c) => ti.has(`errors.${c}`)).map((c) => [c, ti(`errors.${c}`)]),
  );

  return (
    <>
      <Link href="/admin/imports" className="text-sm text-muted hover:text-foreground">← {t("title")}</Link>
      <h1 className="mt-2 text-2xl font-semibold">{t("batchTitle", { agent: agent?.display_name ?? batch.agent_id.slice(0, 8) })}</h1>
      <p className="mb-4 mt-1 text-sm text-muted">{batch.source_portal} · {batch.source_label}</p>

      <p className="mb-6 max-w-2xl rounded-lg bg-surface px-4 py-3 text-sm text-muted">{t("agentCommits")}</p>

      {done?.startsWith("bulk_") && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success" role="status">{t("review.bulkDone", { n: Number(n) || 0 })}</p>
      )}
      {done === "handed_over" && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">{t("handedOver")}</p>
      )}
      {(error || batch.error) && (
        <p className="mb-6 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as never)
            : ti.has(`errors.${error ?? batch.error}`) ? ti(`errors.${error ?? batch.error}` as never)
            : batch.error ?? t("errors.failed")}
        </p>
      )}

      {canWrite && batch.acting_admin_id && batch.imported_count === 0 && (
        <form action={handoverBatch} className="mb-6 flex flex-wrap items-center gap-3">
          <input type="hidden" name="batchId" value={batch.id} />
          <button
            type="submit"
            disabled={ready === 0}
            className="min-h-11 cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white hover:bg-crimson-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {batch.handed_over_at ? t("handOverAgain", { n: ready }) : t("handOver", { n: ready })}
          </button>
          {ready === 0 && <span className="text-xs text-muted">{t("nothingReady")}</span>}
        </form>
      )}

      {rows.length > 0 && (
        <section className="mb-8" aria-labelledby="review-title">
          <h2 id="review-title" className="text-lg font-semibold">{t("review.title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("review.hint")}</p>
          <form id="bulk-items" action={bulkItemStatus} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="batchId" value={batch.id} />
            {canWrite && (
              <>
                <button type="submit" name="status" value="skipped" className="min-h-10 cursor-pointer rounded-lg border border-line px-3 text-sm font-medium hover:border-crimson hover:text-crimson">{t("review.skipSelected")}</button>
                <button type="submit" name="status" value="restore" className="min-h-10 cursor-pointer rounded-lg border border-line px-3 text-sm font-medium hover:border-crimson hover:text-crimson">{t("review.restoreSelected")}</button>
              </>
            )}
          </form>
          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2"><span className="sr-only">{t("review.select")}</span></th>
                  <th className="px-3 py-2">{t("review.item")}</th>
                  <th className="px-3 py-2">{t("review.status")}</th>
                  <th className="px-3 py-2">{t("review.quality")}</th>
                  <th className="px-3 py-2">{t("review.photos")}</th>
                  <th className="px-3 py-2">{t("review.changes")}</th>
                </tr>
              </thead>
              <tbody>
                {review.map((r) => {
                  const score = r.listing_id && listingScore.has(r.listing_id) ? listingScore.get(r.listing_id)! : null;
                  return (
                    <tr key={r.id} className="border-t border-line align-top" data-item={r.id} data-status={r.status} data-quality={score ?? r.quality.score}>
                      <td className="px-3 py-2">
                        {canWrite && r.status !== "imported" && (
                          <input type="checkbox" form="bulk-items" name="itemIds" value={r.id} aria-label={t("review.selectOne", { title: r.title })} className="h-4 w-4 accent-crimson" />
                        )}
                      </td>
                      <td className="max-w-[16rem] px-3 py-2"><p className="line-clamp-2">{r.title}</p></td>
                      <td className="px-3 py-2 text-xs">{t.has(`review.itemStatus.${r.status}` as never) ? t(`review.itemStatus.${r.status}` as never) : r.status}</td>
                      <td className="px-3 py-2 text-xs">
                        {score !== null ? (
                          <span title={t("review.listingScore")}>{t("review.scoreListing", { score })}</span>
                        ) : (
                          <>
                            <span>{t("review.scoreItem", { score: r.quality.score })}</span>
                            {r.quality.missing.length > 0 && (
                              <span className="block text-muted">{t("review.missing")}: {r.quality.missing.map((f) => t(`review.field.${f}` as never)).join(", ")}</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.media_state && r.media_state !== "none" && (r.media_total ?? 0) > 0 ? t("review.photosState", { saved: r.media_saved ?? 0, total: r.media_total ?? 0 }) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.changes.length === 0 ? <span className="text-muted">{t("review.noChanges")}</span> : (
                          <ul className="space-y-0.5">
                            {r.changes.map((c) => (
                              <li key={c.field}><strong>{ti.has(`field${c.field[0].toUpperCase()}${c.field.slice(1)}` as never) ? ti(`field${c.field[0].toUpperCase()}${c.field.slice(1)}` as never) : c.field}</strong>: <s className="text-muted">{fmt(c.from)}</s> → {fmt(c.to)}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!rows.length ? (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">{ti("noItems")}</p>
      ) : (
        <ImportReview
          batchId={batch.id}
          items={rows.map((r) => ({
            id: r.id,
            sourceUrl: r.source_url,
            status: r.status,
            extracted: (r.extracted ?? {}) as Record<string, unknown>,
            overrides: (r.overrides ?? {}) as Record<string, unknown>,
            warnings: r.warnings ?? [],
            error: r.error,
            listingId: r.listing_id,
            duplicateOfListingId: r.duplicate_of_listing_id,
          }))}
          declaration={null}
          labels={labels}
          errorLabels={errorLabels}
        />
      )}
    </>
  );
}
