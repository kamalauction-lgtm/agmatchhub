import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { QualityCard } from "@/components/listings/quality-card";
import { updateListing } from "./actions";
import { PhotoCheckPanel } from "@/components/listings/photo-check-panel";
import { TranslateFields } from "@/components/listings/translate-fields";
import { checkPhotosAction, translateListingAction } from "@/app/(agent)/listings/ai-actions";
import { checkListingPhotos } from "@/lib/ai/photo-check";
import { getCompanions } from "@/lib/ai/cast";
import { AI_REASON_KEYS } from "@/components/ai/ai-status";
import { getLocale } from "next-intl/server";
import { getGallery } from "@/lib/listings/gallery";
import { GalleryEditor } from "@/components/listings/gallery-editor";
import { answerChange, uploadRequestPhoto } from "./change-actions";

/**
 * Edit a listing.
 *
 * There was no way to change a listing after creating it — the wizard could
 * only ever make new ones. That is fine until a price moves or a description
 * needs fixing, which for imported stock is immediately.
 *
 * A plain form rather than the seven-step wizard: the wizard exists to walk
 * somebody through a decision they have not made yet. Editing is the opposite —
 * you know exactly which field is wrong and want to reach it in one screen.
 */

export const dynamic = "force-dynamic";

export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; gallery?: string; changes?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error, gallery: galleryNotice, changes: changesNotice } = await searchParams;
  const t = await getTranslations("listings");
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("listings")
    .select(
      `id, human_readable_id, title, description, title_en, description_en, language, price, currency, listing_type,
       rent_period, status,
       properties (id, bedrooms, bathrooms, building_size, land_size,
                   property_type, regency_name, province_name)`
    )
    .eq("id", id)
    .eq("agent_id", user.id)   // RLS also enforces this; being explicit is cheap
    .maybeSingle();

  if (!listing) notFound();

  const p = (Array.isArray(listing.properties) ? listing.properties[0] : listing.properties) as {
    bedrooms: number | null; bathrooms: number | null;
    building_size: number | null; land_size: number | null;
    property_type: string; regency_name: string | null; province_name: string | null;
  } | null;

  // Photo Checker (00098): the rules' findings now, the model on request.
  const locale = await getLocale();
  const [photoCheck, cast, tp, tx, tr] = await Promise.all([
    checkListingPhotos({ listingId: listing.id, userId: user.id, locale, withAi: false }),
    getCompanions(["photo_checker", "translation_assistant"]),
    getTranslations("aiTools.photos"),
    getTranslations("aiTools.translate"),
    getTranslations("aiTools"),
  ]);
  // P0-e-3a: the gallery editor (cover, order, remove), rules in 00112.
  const [gallery, tg] = await Promise.all([getGallery(supabase, listing.id), getTranslations("listings.edit.gallery")]);
  const [{ data: changeReqs }, tc] = await Promise.all([
    supabase.from("listing_change_requests").select("id, kind, field, body, status, answer").eq("listing_id", listing.id).in("status", ["open", "answered"]).order("opened_at"),
    getTranslations("listings.changes"),
  ]);
  const GALLERY_NOTICES = ["cover_set", "moved", "removed", "not_eligible", "not_public_yet", "bad_order", "not_found", "failed"];
  const aiReasons = Object.fromEntries(AI_REASON_KEYS.map((k) => [k, tr(`reason.${k}`)]));
  // The EN fields are the "other language" for id/ms listings; an EN listing translates into its market's language.
  const translateTarget = listing.language === "en" ? "id" : "en";

  const field =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";
  const label = "block text-xs font-semibold";

  return (
    <AgentShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("edit.title")}</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono text-xs">{listing.human_readable_id}</span>
            {p?.regency_name ? ` · ${p.regency_name}, ${p.province_name}` : ""}
          </p>
        </div>
        <Link
          href="/listings"
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-crimson hover:text-crimson"
        >
          {t("edit.back")}
        </Link>
      </div>

      {error && (
        <p className="mb-6 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {t(`edit.errors.${error}`)}
        </p>
      )}

      {/* Editing something already public sends it back for review, so say so
          before they start typing rather than after they press save. */}
      {(listing.status === "published" || listing.status === "rejected") && (
        <p className="mb-6 rounded-lg bg-surface px-4 py-3 text-sm text-muted">
          {t("edit.willReturnToReview")}
        </p>
      )}

      {/* The score and its fixes sit above the form they are about. */}
      <QualityCard listingId={listing.id} />
      <PhotoCheckPanel
        listingId={listing.id}
        initial={photoCheck}
        action={checkPhotosAction}
        companion={cast.photo_checker}
        labels={{
          sourceAi: tr.raw("sourceAi") as string, sourceRules: tr("sourceRules"), reasons: aiReasons,
          title: tp("title"), hint: tp("hint"), check: tp("check"), working: tp("working"), noPhotos: tp("noPhotos"), tooFew: tp("tooFew"), noCover: tp("noCover"),
          allGood: tp("allGood"), bestCover: tp.raw("bestCover") as string, duplicateOf: tp.raw("duplicateOf") as string, summary: tp("summary"),
          rule: { low_res: tp("rule.low_res"), tiny_file: tp("rule.tiny_file"), duplicate: tp("rule.duplicate") },
          issue: Object.fromEntries(["blur", "dark", "face", "plate", "document", "watermark", "not_property", "other"].map((k) => [k, tp(`issue.${k}` as never)])),
        }}
      />

      {/* P1-b: what moderation asked the agent to change (00115). */}
      {(changeReqs ?? []).length > 0 && (
        <section id="changes" className="mb-8 rounded-xl border border-warning/40 bg-warning/5 p-4" aria-labelledby="changes-title">
          <h2 id="changes-title" className="text-lg font-semibold">{tc("title")}</h2>
          <p className="mt-1 text-sm text-muted">{tc("hint")}</p>
          {changesNotice && <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-sm" role="status">{tc.has(`notice.${changesNotice}` as never) ? tc(`notice.${changesNotice}` as never) : tc("notice.failed")}</p>}
          <ul className="mt-3 space-y-3">
            {(changeReqs ?? []).map((r) => (
              <li key={r.id} className="rounded-lg border border-line bg-background p-3" data-request={r.id} data-status={r.status}>
                <p className="text-xs font-semibold text-muted">{tc(`kind.${r.kind}` as never)}{r.field ? ` · ${tc(`field.${r.field}` as never)}` : ""} · {tc(`status.${r.status}` as never)}</p>
                <p className="mt-1 text-sm">{r.body}</p>
                {r.answer && <p className="mt-2 rounded bg-surface px-2 py-1 text-sm"><strong className="text-xs text-muted">{tc("yourAnswer")}:</strong> {r.answer}</p>}
                <form action={answerChange} className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="listingId" value={listing.id} />
                  <input type="hidden" name="requestId" value={r.id} />
                  <input name="answer" required maxLength={2000} placeholder={tc("placeholder")} className="min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-2 text-sm" />
                  <button className="rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong">{r.answer ? tc("update") : tc("send")}</button>
                </form>
                {r.kind === "photo_original" && (
                  // P1-b-2 (owner decision): the photo goes private, through the processor, and is published by moderation.
                  <form action={uploadRequestPhoto} className="mt-3 rounded-lg border border-dashed border-line p-3" data-photo-upload={r.id}>
                    <input type="hidden" name="listingId" value={listing.id} />
                    <input type="hidden" name="requestId" value={r.id} />
                    <label className="block text-xs font-semibold" htmlFor={`ph-${r.id}`}>{tc("photo.label")}</label>
                    <input id={`ph-${r.id}`} type="file" name="photo" required accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm" />
                    <input name="answer" maxLength={2000} placeholder={tc("photo.note")} className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm" />
                    <p className="mt-1 text-xs text-muted">{tc("photo.hint")}</p>
                    <button className="mt-2 rounded-lg border border-crimson px-4 py-2 text-sm font-semibold text-crimson hover:bg-crimson-soft">{tc("photo.send")}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <GalleryEditor
        listingId={listing.id}
        items={gallery}
        published={listing.status === "published"}
        labels={{
          title: tg("title"), hint: tg("hint"), empty: tg("empty"), cover: tg("cover"), makeCover: tg("makeCover"),
          moveUp: tg("moveUp"), moveDown: tg("moveDown"), remove: tg("remove"), removeImportedNote: tg("removeImportedNote"),
          state: Object.fromEntries(["pending", "processing", "processed", "ready", "failed", "quarantined"].map((k) => [k, tg(`state.${k}` as never)])),
          notice: galleryNotice && GALLERY_NOTICES.includes(galleryNotice) ? tg(`notice.${galleryNotice}` as never) : undefined,
        }}
      />

      <form action={updateListing} className="space-y-5">
        <input type="hidden" name="listingId" value={listing.id} />

        <label className={label}>
          {t("edit.listingTitle")}
          <input name="title" required minLength={8} maxLength={140}
                 defaultValue={listing.title} className={field} />
        </label>

        <label className={label}>
          {t("edit.description")}
          <textarea name="description" required minLength={20} maxLength={4000} rows={8}
                    defaultValue={listing.description ?? ""} className={field} />
        </label>

        <fieldset className="rounded-xl border border-line p-4">
          <legend className="px-1 text-xs font-semibold text-muted">{tx("fieldsTitle", { lang: tx(`lang.${translateTarget}` as never) })}</legend>
          <div className="mb-3">
            <TranslateFields
              listingId={listing.id}
              target={translateTarget}
              action={translateListingAction}
              companion={cast.translation_assistant}
              labels={{ cta: tx("cta", { lang: tx(`lang.${translateTarget}` as never) }), working: tx("working"), done: tx("done"), notes: tx("notes"), reasons: aiReasons }}
            />
          </div>
          <label className={label}>
            {tx("titleField")}
            <input name="titleEn" maxLength={140} defaultValue={listing.title_en ?? ""} className={field} />
          </label>
          <label className={`${label} mt-4`}>
            {tx("descriptionField")}
            <textarea name="descriptionEn" maxLength={4000} rows={6} defaultValue={listing.description_en ?? ""} className={field} />
          </label>
          <p className="mt-2 text-[11px] text-muted">{tx("hint")}</p>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-3">
          <label className={label}>
            {t("edit.listingType")}
            <select name="listingType" defaultValue={listing.listing_type} className={field}>
              <option value="sale">{t("edit.forSale")}</option>
              <option value="rent">{t("edit.forRent")}</option>
            </select>
          </label>
          <label className={label}>
            {t("edit.price", { currency: listing.currency })}
            <input name="price" type="number" required min={1} step="1"
                   defaultValue={Number(listing.price)} className={field} />
          </label>
          <label className={label}>
            {t("edit.rentPeriod")}
            <select name="rentPeriod" defaultValue={listing.rent_period ?? ""} className={field}>
              <option value="">{t("edit.notApplicable")}</option>
              <option value="monthly">{t("edit.monthly")}</option>
              <option value="yearly">{t("edit.yearly")}</option>
            </select>
          </label>
        </div>

        <fieldset className="rounded-xl border border-line p-4">
          <legend className="px-1 text-xs font-semibold text-muted">{t("edit.propertyFacts")}</legend>
          <div className="grid gap-5 sm:grid-cols-4">
            <label className={label}>
              {t("edit.bedrooms")}
              <input name="bedrooms" type="number" min={0} max={50}
                     defaultValue={p?.bedrooms ?? ""} className={field} />
            </label>
            <label className={label}>
              {t("edit.bathrooms")}
              <input name="bathrooms" type="number" min={0} max={50}
                     defaultValue={p?.bathrooms ?? ""} className={field} />
            </label>
            <label className={label}>
              {t("edit.buildingSize")}
              <input name="buildingSize" type="number" min={0} step="0.01"
                     defaultValue={p?.building_size ?? ""} className={field} />
            </label>
            <label className={label}>
              {t("edit.landSize")}
              <input name="landSize" type="number" min={0} step="0.01"
                     defaultValue={p?.land_size ?? ""} className={field} />
            </label>
          </div>
        </fieldset>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-crimson px-5 py-3 text-sm font-semibold text-white hover:bg-crimson-strong"
          >
            {t("edit.save")}
          </button>
          <Link
            href="/listings"
            className="rounded-lg border border-line px-5 py-3 text-sm font-semibold hover:border-crimson hover:text-crimson"
          >
            {t("edit.cancel")}
          </Link>
        </div>
      </form>
    </AgentShell>
  );
}
