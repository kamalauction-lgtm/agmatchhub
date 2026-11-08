import { getTranslations } from "next-intl/server";
import { publicPath } from "@/i18n/routing";
import { market } from "@/config/market";
import { formatPriceShort } from "@/lib/format";

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

/* Budgets and property types come from the MARKET. They were rupiah rungs and
   Indonesian types written in as constants, so the Malaysian build offered
   "Up to Rp 500 jt" and a dropdown of ruko and kost. */

export async function SearchBar({
  locale,
  defaultType = "sale",
  defaultQuery = "",
  size = "large",
  advanced = false,
  onDark = false,
}: {
  locale: string;
  defaultType?: "sale" | "rent";
  defaultQuery?: string;
  size?: "large" | "compact";
  advanced?: boolean;
  /** Sitting on the dark hero band, where the tab strip needs its own palette. */
  onDark?: boolean;
}) {
  const t = await getTranslations("home");
  const tp = await getTranslations("propertyType");
  const action = publicPath(locale, "search");
  const large = size === "large";

  // One budget list, not one per tab: the tab is a radio inside the same form
  // and switching it cannot re-render a server component. Sale rungs are the
  // honest default for the wider range; rent is served by the same field
  // because maxPrice means the same thing to the query either way.
  const budgets = defaultType === "rent" ? market.budgets.rent : market.budgets.sale;

  /* `text-foreground` is not decoration here. On the dark hero the section
     sets `text-white`, and these controls sit on a white card — without an
     explicit colour they inherit white and render as blank boxes. Found on
     production the first time this form was put on the dark band. */
  const selectClass =
    "rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand";

  return (
    <form action={action} method="get" className="w-full">
      {/* The tab strip sits ABOVE the search box on the hero, so on the dark
          band it is drawn on the band itself rather than on a card — hence its
          own colours rather than the page's surface tokens. */}
      <div
        className={`inline-flex rounded-t-lg p-1 text-sm ${
          onDark ? "bg-white/10" : "rounded-lg bg-surface"
        }`}
        role="group"
        aria-label={t("searchButton")}
      >
        {(["sale", "rent"] as const).map((value) => (
          <label
            key={value}
            className={`cursor-pointer rounded-md px-4 py-2 font-medium has-[:checked]:font-semibold ${
              onDark
                ? "text-white/70 has-[:checked]:bg-white has-[:checked]:text-navy"
                : "has-[:checked]:bg-background has-[:checked]:shadow-sm"
            }`}
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
        className={`flex flex-col gap-2 border border-line bg-surface-raised p-2 sm:flex-row ${
          onDark ? "mt-0 rounded-b-card rounded-tr-card shadow-raised" : "mt-3 rounded-card"
        } ${large && !onDark ? "shadow-sm" : ""}`}
      >
        <input
          type="search"
          name="q"
          defaultValue={defaultQuery}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className={`flex-1 rounded-lg bg-transparent px-3 text-foreground outline-none placeholder:text-muted ${
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
            {market.searchPropertyTypes.map((p) => (
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
                {t("upTo", { amount: formatPriceShort(b, market.currency, locale) })}
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
