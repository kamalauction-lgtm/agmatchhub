import { getTranslations } from "next-intl/server";
import { market } from "@/config/market";
import type { SearchParams } from "@/lib/listings";
import { formatPriceShort } from "@/lib/format";

/**
 * The filter rail on the results page. One GET form, so every combination is
 * a URL and nothing depends on a bundle. Values are the market's own rungs.
 */
export async function FilterPanel({
  action,
  locale,
  current,
}: {
  action: string;
  locale: string;
  current: SearchParams;
}) {
  const t = await getTranslations("search");
  const th = await getTranslations("home");
  const tp = await getTranslations("propertyType");
  const budgets = current.type === "rent" ? market.budgets.rent : market.budgets.sale;

  const field =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-electric";
  const label = "text-xs font-semibold uppercase tracking-wide text-muted";

  return (
    <form action={action} method="get" className="rounded-2xl border border-line bg-surface-raised p-4 shadow-card">
      <input type="hidden" name="sort" value={current.sort ?? "relevance"} />
      {current.q && <input type="hidden" name="q" value={current.q} />}

      <p className="text-sm font-bold">{t("filters")}</p>

      <fieldset className="mt-3">
        <legend className={label}>{t("transaction")}</legend>
        <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg bg-surface p-1 text-sm">
          {([
            ["", t("anyType")],
            ["sale", t("filterSale")],
            ["rent", t("filterRent")],
          ] as const).map(([value, text]) => (
            <label
              key={value}
              className="cursor-pointer rounded-md px-2 py-1.5 text-center font-medium has-[:checked]:bg-electric has-[:checked]:text-white"
            >
              <input type="radio" name="type" value={value} defaultChecked={(current.type ?? "") === value} className="sr-only" />
              {text}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-3">
        <label htmlFor="f-ptype" className={label}>{t("propertyType")}</label>
        <select id="f-ptype" name="propertyType" defaultValue={current.propertyType ?? ""} className={field}>
          <option value="">{th("anyType")}</option>
          {market.searchPropertyTypes.map((p) => (
            <option key={p} value={p}>{tp(p as never)}</option>
          ))}
        </select>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="f-min" className={label}>{t("minPrice")}</label>
          <select id="f-min" name="minPrice" defaultValue={current.minPrice ?? ""} className={field}>
            <option value="">{t("anyPrice")}</option>
            {budgets.map((b) => (
              <option key={b} value={b}>{formatPriceShort(b, market.currency, locale)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-max" className={label}>{t("maxPrice")}</label>
          <select id="f-max" name="maxPrice" defaultValue={current.maxPrice ?? ""} className={field}>
            <option value="">{t("anyPrice")}</option>
            {budgets.map((b) => (
              <option key={b} value={b}>{formatPriceShort(b, market.currency, locale)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="f-bed" className={label}>{t("bedrooms")}</label>
          <select id="f-bed" name="bedrooms" defaultValue={current.bedrooms ?? ""} className={field}>
            <option value="">{th("anyBedrooms")}</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{th("bedroomsPlus", { n })}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-bath" className={label}>{t("bathrooms")}</label>
          <select id="f-bath" name="bathrooms" defaultValue={current.bathrooms ?? ""} className={field}>
            <option value="">{t("anyBathrooms")}</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>{t("filterBathrooms", { count: n })}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        className="mt-4 w-full cursor-pointer rounded-lg bg-electric py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-electric-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric"
      >
        {t("apply")}
      </button>
    </form>
  );
}
