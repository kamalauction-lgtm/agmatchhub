import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { searchListings } from "@/lib/listings";
import { ListingCard } from "@/components/listing-card";
import { SearchBar } from "@/components/search-bar";
import { routing } from "@/i18n/routing";

// Public, cacheable, identical for everyone. Revalidating on an interval keeps
// the homepage off the database on every hit while staying fresh enough for a
// catalogue that changes a few times an hour.
export const revalidate = 300;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const { listings } = await searchListings({ sort: "newest", page: 1 });
  const latest = listings.slice(0, 6);
  const searchHref = locale === routing.defaultLocale ? "/cari" : `/${locale}/cari`;

  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-brand-soft to-background">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">{t("heroSubtitle")}</p>

          <div className="mt-8 max-w-3xl">
            <SearchBar locale={locale} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t("latestTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("latestSubtitle")}</p>
          </div>
          <Link
            href={searchHref}
            className="shrink-0 text-sm font-semibold text-brand hover:underline"
          >
            {t("seeAll")} →
          </Link>
        </div>

        {latest.length > 0 ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((listing, i) => (
              <ListingCard key={listing.id} listing={listing} locale={locale} priority={i < 3} />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-card border border-dashed border-line p-10 text-center text-muted">
            {/* An empty catalogue is the expected state before inventory
                lands, so it gets a designed state rather than a blank page. */}
            <p>{t("latestSubtitle")}</p>
          </div>
        )}
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t("whyTitle")}</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {[
              ["whyVerifiedTitle", "whyVerifiedBody"],
              ["whyFastTitle", "whyFastBody"],
              ["whyProtectedTitle", "whyProtectedBody"],
            ].map(([title, body]) => (
              <div
                key={title}
                className="rounded-card border border-line bg-surface-raised p-5"
              >
                <h3 className="font-semibold">{t(title as never)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t(body as never)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
