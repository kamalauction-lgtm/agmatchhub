import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { formatFigure, type PriceFigure, type PriceFigures } from "@/lib/international/price";

/**
 * The three-figure price: rupiah first and largest, then the listing's own
 * currency (the real price), then US dollars. Converted figures carry the
 * word "estimate" and the footnote names the date of the rate — a buyer must
 * never read a converted number as an offer.
 */
export async function PriceBlock({
  price,
  size = "card",
}: {
  price: PriceFigures | null;
  size?: "card" | "detail";
}) {
  const t = await getTranslations("international");
  const locale = await getLocale();
  const format = await getFormatter();

  if (!price || !price.figures.length) {
    return <p className="text-sm font-semibold text-muted-strong">{t("priceOnRequest")}</p>;
  }

  const text = (f: PriceFigure) => {
    const p = formatFigure(f, locale, { compact: size === "card" });
    return p.kind === "range" ? t("priceRange", { min: p.min, max: p.max })
      : p.kind === "from" ? t("priceFrom", { value: p.value })
      : p.kind === "upTo" ? t("priceUpTo", { value: p.value })
      : p.value;
  };

  const [primary, ...rest] = price.figures;
  const anyEstimate = price.figures.some((f) => f.estimate);
  const pill = (
    <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-strong">
      {t("estimate")}
    </span>
  );

  return (
    <div data-intl-price>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`font-bold leading-tight tabular-nums text-crimson-strong ${size === "detail" ? "text-2xl sm:text-3xl" : "text-lg"}`}>
          {text(primary)}
        </span>
        {primary.estimate && pill}
      </p>

      {rest.length > 0 && (
        <dl className={`mt-2 space-y-1 ${size === "detail" ? "text-base" : "text-sm"}`}>
          {rest.map((f) => (
            <div key={f.currency} className="flex flex-wrap items-baseline gap-x-2">
              <dt className="min-w-[4.5rem] text-xs font-medium text-muted">
                {f.estimate ? t("estimateIn", { currency: f.currency }) : t("listedPrice")}
              </dt>
              <dd className={`tabular-nums ${f.estimate ? "text-muted-strong" : "font-semibold text-foreground"}`}>
                {text(f)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {anyEstimate && (
        <p className="mt-2 text-xs leading-5 text-muted">
          {price.rateDate
            ? t(size === "detail" ? "rateNoteLong" : "rateNote", {
                date: format.dateTime(new Date(`${price.rateDate}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }),
              })
            : t("rateNoteNoDate")}
        </p>
      )}
    </div>
  );
}
