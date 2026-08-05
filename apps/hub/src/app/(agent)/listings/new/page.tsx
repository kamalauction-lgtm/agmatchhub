import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { FormDraftGuard } from "@/components/forms/draft-guard";
import { createListing } from "../actions";

const PROPERTY_TYPES = [
  "rumah", "apartemen", "ruko", "rukan", "kondominium", "villa", "kost",
  "gudang", "pabrik", "kantor", "toko", "hotel", "tanah", "kavling", "lainnya",
] as const;

const OWNERSHIP = ["shm", "hgb", "hgu", "hp", "hbg", "girik", "strata", "ppjb", "adat", "lainnya"] as const;

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; field?: string }>;
}) {
  await requireUser();
  const { error, field } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("listings.form");
  const tt = await getTranslations("propertyTypes");
  const to = await getTranslations("ownershipTypes");

  // Province + regency only (~550 options). With the full BPS hierarchy
  // seeded, districts would put 7,700 rows in one select — kecamatan
  // precision arrives with a proper search-as-you-type picker later.
  const { data: locations } = await supabase
    .from("locations")
    .select("id, name, level, path_names")
    .eq("country_code", "ID")
    .eq("is_active", true)
    .in("level", ["province", "regency"])
    .order("path_names")
    .limit(600);

  const input =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm";
  const label = "text-xs font-semibold uppercase tracking-wide text-muted";

  return (
    <AgentShell>
      <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-sm text-muted">{t("intro")}</p>

      {error && (
        <p className="mb-6 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">
          {t(`errors.${error}` as never)}
          {field ? ` (${field})` : ""}
        </p>
      )}

      <form action={createListing} className="space-y-6">
        <FormDraftGuard storageKey="pg_listing_draft" notice={t("draftRestored")} />

        <fieldset className="space-y-4 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold">{t("sectionBasics")}</legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="lt">{t("listingType")} *</label>
              <select id="lt" name="listingType" required className={input}>
                <option value="sale">{t("sale")}</option>
                <option value="rent">{t("rent")}</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="rp">{t("rentPeriod")}</label>
              <select id="rp" name="rentPeriod" className={input}>
                <option value="">—</option>
                <option value="monthly">{t("monthly")}</option>
                <option value="yearly">{t("yearly")}</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="pc">{t("category")} *</label>
              <select id="pc" name="propertyCategory" required className={input}>
                <option value="residential">{t("catResidential")}</option>
                <option value="commercial">{t("catCommercial")}</option>
                <option value="industrial">{t("catIndustrial")}</option>
                <option value="land">{t("catLand")}</option>
                <option value="other">{t("catOther")}</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="pt">{t("propertyType")} *</label>
              <select id="pt" name="propertyType" required className={input}>
                {PROPERTY_TYPES.map((p) => (
                  <option key={p} value={p}>{tt(p)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={label} htmlFor="ti">{t("adTitle")} *</label>
            <input id="ti" name="title" required minLength={10} maxLength={150}
              placeholder={t("adTitlePlaceholder")} className={input} />
          </div>

          <div>
            <label className={label} htmlFor="de">{t("description")}</label>
            <textarea id="de" name="description" rows={5} maxLength={5000} className={input} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="pr">{t("price")} *</label>
              <input id="pr" name="price" type="number" required min={1} step="any"
                placeholder="2150000000" className={input} />
              <p className="mt-1 text-xs text-muted">{t("priceHelp")}</p>
            </div>
            <div>
              <label className={label} htmlFor="ow">{t("certificate")}</label>
              <select id="ow" name="ownershipType" className={input}>
                <option value="">—</option>
                {OWNERSHIP.map((o) => (
                  <option key={o} value={o}>{to(o)}</option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold">{t("sectionLocation")}</legend>

          <div>
            <label className={label} htmlFor="lo">{t("area")}</label>
            <select id="lo" name="locationId" className={input}>
              <option value="">—</option>
              {(locations ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {[...(l.path_names ?? [])].join(" › ") || l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="ga">{t("generalAddress")}</label>
              <input id="ga" name="generalAddress" maxLength={200}
                placeholder={t("generalAddressPlaceholder")} className={input} />
              <p className="mt-1 text-xs text-muted">{t("generalAddressHelp")}</p>
            </div>
            <div>
              <label className={label} htmlFor="bn">{t("buildingName")}</label>
              <input id="bn" name="buildingName" maxLength={120} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="po">{t("postalCode")}</label>
              <input id="po" name="postalCode" maxLength={10} className={input} />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold">{t("sectionSpecs")}</legend>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className={label} htmlFor="ls">{t("landSize")}</label>
              <input id="ls" name="landSize" type="number" min={0} step="any" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="bs">{t("buildingSize")}</label>
              <input id="bs" name="buildingSize" type="number" min={0} step="any" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="be">{t("bedrooms")}</label>
              <input id="be" name="bedrooms" type="number" min={0} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="ba">{t("bathrooms")}</label>
              <input id="ba" name="bathrooms" type="number" min={0} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="fl">{t("floors")}</label>
              <input id="fl" name="floors" type="number" min={0} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="pk">{t("parking")}</label>
              <input id="pk" name="parkingSpaces" type="number" min={0} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="yb">{t("yearBuilt")}</label>
              <input id="yb" name="yearBuilt" type="number" min={1900} max={2100} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="fu">{t("furnishing")}</label>
              <select id="fu" name="furnishing" className={input}>
                <option value="">—</option>
                <option value="unfurnished">{t("unfurnished")}</option>
                <option value="partially">{t("partially")}</option>
                <option value="fully">{t("fully")}</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="co">{t("condition")}</label>
              <select id="co" name="condition" className={input}>
                <option value="">—</option>
                <option value="new">{t("condNew")}</option>
                <option value="excellent">{t("condExcellent")}</option>
                <option value="good">{t("condGood")}</option>
                <option value="needs_renovation">{t("condRenovation")}</option>
                <option value="under_construction">{t("condConstruction")}</option>
              </select>
            </div>
          </div>
          <div>
            <label className={label} htmlFor="fa">{t("facilities")}</label>
            <input id="fa" name="facilities" maxLength={500}
              placeholder={t("facilitiesPlaceholder")} className={input} />
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold">{t("sectionPhotos")}</legend>
          <input
            type="file"
            name="photos"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-4 file:py-2.5 file:text-sm file:font-semibold"
          />
          <p className="text-xs text-muted">{t("photosHelp")}</p>
        </fieldset>

        <div className="sticky bottom-16 sm:bottom-0 -mx-4 border-t border-line bg-background/95 px-4 py-3 backdrop-blur">
          <button
            type="submit"
            className="w-full rounded-lg bg-crimson py-3 text-sm font-semibold text-white hover:bg-crimson-strong sm:w-auto sm:px-8"
          >
            {t("submit")}
          </button>
          <p className="mt-2 text-xs text-muted">{t("submitHelp")}</p>
        </div>
      </form>
    </AgentShell>
  );
}
