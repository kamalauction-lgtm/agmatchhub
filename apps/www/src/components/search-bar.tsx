import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

/**
 * Server-rendered search form. A plain GET form means search works with
 * JavaScript disabled, on a slow connection, and produces shareable, indexable
 * URLs — which matters more here than any interaction polish.
 *
 * `advanced` adds the property-type and budget selects that both benchmark
 * portals put in the hero. They are omitted on the results page, where the
 * facet rail already does that job and a second set of controls would only
 * compete with it.
 */

/** Budget rungs, in rupiah. Round numbers a buyer actually thinks in. */
const SALE_BUDGETS = [
  500_000_000, 1_000_000_000, 2_000_000_000, 3_000_000_000, 5_000_000_000, 10_000_000_000,
] as const;

const RENT_BUDGETS = [
  25_000_000, 50_000_000, 100_000_000, 200_000_000, 500_000_000,
] as const;

const PROPERTY_TYPES = [
  "rumah", "apartemen", "ruko", "tanah", "kantor", "gudang", "villa", "kost",
] as const;

const shortIdr = (n: number) =>
  n >= 1_000_000_000
    ? `Rp ${n / 1_000_000_000} M`.replace(".", ",")
    : `Rp ${n / 1_000_000} jt`;

export async function SearchBar({
  locale,
  defaultType = "sale",
  defaultQuery = "",
  size = "large",
  advanced = false,
}: {
  locale: string;
  defaultType?: "sale" | "rent";
  defaultQuery?: string;
  size?: "large" | "compact";
  advanced?: boolean;
}) {
  const t = await getTranslations("home");
  const tp = await getTranslations("propertyType");
  const action = locale === routing.defaultLocale ? "/cari" : `/${locale}/cari`;
  const large = size === "large";

  // One budget list, not one per tab: the tab is a radio inside the same form
  // and switching it cannot re-render a server component. Sale rungs are the
  // honest default for the wider range; rent is served by the same field
  // because maxPrice means the same thing to the query either way.
  const budgets = defaultType === "rent" ? RENT_BUDGETS : SALE_BUDGETS;

  const selectClass =
    "rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-sm outline-none focus:border-brand";

  return (
    <form action={action} method="get" className="w-full">
      <div
        className="inline-flex rounded-lg bg-surface p-1 text-sm"
        role="group"
        aria-label={t("searchButton")}
      >
        {(["sale", "rent"] as const).map((value) => (
          <label
            key={value}
            className="cursor-pointer rounded-md px-3 py-1.5 font-medium has-[:checked]:bg-background has-[:checked]:shadow-sm has-[:checked]:font-semibold"
          >
            <input
              type="radio"
              name="type"
              value={value}
              defaultChecked={defaultType === value}
              className="sr-only"
            />
            {value === "sale" ? t("tabBuy") : t("tabRent")}
          </label>
        ))}
      </div>

      <div
        className={`mt-3 flex flex-col gap-2 rounded-card border border-line bg-surface-raised p-2 sm:flex-row ${
          large ? "shadow-sm" : ""
        }`}
      >
        <input
          type="search"
          name="q"
          defaultValue={defaultQuery}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className={`flex-1 rounded-lg bg-transparent px-3 outline-none placeholder:text-muted ${
            large ? "py-3 text-base" : "py-2.5 text-sm"
          }`}
        />
        <button
          type="submit"
          className={`rounded-lg bg-brand font-semibold text-white hover:bg-brand-strong ${
            large ? "px-6 py-3" : "px-5 py-2.5 text-sm"
          }`}
        >
          {t("searchButton")}
        </button>
      </div>

      {advanced && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="sr-only" htmlFor="propertyType">
            {t("anyType")}
          </label>
          <select id="propertyType" name="propertyType" defaultValue="" className={selectClass}>
            <option value="">{t("anyType")}</option>
            {PROPERTY_TYPES.map((p) => (
              <option key={p} value={p}>
                {tp(p)}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="maxPrice">
            {t("anyBudget")}
          </label>
          <select id="maxPrice" name="maxPrice" defaultValue="" className={selectClass}>
            <option value="">{t("anyBudget")}</option>
            {budgets.map((b) => (
              <option key={b} value={b}>
                {t("upTo", { amount: shortIdr(b) })}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="bedrooms">
            {t("anyBedrooms")}
          </label>
          <select id="bedrooms" name="bedrooms" defaultValue="" className={selectClass}>
            <option value="">{t("anyBedrooms")}</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {t("bedroomsPlus", { n })}
              </option>
            ))}
          </select>
        </div>
      )}
    </form>
  );
}
