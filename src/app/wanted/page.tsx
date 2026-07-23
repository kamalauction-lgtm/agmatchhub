import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { getTranslations } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/service";
import { BrandLockup, BrandWordmark } from "@/components/layout/brand-lockup";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

/**
 * Public "Wanted Properties" board — a listing portal in reverse (§13
 * requirement visibility). Teaser projection only: anonymised client
 * profile at most; never internal notes or client identity.
 */

const OPEN_STATUSES = ["link_active", "receiving_submissions", "reviewing_submissions"];

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

export default async function WantedBoardPage({
  searchParams,
}: {
  searchParams: Promise<{
    country?: string; tx?: string; type?: string; max?: string; q?: string;
  }>;
}) {
  const { country = "", tx = "", type = "", max = "", q = "" } = await searchParams;
  const t = await getTranslations("wanted");
  const tr = await getTranslations("requests");
  const service = createServiceClient();

  const { data: countries } = await service
    .from("countries").select("code, name").order("name");

  let query = service
    .from("property_requests")
    .select(
      `id, human_readable_id, title, transaction_type, property_category,
       property_type, city, state_region, country_code, currency, budget_min,
       budget_max, max_monthly_rent, rent_period, bedrooms_min, min_built_up,
       measurement_unit, submission_deadline, preferred_areas,
       client_profile_anonymised, created_at,
       request_links ( token, active, expires_at )`,
    )
    .eq("public_listing", true)
    .in("status", OPEN_STATUSES)
    .order("created_at", { ascending: false })
    .limit(30);

  if (country) query = query.eq("country_code", country);
  if (tx === "buy" || tx === "rent") query = query.eq("transaction_type", tx);
  if (type) query = query.eq("property_category", type);
  const maxNum = Number(max);
  if (max && Number.isFinite(maxNum) && maxNum > 0) {
    query = query.or(`budget_max.lte.${maxNum},max_monthly_rent.lte.${maxNum}`);
  }
  if (q) query = query.or(`title.ilike.%${q}%,city.ilike.%${q}%`);

  const { data: rows } = await query;
  const base = process.env.REQUEST_LINK_BASE_URL ?? "";

  const cards = await Promise.all(
    (rows ?? [])
      .map((r) => {
        const links = (Array.isArray(r.request_links) ? r.request_links : [r.request_links])
          .filter(Boolean) as { token: string; active: boolean; expires_at: string }[];
        const link = links.find((l) => l.active && new Date(l.expires_at) > new Date());
        return { r, link };
      })
      .filter((c) => c.link)
      .map(async ({ r, link }) => ({
        r,
        token: link!.token,
        qr: await QRCode.toDataURL(`${base}/${link!.token}`, { width: 180, margin: 1 }),
      })),
  );

  const money = (cur: string, n: unknown) =>
    n == null ? null : `${cur} ${Number(n).toLocaleString("en-US")}`;
  const countryName = (code: string) =>
    countries?.find((c) => c.code === code)?.name ?? code;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line px-4 py-4 sm:px-6">
        <Link href="/" aria-label="IQI AG MatchHub"><BrandLockup size={28} /></Link>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link href="/login"
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-crimson hover:text-crimson">
            {t("agentSignIn")}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-[#17171a] px-4 pt-12 pb-24 text-center">
        <div className="mb-4 flex justify-center"><BrandWordmark height={26} /></div>
        <h1 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {t("heroTitle")}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/60">
          {t("heroBody")}
        </p>
      </section>

      {/* Filter bar overlapping the hero */}
      <div className="mx-auto -mt-14 w-full max-w-6xl px-4 sm:px-6">
        <form action="/wanted"
          className="grid gap-3 rounded-2xl border border-line bg-background p-4 shadow-xl sm:grid-cols-2 lg:grid-cols-6">
          <input name="q" defaultValue={q} placeholder={t("searchHint")}
            className={`${inputCls} lg:col-span-2`} />
          <select name="country" defaultValue={country} className={inputCls}>
            <option value="">{t("anyCountry")}</option>
            {(countries ?? []).map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
          <select name="tx" defaultValue={tx} className={inputCls}>
            <option value="">{t("buyOrRent")}</option>
            <option value="buy">{tr("transaction.buy")}</option>
            <option value="rent">{tr("transaction.rent")}</option>
          </select>
          <select name="type" defaultValue={type} className={inputCls}>
            <option value="">{t("anyType")}</option>
            {["residential", "commercial", "industrial", "land", "other"].map((c) => (
              <option key={c} value={c}>{tr(`form.categories.${c}`)}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input name="max" defaultValue={max} type="number" min="0"
              placeholder={t("maxBudget")} className={inputCls} />
            <button type="submit"
              className="rounded-lg bg-crimson px-5 text-sm font-semibold whitespace-nowrap text-white hover:bg-crimson-strong">
              {t("search")}
            </button>
          </div>
        </form>
      </div>

      {/* Results */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {t("resultsTitle", { count: cards.length })}
          </h2>
        </div>

        {!cards.length ? (
          <div className="rounded-2xl border border-line bg-surface p-16 text-center">
            <p className="mb-2 text-3xl">🔍</p>
            <p className="font-medium">{t("emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted">{t("emptyBody")}</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(({ r, token, qr }) => {
              const budget = r.transaction_type === "rent"
                ? money(r.currency, r.max_monthly_rent)
                : (money(r.currency, r.budget_max) ?? money(r.currency, r.budget_min));
              return (
                <article key={r.id}
                  className="group flex flex-col rounded-2xl border border-line bg-background p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-crimson px-2.5 py-1 font-bold text-white uppercase">
                      {t("wantedBadge")} · {tr(`transaction.${r.transaction_type}`)}
                    </span>
                    <span className="rounded-full bg-surface px-2.5 py-1 font-medium">
                      {tr(`form.categories.${r.property_category}`)}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-muted">
                      {r.human_readable_id}
                    </span>
                  </div>

                  <h3 className="mb-1 line-clamp-2 text-base leading-snug font-semibold">
                    {r.title}
                  </h3>
                  <p className="mb-3 flex items-center gap-1.5 text-sm text-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- tiny CDN flag, no optimizer on Workers */}
                    <img
                      src={`https://flagcdn.com/24x18/${r.country_code.toLowerCase()}.png`}
                      alt={countryName(r.country_code)}
                      width={20}
                      height={15}
                      className="rounded-[2px] border border-line"
                    />
                    <span>
                      {[r.city, r.state_region].filter(Boolean).join(", ")} · {countryName(r.country_code)}
                    </span>
                  </p>

                  {budget && (
                    <p className="mb-3 text-lg font-bold text-crimson">
                      {t("upTo")} {budget}
                      {r.transaction_type === "rent" && (
                        <span className="text-xs font-medium text-muted"> {r.rent_period === "yearly" ? t("perYear") : t("perMonth")}</span>
                      )}
                    </p>
                  )}

                  <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted">
                    {r.property_type && <span className="rounded bg-surface px-2 py-1">{r.property_type}</span>}
                    {!!r.bedrooms_min && <span className="rounded bg-surface px-2 py-1">🛏 {r.bedrooms_min}+</span>}
                    {!!Number(r.min_built_up) && (
                      <span className="rounded bg-surface px-2 py-1">
                        📐 {Number(r.min_built_up).toLocaleString("en-US")}+ {r.measurement_unit}
                      </span>
                    )}
                    {r.submission_deadline && (
                      <span className="rounded bg-warning/10 px-2 py-1 text-warning">
                        ⏱ {t("deadline")} {r.submission_deadline}
                      </span>
                    )}
                  </div>

                  {r.client_profile_anonymised && (
                    <p className="mb-4 line-clamp-2 text-xs leading-5 text-muted italic">
                      “{r.client_profile_anonymised}”
                    </p>
                  )}

                  <div className="mt-auto flex items-center gap-2">
                    <Link href={`/r/${token}`}
                      className="flex-1 rounded-lg bg-crimson px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-crimson-strong">
                      {t("offerCta")}
                    </Link>
                    <details className="relative">
                      <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-line text-lg select-none hover:border-crimson [&::-webkit-details-marker]:hidden"
                        title={t("qrHint")}>
                        ▦
                      </summary>
                      <div className="absolute right-0 bottom-12 z-10 rounded-xl border border-line bg-white p-3 shadow-xl">
                        <Image src={qr} alt="QR" width={150} height={150} unoptimized />
                        <p className="mt-1 max-w-[150px] text-center text-[10px] text-muted">{t("qrHint")}</p>
                      </div>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-line px-6 py-6 text-center text-xs text-muted">
        IQI AG MatchHub — {t("footerNote")}
      </footer>
    </div>
  );
}
