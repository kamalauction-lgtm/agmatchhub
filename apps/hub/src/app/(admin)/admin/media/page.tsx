import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCapability, capabilityCountries } from "@/lib/authz";
import { photoStatus, type PhotoStatus } from "@/lib/listings/moderation";
import { agreementRef, rightsBasis, type RightsBasis } from "@/lib/media/rights";
import { MIN_BYTES, MIN_HEIGHT, MIN_WIDTH } from "@/lib/ai/photo-rules";
import { transformCap } from "@/lib/media/process";
import { quarantinePhoto } from "../listings/actions";
import { releasePhoto, retryPhoto } from "./actions";

/**
 * Photo Quality Centre (P1-a, storyboard screen 7).
 *
 * Every photo that goes through the processor — imported and partner-feed
 * photos in the private intake bucket — in the reviewer's countries, with its
 * real state: queued, processing, paused by the Images quota or the monthly
 * cap, failed (with the processor's reason), processed and awaiting the
 * listing's approval, live, or kept out; and its rights evidence.
 *
 * What runs here, honestly labelled: file-size and resolution RULES. No AI
 * model looks at these photos on this screen.
 *
 * Reads use the reviewer's session, so RLS (00105) limits them to listings in
 * their countries; previews are 10-minute signed links that the 00108 policy
 * grants only to moderators of the agent's country. The monthly usage figure
 * is read with the service client after the capability check: it is one
 * aggregate number, no photo or person in it.
 */

const VIEWS = ["attention", "processing", "awaiting", "kept_out", "all"] as const;
type View = (typeof VIEWS)[number];
const PAGE_SIZE = 30;
const FETCH_LIMIT = 300;

type Row = {
  id: string;
  listing_id: string;
  storage_path: string;
  derived_thumb_path: string | null;
  processed_path: string | null;
  thumbnail_path: string | null;
  processing_state: string;
  processing_error: string | null;
  processing_attempts: number | null;
  processing_next_at: string | null;
  width: number | null;
  height: number | null;
  byte_size: number | null;
  created_at: string;
  listings: {
    human_readable_id: string;
    title: string;
    status: string;
    properties: { country_code: string } | null;
    profiles: { display_name: string | null } | null;
  } | null;
  listing_media_source: { consent_record_id: string | null; licence_note: string | null }[] | { consent_record_id: string | null; licence_note: string | null } | null;
};

const ATTENTION: PhotoStatus[] = ["failed", "paused_quota", "paused_cap"];

export default async function PhotoQualityCentre({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string; listing?: string; done?: string; error?: string }>;
}) {
  await requireCapability("media.review");
  const sp = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as View) : "attention";
  const page = Math.max(1, Math.min(100, Number(sp.page) || 1));
  const listingFilter = sp.listing && /^[0-9a-f-]{36}$/.test(sp.listing) ? sp.listing : null;
  const t = await getTranslations("adminMedia");
  const tl = await getTranslations("adminListings");
  const supabase = await createClient();
  const scope = await capabilityCountries("media.review");

  let q = supabase
    .from("listing_media")
    .select(
      `id, listing_id, storage_path, derived_thumb_path, processed_path, thumbnail_path, processing_state, processing_error,
       processing_attempts, processing_next_at, width, height, byte_size, created_at,
       listings!inner (human_readable_id, title, status, properties!inner (country_code), profiles (display_name)),
       listing_media_source (consent_record_id, licence_note)`,
    )
    .like("storage_path", "listing-media-intake/%")
    .neq("processing_state", "removed")
    .order("created_at", { ascending: false })
    .limit(FETCH_LIMIT);
  if (scope) q = q.in("listings.properties.country_code", scope);
  if (listingFilter) q = q.eq("listing_id", listingFilter);
  if (view === "processing") q = q.in("processing_state", ["pending", "processing"]);
  if (view === "awaiting") q = q.eq("processing_state", "processed");
  if (view === "kept_out") q = q.eq("processing_state", "quarantined");
  const { data } = await q;

  const all = ((data ?? []) as unknown as Row[]).map((r) => {
    const prov = Array.isArray(r.listing_media_source) ? r.listing_media_source[0] ?? null : r.listing_media_source;
    const status = photoStatus(r);
    const basis: RightsBasis = rightsBasis(r.storage_path, prov);
    const rules: string[] = [];
    if (r.width && r.height && (r.width < MIN_WIDTH || r.height < MIN_HEIGHT)) rules.push("low_res");
    if (r.byte_size != null && r.byte_size > 0 && r.byte_size < MIN_BYTES) rules.push("tiny_file");
    return { ...r, prov, status, basis, rules };
  });
  const filtered = view === "attention"
    ? all.filter((r) => ATTENTION.includes(r.status) || r.basis === "missing")
    : view === "processing" ? all.filter((r) => r.status !== "paused_quota" && r.status !== "paused_cap")
    : all;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Previews: the clean 400 px derivative when there is one, otherwise the private original.
  const previews = new Map<string, string>();
  const toSign = rows.map((r) => ({ id: r.id, path: (r.derived_thumb_path ?? r.storage_path).replace(/^listing-media-intake\//, "") }));
  if (toSign.length) {
    const { data: signed } = await supabase.storage.from("listing-media-intake").createSignedUrls(toSign.map((x) => x.path), 600);
    (signed ?? []).forEach((s, i) => { if (s.signedUrl) previews.set(toSign[i].id, s.signedUrl); });
  }

  const { data: used } = await createServiceClient().rpc("media_processing_usage_now");
  const cap = transformCap();
  const usedN = Number(used ?? 0);

  const qs = (o: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v !== null && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
    const s = p.toString();
    return `/admin/media${s ? `?${s}` : ""}`;
  };
  const here = qs({ view, page, listing: listingFilter });
  const chip = "rounded-full px-2 py-0.5 text-[11px] font-semibold";
  const warn = (s: string) => ["failed", "paused_quota", "paused_cap", "kept_out"].includes(s);
  const btn = "cursor-pointer rounded-md border border-line px-2 py-1 text-xs font-medium hover:border-crimson hover:text-crimson";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">{t("intro")}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-4" data-usage={usedN} data-cap={cap}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("usage.title")}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{t("usage.value", { used: usedN, cap })}</p>
          <div className="mt-2 h-2 overflow-hidden rounded bg-surface" aria-hidden>
            <div className={`h-full ${usedN >= cap ? "bg-danger" : usedN >= cap * 0.8 ? "bg-warning" : "bg-success"}`} style={{ width: `${Math.min(100, (usedN / Math.max(cap, 1)) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">{t("usage.note")}</p>
        </div>
        <div className="rounded-xl border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("checks.title")}</p>
          <p className="mt-1 text-sm">{t("checks.rules", { w: MIN_WIDTH, h: MIN_HEIGHT, kb: Math.round(MIN_BYTES / 1000) })}</p>
          <p className="mt-1 text-xs text-muted">{t("checks.noAi")}</p>
        </div>
      </div>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label={t("views.label")}>
        {VIEWS.map((v) => (
          <Link key={v} href={qs({ view: v, listing: listingFilter })} aria-current={v === view ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${v === view ? "border-crimson bg-crimson-soft font-semibold text-crimson" : "border-line text-muted hover:text-foreground"}`}>
            {t(`views.${v}` as never)}
          </Link>
        ))}
        {listingFilter && <Link href={qs({ view })} className="rounded-full border border-line px-3 py-1.5 text-sm text-muted">{t("clearListing")} ✕</Link>}
      </nav>

      {sp.done && <p className="mt-4 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success" role="status">{t.has(`done.${sp.done}` as never) ? t(`done.${sp.done}` as never) : t("done.ok")}</p>}
      {sp.error && <p className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{t.has(`errors.${sp.error}` as never) ? t(`errors.${sp.error}` as never) : t("errors.update_failed")}</p>}

      <p className="mt-4 text-sm text-muted" data-count={filtered.length}>{t("count", { count: filtered.length })}</p>

      {!rows.length ? (
        <p className="mt-4 rounded-xl border border-line bg-surface p-10 text-center text-sm text-muted">{t(`empty.${view}` as never)}</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-line p-3" data-media={r.id} data-status={r.status} data-rights={r.basis}>
              <div className="aspect-[4/3] overflow-hidden rounded-lg bg-surface">
                {previews.has(r.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private photo
                  <img src={previews.get(r.id)} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-muted">{t("noPreview")}</div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`${chip} ${warn(r.status) ? "bg-warning/15 text-warning" : r.status === "live" ? "bg-success/15 text-success-ink" : "bg-surface text-muted"}`}>
                  {tl(`photoStatus.${r.status}` as never)}
                </span>
                <span className={`${chip} ${r.basis === "missing" ? "bg-danger/10 text-danger" : "bg-surface text-muted"}`}>
                  {t(`rights.${r.basis}` as never)}{r.basis === "partner_agreement" && agreementRef(r.prov) ? `: ${agreementRef(r.prov)}` : ""}
                </span>
                {r.rules.map((k) => <span key={k} className={`${chip} bg-surface text-muted`}>{t(`rule.${k}` as never)}</span>)}
              </div>
              <p className="mt-2 text-xs">
                <Link href={`/admin/listings?status=${r.listings?.status === "published" ? "published" : r.listings?.status === "rejected" ? "rejected" : "pending_review"}`} className="font-mono text-muted hover:underline">
                  {r.listings?.human_readable_id}
                </Link>{" "}· {r.listings?.properties?.country_code} · {r.listings?.profiles?.display_name ?? "—"}
              </p>
              <p className="line-clamp-1 text-xs text-muted">{r.listings?.title}</p>
              {r.status === "failed" && (
                <p className="mt-1 text-xs text-danger">{t("failedWhy", { n: r.processing_attempts ?? 0, why: (r.processing_error ?? "").slice(0, 120) })}</p>
              )}
              {(r.status === "paused_quota" || r.status === "paused_cap") && <p className="mt-1 text-xs text-warning">{t(`paused.${r.status}` as never)}</p>}
              {r.status === "queued" && (r.processing_attempts ?? 0) > 0 && r.processing_next_at && (
                <p className="mt-1 text-xs text-muted">{t("retryAt", { n: r.processing_attempts ?? 0, at: new Date(r.processing_next_at).toISOString().slice(0, 16).replace("T", " ") })}</p>
              )}
              {r.basis === "missing" && <p className="mt-1 text-xs text-danger">{t("rights.missingNote")}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {["pending", "processing", "processed", "failed"].includes(r.processing_state) && (
                  <form action={quarantinePhoto}>
                    <input type="hidden" name="mediaId" value={r.id} /><input type="hidden" name="back" value={here} />
                    <button className={btn}>{tl("photos.quarantine")}</button>
                  </form>
                )}
                {r.processing_state === "quarantined" && (
                  <form action={releasePhoto}>
                    <input type="hidden" name="mediaId" value={r.id} /><input type="hidden" name="back" value={here} />
                    <button className={btn}>{t("release")}</button>
                  </form>
                )}
                {(r.status === "failed" || r.status === "paused_quota" || r.status === "paused_cap") && (
                  <form action={retryPhoto}>
                    <input type="hidden" name="mediaId" value={r.id} /><input type="hidden" name="back" value={here} />
                    <button className={btn}>{t("retry")}</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-between text-sm" aria-label={tl("pager.label")}>
          {page > 1 ? <Link className="text-crimson hover:underline" href={qs({ view, page: page - 1, listing: listingFilter })}>← {tl("pager.prev")}</Link> : <span />}
          <span className="text-muted">{tl("pager.of", { page, pages })}</span>
          {page < pages ? <Link className="text-crimson hover:underline" href={qs({ view, page: page + 1, listing: listingFilter })}>{tl("pager.next")} →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
