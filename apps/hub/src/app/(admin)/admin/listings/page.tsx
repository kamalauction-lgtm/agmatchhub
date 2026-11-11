import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, capabilityCountries } from "@/lib/authz";
import { money } from "@/lib/listings/format";
import { unitSuffix } from "@/lib/listings/vocabulary";
import { REJECTION_CODES, photoStatus, summarisePhotos, type PhotoRow } from "@/lib/listings/moderation";
import { rightsBasis, type ProvenanceFacts } from "@/lib/media/rights";
import { moderateBulk, moderateListing, quarantinePhoto } from "./actions";
import { requestChange } from "../handover/actions";

/**
 * Marketplace listing moderation (§28 step 7; P1-a, storyboard screen 9).
 *
 * Every field the moderator sees is what the public would see, plus the agent
 * identity, which moderation legitimately needs, plus what the moderator must
 * know before approving: the quality score, and every photo's real state —
 * processing, failed, paused by the quota or the monthly cap, kept out, or
 * missing rights evidence — and so what will and will not become public.
 *
 * Reads run with the moderator's session: RLS (00105) and the country scope
 * below show only listings in their countries.
 */

const PAGE_SIZE = 20;
const TABS = ["pending_review", "rejected", "published"] as const;
type Tab = (typeof TABS)[number];

function publicMediaUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/${path}` : null;
}

type MediaRow = PhotoRow & {
  processed_path: string | null;
  derived_thumb_path: string | null;
  is_cover: boolean;
  position: number;
};

type QueueRow = {
  id: string;
  human_readable_id: string;
  title: string;
  description: string | null;
  listing_type: string;
  price: number;
  currency: string;
  rent_period: string | null;
  status: string;
  created_at: string;
  moderation_reason: string | null;
  moderation_reason_code: string | null;
  properties: {
    country_code: string;
    property_type: string;
    ownership_type: string | null;
    general_address: string | null;
    regency_name: string | null;
    province_name: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    building_size: number | null;
    land_size: number | null;
    measurement_unit: string | null;
  } | null;
  profiles: { display_name: string; agent_status: string } | null;
  listing_media: MediaRow[];
};

export default async function ListingModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string; status?: string; page?: string; ok?: string; skipped?: string; why?: string }>;
}) {
  await requireCapability("listing.moderate");
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.status ?? "") ? (sp.status as Tab) : "pending_review";
  const page = Math.max(1, Math.min(500, Number(sp.page) || 1));
  const supabase = await createClient();
  const t = await getTranslations("adminListings");
  const tpt = await getTranslations("propertyTypes");

  const scope = await capabilityCountries("listing.moderate");
  let query = supabase
    .from("listings")
    .select(
      `id, human_readable_id, title, description, listing_type, price, currency,
       rent_period, status, created_at, moderation_reason, moderation_reason_code,
       properties!inner (country_code, property_type, ownership_type, general_address, regency_name,
                   province_name, bedrooms, bathrooms, building_size, land_size, measurement_unit),
       profiles (display_name, agent_status),
       listing_media (id, storage_path, processed_path, derived_thumb_path, processing_state, processing_error,
                      processing_attempts, is_cover, position)`,
      { count: "exact" },
    )
    .eq("status", tab)
    .order(tab === "pending_review" ? "created_at" : "moderated_at", { ascending: tab === "pending_review" })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (scope) query = query.in("properties.country_code", scope);
  const { data, count } = await query;

  // Photos the agent removed (00112) are kept as evidence but are not part of the listing.
  const rows = ((data ?? []) as unknown as QueueRow[]).map((r) => ({
    ...r,
    listing_media: r.listing_media.filter((m) => m.processing_state !== "removed").sort((a, b) => a.position - b.position),
  }));
  const ids = rows.map((r) => r.id);
  const mediaIds = rows.flatMap((r) => r.listing_media.map((m) => m.id));

  // Quality (00083) and rights evidence (provenance), both RLS-scoped to the moderator's countries.
  const [{ data: quality }, { data: prov }] = await Promise.all([
    ids.length
      ? supabase.from("listing_quality_scores").select("listing_id, total_score, completeness, photo_quality, recommendations").in("listing_id", ids)
      : Promise.resolve({ data: [] as { listing_id: string; total_score: number; completeness: number; photo_quality: number; recommendations: unknown }[] }),
    mediaIds.length
      ? supabase.from("listing_media_source").select("media_id, consent_record_id, licence_note").in("media_id", mediaIds)
      : Promise.resolve({ data: [] as { media_id: string; consent_record_id: string | null; licence_note: string | null }[] }),
  ]);
  const qualityOf = new Map((quality ?? []).map((q) => [q.listing_id, q]));
  // P1-b: open change requests per listing (00115, RLS-scoped).
  const { data: openReqs } = ids.length
    ? await supabase.from("listing_change_requests").select("listing_id, status").in("listing_id", ids).in("status", ["open", "answered"])
    : { data: [] as { listing_id: string; status: string }[] };
  const reqCount = new Map<string, { open: number; answered: number }>();
  for (const r of openReqs ?? []) {
    const c = reqCount.get(r.listing_id) ?? { open: 0, answered: 0 };
    if (r.status === "answered") c.answered++; else c.open++;
    reqCount.set(r.listing_id, c);
  }
  const provOf = new Map<string, ProvenanceFacts>((prov ?? []).map((p) => [p.media_id, p]));

  // Processed imported photos are private until approval (00109): preview them
  // through short-lived signed links, which the 00108 policy grants only to
  // moderators of the listing's country.
  const previews = new Map<string, string>();
  const toSign = rows.flatMap((r) => r.listing_media)
    .filter((m) => m.processing_state === "processed" && m.derived_thumb_path)
    .map((m) => ({ id: m.id, path: m.derived_thumb_path!.replace(/^listing-media-intake\//, "") }));
  if (toSign.length) {
    const { data: signed } = await supabase.storage.from("listing-media-intake").createSignedUrls(toSign.map((x) => x.path), 600);
    (signed ?? []).forEach((s, i) => { if (s.signedUrl) previews.set(toSign[i].id, s.signedUrl); });
  }

  const total = count ?? rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const here = `/admin/listings?status=${tab}${page > 1 ? `&page=${page}` : ""}`;
  const codeLabel = (c: string | null) => (c && (REJECTION_CODES as readonly string[]).includes(c) ? t(`codes.${c}` as never) : null);
  const select = "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm";
  const chip = "rounded-full px-2 py-0.5 text-[11px] font-semibold";
  const doneText =
    sp.done === "bulk"
      ? t("bulk.done", { ok: Number(sp.ok) || 0, skipped: Number(sp.skipped) || 0 })
      : sp.done === "approve" ? t("approved") : sp.done === "quarantined" ? t("quarantined") : sp.done === "reject" ? t("rejected") : sp.done === "change_requested" ? t("changes.sent") : null;
  const why = (sp.why ?? "").split(",").filter(Boolean).map((x) => x.split(":")).filter(([k]) => t.has(`errors.${k}` as never));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">{t("title")}</h1>
      <nav className="mb-4 mt-3 flex flex-wrap gap-2" aria-label={t("tabs.label")}>
        {TABS.map((s) => (
          <Link key={s} href={`/admin/listings?status=${s}`} aria-current={s === tab ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${s === tab ? "border-crimson bg-crimson-soft font-semibold text-crimson" : "border-line text-muted hover:text-foreground"}`}>
            {t(`tabs.${s}` as never)}
          </Link>
        ))}
      </nav>
      <p className="mb-6 text-sm text-muted" data-total={total}>{tab === "pending_review" ? t("count.pending_review", { count: total }) : tab === "rejected" ? t("count.rejected", { count: total }) : t("count.published", { count: total })}</p>

      {doneText && (
        <div className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success" role="status">
          <p>{doneText}</p>
          {why.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs font-normal text-foreground">
              {why.map(([k, n]) => <li key={k}>{n} × {t(`errors.${k}` as never)}</li>)}
            </ul>
          )}
        </div>
      )}
      {sp.error && (
        <p className="mb-6 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">
          {t.has(`errors.${sp.error}` as never) ? t(`errors.${sp.error}` as never) : t("errors.update_failed")}
        </p>
      )}

      {rows.length > 0 && tab !== "rejected" && (
        <form id="bulk" action={moderateBulk} className="mb-6 rounded-xl border border-line bg-surface p-4" aria-labelledby="bulk-title">
          <p id="bulk-title" className="text-sm font-semibold">{t("bulk.title")}</p>
          <p className="mt-0.5 text-xs text-muted">{t("bulk.hint")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-xs font-semibold">{t("reasonCode")}
              <select name="reasonCode" className={select} defaultValue="">
                <option value="">—</option>
                {REJECTION_CODES.map((c) => <option key={c} value={c}>{t(`codes.${c}` as never)}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold">{t("note")}
              <input name="reason" maxLength={1000} className={select} placeholder={t("reasonPlaceholder")} />
            </label>
            <div className="flex gap-2">
              {tab === "pending_review" && (
                <button type="submit" name="decision" value="approve" className="rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">{t("bulk.approve")}</button>
              )}
              <button type="submit" name="decision" value="reject" className="rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">{t("bulk.reject")}</button>
            </div>
          </div>
        </form>
      )}

      {!rows.length ? (
        <p className="rounded-xl border border-line bg-surface p-10 text-center text-sm text-muted">{t(`emptyTab.${tab}` as never)}</p>
      ) : (
        <div className="space-y-6">
          {rows.map((l) => {
            const p = l.properties;
            const cover = [...l.listing_media].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.position - b.position)[0];
            const coverUrl = cover?.processing_state === "ready" ? publicMediaUrl(cover.processed_path) : cover ? previews.get(cover.id) ?? null : null;
            const summary = summarisePhotos(l.listing_media, provOf);
            const q = qualityOf.get(l.id);
            const unit = unitSuffix(p?.measurement_unit === "sqft" ? "sqft" : "sqm");
            const size = p?.building_size ?? p?.land_size;
            const recs = Array.isArray(q?.recommendations) ? (q!.recommendations as { key?: string }[]).map((r) => r.key).filter(Boolean) as string[] : [];

            return (
              <article key={l.id} className="overflow-hidden rounded-xl border border-line" data-listing={l.id}>
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
                  <div className="flex min-w-0 items-start gap-3 sm:block">
                    {tab !== "rejected" && (
                      <input type="checkbox" form="bulk" name="listingIds" value={l.id} aria-label={t("bulk.select", { id: l.human_readable_id })}
                        className="mt-1 h-5 w-5 accent-crimson sm:mb-2" />
                    )}
                    <div className="relative h-40 min-w-0 flex-1 overflow-hidden rounded-lg bg-surface sm:w-56 sm:flex-none">
                      {coverUrl ? (
                        <Image src={coverUrl} alt={l.title} fill unoptimized className="object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-xs text-muted">{t("noPhoto")}</div>
                      )}
                      <span className="absolute left-2 top-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold">{summary.total} 📷</span>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-muted">{l.human_readable_id} · {p?.country_code}</p>
                    <h2 className="mt-1 font-semibold">{l.title}</h2>
                    <p className="mt-1 text-sm text-muted">{[p?.general_address, p?.regency_name, p?.province_name].filter(Boolean).join(", ") || "—"}</p>
                    <p className="mt-2 text-lg font-bold text-crimson">{money(l.currency, Number(l.price), l.rent_period)}</p>
                    <p className="mt-1 text-xs text-muted">
                      {p?.property_type ? (tpt.has(p.property_type as never) ? tpt(p.property_type as never) : p.property_type) : "—"} · {p?.bedrooms ?? "—"} 🛏 · {p?.bathrooms ?? "—"} 🚿 · {size != null ? `${size} ${unit}` : "—"}
                    </p>
                    {l.description && <p className="mt-2 line-clamp-3 text-sm">{l.description}</p>}
                    <p className="mt-2 text-xs text-muted">
                      {t("byAgent")}: <strong>{l.profiles?.display_name ?? "—"}</strong>{l.profiles?.agent_status === "verified" && " ✓"}
                    </p>

                    {/* What the moderator needs before deciding. */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5" data-quality={q?.total_score ?? ""}>
                      <span className={`${chip} ${q && q.total_score >= 70 ? "bg-success/15 text-success-ink" : q && q.total_score >= 45 ? "bg-warning/15 text-warning" : "bg-danger/10 text-danger"}`}>
                        {t("quality.score", { score: q?.total_score ?? 0 })}
                      </span>
                      {q && <span className={`${chip} bg-surface text-muted`}>{t("quality.parts", { complete: q.completeness, photos: q.photo_quality })}</span>}
                      {recs.slice(0, 3).map((k) => (
                        <span key={k} className={`${chip} bg-surface text-muted`}>{t.has(`quality.rec.${k}` as never) ? t(`quality.rec.${k}` as never) : k}</span>
                      ))}
                    </div>
                    {summary.total > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5" data-photo-summary>
                        {Object.entries(summary.byStatus).map(([s, n]) => (
                          <span key={s} data-status={s}
                            className={`${chip} ${["failed", "paused_quota", "paused_cap", "kept_out"].includes(s) ? "bg-warning/15 text-warning" : "bg-surface text-muted"}`}>
                            {n} × {t(`photoStatus.${s}` as never)}
                          </span>
                        ))}
                        {summary.rightsMissing > 0 && (
                          <span className={`${chip} bg-danger/10 text-danger`} data-rights-missing={summary.rightsMissing}>
                            {t("rights.missing", { n: summary.rightsMissing })}
                          </span>
                        )}
                      </div>
                    )}
                    {tab === "pending_review" && summary.total > 0 && (
                      <p className="mt-1 text-xs text-muted" data-will-publish={summary.willPublish}>
                        {t("photos.willPublish", { publish: summary.willPublish, total: summary.total })}
                      </p>
                    )}
                    {reqCount.has(l.id) && (
                      <p className="mt-2 text-xs" data-change-requests={reqCount.get(l.id)!.open + reqCount.get(l.id)!.answered}>
                        <Link href="/admin/handover" className="font-medium text-crimson hover:underline">
                          {t("changes.count", { open: reqCount.get(l.id)!.open, answered: reqCount.get(l.id)!.answered })}
                        </Link>
                      </p>
                    )}
                    {tab !== "pending_review" && l.moderation_reason_code && (
                      <p className="mt-2 rounded-lg bg-danger/5 px-3 py-2 text-xs">
                        <strong>{codeLabel(l.moderation_reason_code)}</strong>{l.moderation_reason ? ` — ${l.moderation_reason}` : ""}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-line bg-surface p-4">
                  {l.listing_media.some((m) => m.processing_state !== "ready") && (
                    <div>
                      <p className="mb-2 text-xs font-semibold text-muted">{t("photos.title")}</p>
                      <ul className="flex flex-wrap gap-3">
                        {l.listing_media.filter((m) => m.processing_state !== "ready").map((m) => {
                          const st = photoStatus(m);
                          const basis = rightsBasis(m.storage_path, provOf.get(m.id));
                          return (
                            <li key={m.id} className="w-28 text-xs" data-media={m.id} data-status={st} data-rights={basis}>
                              {previews.has(m.id) ? (
                                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                                <img src={previews.get(m.id)} alt="" className="h-20 w-28 rounded object-cover" />
                              ) : (
                                <div className="flex h-20 w-28 items-center justify-center rounded bg-background p-1 text-center text-muted">{t(`photoStatus.${st}` as never)}</div>
                              )}
                              {basis === "missing" && <p className="mt-0.5 font-semibold text-danger">{t("rights.missingOne")}</p>}
                              {["pending", "processing", "processed", "failed"].includes(m.processing_state) && (
                                <form action={quarantinePhoto} className="mt-1">
                                  <input type="hidden" name="mediaId" value={m.id} />
                                  <input type="hidden" name="back" value={here} />
                                  <button type="submit" className="cursor-pointer text-xs text-muted underline hover:text-danger">{t("photos.quarantine")}</button>
                                </form>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-1 text-xs text-muted">{t("photos.note")}</p>
                      <Link href={`/admin/media?listing=${l.id}`} className="mt-1 inline-block text-xs font-medium text-crimson hover:underline">{t("photos.openCentre")}</Link>
                    </div>
                  )}
                  <details className="rounded-lg border border-line bg-background p-3" data-request-change={l.id}>
                    <summary className="cursor-pointer text-sm font-medium">{t("changes.request")}</summary>
                    <form action={requestChange} className="mt-3 grid gap-2 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
                      <input type="hidden" name="listingId" value={l.id} />
                      <input type="hidden" name="back" value={here} />
                      <label className="text-xs font-semibold">{t("changes.kind")}
                        <select name="kind" className={select} defaultValue="correction">
                          <option value="correction">{t("changes.kinds.correction")}</option>
                          <option value="photo_original">{t("changes.kinds.photo_original")}</option>
                        </select>
                      </label>
                      <label className="text-xs font-semibold">{t("changes.field")}
                        <select name="field" className={select} defaultValue="">
                          <option value="">—</option>
                          {["title", "description", "price", "location", "property_details", "photos", "other"].map((f) => <option key={f} value={f}>{t(`changes.fields.${f}` as never)}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-semibold">{t("changes.message")}
                        <input name="body" required minLength={3} maxLength={2000} className={select} placeholder={t("changes.placeholder")} />
                      </label>
                      <button type="submit" className="rounded-lg border border-crimson px-4 py-2.5 text-sm font-semibold text-crimson hover:bg-crimson-soft">{t("changes.send")}</button>
                    </form>
                  </details>
                  {tab !== "rejected" && (
                    <form action={moderateListing} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <input type="hidden" name="listingId" value={l.id} />
                      <input type="hidden" name="back" value={here} />
                      <label className="text-xs font-semibold" htmlFor={`c-${l.id}`}>{t("reasonCode")}
                        <select id={`c-${l.id}`} name="reasonCode" className={select} defaultValue="">
                          <option value="">—</option>
                          {REJECTION_CODES.map((c) => <option key={c} value={c}>{t(`codes.${c}` as never)}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-semibold" htmlFor={`r-${l.id}`}>{t("note")}
                        <input id={`r-${l.id}`} name="reason" maxLength={1000} placeholder={t("reasonPlaceholder")} className={select} />
                      </label>
                      <div className="flex gap-2">
                        {tab === "pending_review" && (
                          <button type="submit" name="decision" value="approve" className="rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">{t("approve")}</button>
                        )}
                        <button type="submit" name="decision" value="reject" className="rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
                          {tab === "published" ? t("takeDown") : t("reject")}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-between text-sm" aria-label={t("pager.label")}>
          {page > 1 ? <Link className="text-crimson hover:underline" href={`/admin/listings?status=${tab}&page=${page - 1}`}>← {t("pager.prev")}</Link> : <span />}
          <span className="text-muted">{t("pager.of", { page, pages })}</span>
          {page < pages ? <Link className="text-crimson hover:underline" href={`/admin/listings?status=${tab}&page=${page + 1}`}>{t("pager.next")} →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
