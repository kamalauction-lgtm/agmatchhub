import { getTranslations } from "next-intl/server";
import { formatPriceExact, formatPriceShort } from "@/lib/format";
import {
  currencyName,
  formatRateDate,
  type PriceBlock,
  type PriceFigure,
} from "@/lib/international";

/**
 * The three-figure price. Which figures exist, and in what order, is decided
 * by `priceFigures()`; this only draws them.
 *
 * The first figure is the headline. Anything converted carries the word
 * "estimate" next to it, and the detail variant ends with the date of the
 * rate and a sentence saying which currency is the real price. A figure that
 * could not be computed is simply not in the block.
 */

function amount(fig: PriceFigure, locale: string, short: boolean): string {
  const one = (n: number) =>
    short ? formatPriceShort(n, fig.currency, locale) : formatPriceExact(n, fig.currency, locale);
  return fig.max === null ? one(fig.min) : `${one(fig.min)} – ${one(fig.max)}`;
}

/** Card form: one headline line and one quiet line. */
export async function InternationalCardPrice({
  block,
  locale,
}: {
  block: PriceBlock;
  locale: string;
}) {
  const t = await getTranslations("international");
  const [lead, ...rest] = block.figures;

  if (!lead) {
    return <p className="text-base font-bold text-muted-strong">{t("priceOnRequest")}</p>;
  }

  const leadText = formatPriceShort(lead.min, lead.currency, locale);
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-xl font-extrabold tracking-tight text-electric">
          {lead.max === null ? leadText : t("from", { price: leadText })}
        </span>
        {lead.estimate && (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {t("estimate")}
          </span>
        )}
      </p>
      {rest.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted">
          {rest.map((fig, i) => (
            <span key={fig.currency} className="whitespace-nowrap">
              {i > 0 && (
                <span aria-hidden className="mr-2">
                  ·
                </span>
              )}
              {fig.estimate ? (
                <>
                  <span aria-hidden>≈ </span>
                  <span className="sr-only">{t("estimate")}: </span>
                  {formatPriceShort(fig.min, fig.currency, locale)}
                </>
              ) : (
                <span className="font-semibold text-muted-strong">
                  {formatPriceShort(fig.min, fig.currency, locale)}
                </span>
              )}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** Detail form: the full block, labelled line by line, with the rate date. */
export async function InternationalPriceBlock({
  block,
  ownCurrency,
  locale,
}: {
  block: PriceBlock;
  ownCurrency: string;
  locale: string;
}) {
  const t = await getTranslations("international");
  const [lead, ...rest] = block.figures;
  const frame = "mt-5 overflow-hidden rounded-card border border-line bg-surface-raised shadow-card";

  if (!lead) {
    return (
      <section aria-label={t("priceTitle")} className={`${frame} p-5`}>
        <p className="text-xl font-bold">{t("priceOnRequest")}</p>
        <p className="mt-1 text-sm text-muted">{t("priceOnRequestHelp")}</p>
      </section>
    );
  }

  const label = (fig: PriceFigure) =>
    fig.estimate
      ? t("priceEstimateIn", { currency: fig.currency })
      : t("priceOwn", { currency: fig.currency });
  const rateDate = formatRateDate(block.asOf, locale);
  const hasEstimate = block.figures.some((f) => f.estimate);

  return (
    <section aria-label={t("priceTitle")} className={frame}>
      <div className="p-5">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
          {label(lead)}
          {lead.estimate && (
            <span className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] text-muted-strong">
              {t("estimate")}
            </span>
          )}
        </p>
        {/* Estimates are abbreviated on purpose: a converted figure printed to
            the last rupiah claims a precision it does not have. */}
        <p className="mt-1.5 break-words text-2xl font-extrabold leading-tight tracking-tight text-electric sm:text-4xl">
          {amount(lead, locale, lead.estimate)}
        </p>
      </div>

      {rest.length > 0 && (
        <dl className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
          {rest.map((fig, i) => (
            <div
              key={fig.currency}
              className={`bg-surface-raised px-5 py-3.5 ${
                rest.length % 2 === 1 && i === rest.length - 1 ? "sm:col-span-2" : ""
              }`}
            >
              <dt className="text-xs font-medium text-muted">{label(fig)}</dt>
              <dd className="mt-1 break-words text-base font-bold leading-snug sm:text-lg">
                {amount(fig, locale, fig.estimate)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {hasEstimate && rateDate && (
        <p className="border-t border-line bg-surface px-5 py-3 text-xs leading-relaxed text-muted">
          {t("estimateNote", { date: rateDate })}{" "}
          {t("ownCurrencyNote", { currency: currencyName(ownCurrency, locale) })}
        </p>
      )}
    </section>
  );
}
