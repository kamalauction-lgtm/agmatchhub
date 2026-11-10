import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { runConcierge, type Criterion, type RelaxStep } from "@/lib/concierge";
import { formatPriceShort } from "@/lib/format";
import { market } from "@/config/market";
import { publicPath } from "@/i18n/routing";
import { ListingCard } from "@/components/listing-card";
import { ConciergeForm } from "@/components/concierge-form";
import { RuleBasedNotice } from "@/components/rule-based-notice";
import { CompareTray } from "@/components/compare-tray";
import { SectionHeading } from "@/components/section-heading";
import { ArrowRightIcon, CheckBadgeIcon, CloseIcon, SearchIcon, SparkIcon } from "@/components/icons";

// Results depend on the query string; render per request.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "concierge" });
  return { title: t("title") };
}

function searchHrefFor(base: string, p: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== "" && k !== "page") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export default async function AssistantPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("concierge");
  const tc = await getTranslations("compare");
  const tp = await getTranslations("propertyType");
  const th = await getTranslations("home");

  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim().slice(0, 300) ?? "";
  const action = publicPath(locale, "assistant");
  const searchBase = publicPath(locale, "search");
  const compareHref = publicPath(locale, "compare");
  const money = (n: number) => formatPriceShort(n, market.currency, locale);

  const result = q ? await runConcierge(q) : null;

  const criterionText = (c: Criterion): string => {
    switch (c.key) {
      case "type": return c.value === "rent" ? t("criteria.rent") : c.inferred ? t("criteria.saleInferred") : t("criteria.sale");
      case "propertyType": return t("criteria.propertyType", { type: tp(String(c.value) as never) || String(c.value) });
      case "bedrooms": return t("criteria.bedrooms", { n: Number(c.value) });
      case "bathrooms": return t("criteria.bathrooms", { n: Number(c.value) });
      case "minPrice": return t("criteria.minPrice", { amount: money(Number(c.value)) });
      case "maxPrice": return t("criteria.maxPrice", { amount: money(Number(c.value)) });
      case "place": return t("criteria.place", { place: String(c.value) });
    }
  };
  const relaxText = (r: RelaxStep): string => {
    switch (r.key) {
      case "bathrooms": return t("relax.bathrooms");
      case "maxPrice": return t("relax.maxPrice", { from: money(Number(r.from)), to: money(Number(r.to)) });
      case "bedrooms": return r.to === null ? t("relax.bedroomsDrop") : t("relax.bedrooms", { from: Number(r.from), to: Number(r.to) });
      case "propertyType": return t("relax.propertyType");
      case "minPrice": return t("relax.minPrice");
      case "place": return t("relax.place", { place: String(r.from) });
      default: return "";
    }
  };

  return (
    <>
      <section className="command-band relative overflow-hidden">
        <div aria-hidden className="command-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-5xl px-4 pb-12 pt-10 sm:pb-16 sm:pt-14">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-command-gold">
            <SparkIcon className="h-4 w-4" />
            {t("eyebrow")}
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">{t("title")}</h1>
          <p className="mt-3 max-w-2xl text-base text-command-muted sm:text-lg">{t("subtitle")}</p>
          <div className="mt-7">
            <ConciergeForm
              action={action}
              onDark
              autoFocus={!q}
              defaultValue={q}
              placeholder={th("conciergePlaceholder")}
              submitLabel={th("conciergeSubmit")}
              examplesLabel={th("conciergeExamplesLabel")}
              examples={[th("conciergeExample1"), th("conciergeExample2"), th("conciergeExample3")]}
            />
          </div>
          <div className="mt-4 max-w-3xl">
            <RuleBasedNotice tone="dark" title={th("ruleTitle")} body={th("ruleBody")} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-28 pt-8">
        {!result && (
          <section className="grid gap-6 lg:grid-cols-3">
            {([1, 2, 3] as const).map((n) => (
              <div key={n} className="rounded-2xl border border-line bg-surface-raised p-5 shadow-card">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-electric-soft text-sm font-bold text-electric">{n}</span>
                <h2 className="mt-3 text-base font-semibold">{th(`step${n}Title`)}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{th(`step${n}Body`)}</p>
              </div>
            ))}
          </section>
        )}

        {result && (
          <>
            {/* What the rules understood ---------------------------------- */}
            <section className="rounded-2xl border border-line bg-surface-raised p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{t("understood")}</h2>
                  <p className="mt-1 text-sm text-muted">“{result.query}”</p>
                </div>
                <span className="rounded-md border border-gold-light/60 bg-gold-soft px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-gold-ink">
                  {t("provider")}
                </span>
              </div>

              {result.criteria.length > 0 ? (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {result.criteria.map((c) => (
                    <li
                      key={c.key}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${
                        c.applied
                          ? "border-electric/30 bg-electric-soft text-electric"
                          : "border-line bg-surface text-muted line-through"
                      }`}
                    >
                      {c.applied ? <CheckBadgeIcon className="h-4 w-4" /> : <CloseIcon className="h-3.5 w-3.5" />}
                      {criterionText(c)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-line-strong p-4 text-sm text-muted">{t("nothingParsed")}</p>
              )}

              {result.unrecognised.length > 0 && (
                <p className="mt-4 text-sm text-muted">
                  <span className="font-semibold text-muted-strong">{t("notUnderstood")}</span>{" "}
                  {result.unrecognised.map((w) => (
                    <span key={w} className="mr-1.5 inline-block rounded-md bg-surface px-1.5 py-0.5 font-mono text-xs">{w}</span>
                  ))}
                </p>
              )}

              {result.relaxed.length > 0 && (
                <div className="mt-4 rounded-xl border border-gold-light/50 bg-gold-soft p-4">
                  <p className="text-sm font-semibold text-gold-ink">{t("relaxedTitle")}</p>
                  <p className="mt-1 text-sm text-muted-strong">{t("relaxedIntro")}</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-strong">
                    {result.relaxed.map((r, i) => <li key={i}>{relaxText(r)}</li>)}
                  </ol>
                </div>
              )}
            </section>

            {/* Results ------------------------------------------------------ */}
            <section className="mt-10">
              <SectionHeading
                eyebrow={result.exact ? t("exactEyebrow") : t("alternativesEyebrow")}
                title={t("results", { count: result.total })}
                subtitle={result.exact ? t("exactSubtitle") : t("alternativesSubtitle")}
                action={
                  result.total > 0
                    ? { href: searchHrefFor(searchBase, result.effective as Record<string, string | number | undefined>), label: t("seeAllResults") }
                    : undefined
                }
              />
              {result.listings.length > 0 ? (
                <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {result.listings.map((l, i) => (
                    <ListingCard key={l.id} listing={l} locale={locale} priority={i < 3} />
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-electric-soft text-electric">
                    <SearchIcon className="h-6 w-6" />
                  </span>
                  <p className="mt-4 font-semibold">{t("noResults")}</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{t("noResultsHelp")}</p>
                  <Link href={searchBase} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-electric px-5 py-2.5 text-sm font-semibold text-white hover:bg-electric-strong">
                    {t("browseAll")} <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </div>
              )}
              {result.listings.length > 1 && (
                <p className="mt-6 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
                  {t("compareHint")}
                </p>
              )}
            </section>
          </>
        )}
      </div>

      <CompareTray
        compareHref={compareHref}
        labels={{ title: tc("tray.title"), cta: tc("tray.cta"), clear: tc("tray.clear"), of: tc("tray.of") }}
      />
    </>
  );
}
