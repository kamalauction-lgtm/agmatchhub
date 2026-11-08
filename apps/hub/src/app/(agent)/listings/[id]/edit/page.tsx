import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { QualityCard } from "@/components/listings/quality-card";
import { updateListing } from "./actions";

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
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("listings");
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("listings")
    .select(
      `id, human_readable_id, title, description, price, currency, listing_type,
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
      {listing.status === "published" && (
        <p className="mb-6 rounded-lg bg-surface px-4 py-3 text-sm text-muted">
          {t("edit.willReturnToReview")}
        </p>
      )}

      {/* The score and its fixes sit above the form they are about. */}
      <QualityCard listingId={listing.id} />

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
