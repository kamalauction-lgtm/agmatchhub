import { getTranslations } from "next-intl/server";
import { publicPath } from "@/i18n/routing";
import type { InternationalHome } from "@/lib/international";
import { InternationalCard } from "./international-card";
import { SectionHeading } from "./section-heading";

/**
 * The homepage's International strip.
 *
 * Renders NOTHING when there are no international listings — no heading over
 * an empty row — so a database without the section simply has no section.
 * `className` carries the page's own container width and spacing, which
 * differ between the two market homepages.
 */
export async function InternationalStrip({
  data,
  locale,
  className,
}: {
  data: InternationalHome;
  locale: string;
  className: string;
}) {
  if (data.listings.length === 0) return null;
  const t = await getTranslations("international");

  return (
    <section className={className}>
      <SectionHeading
        eyebrow={t("homeEyebrow")}
        title={t("homeTitle")}
        subtitle={t("homeSubtitle")}
        action={{ href: publicPath(locale, "international"), label: t("seeAll") }}
      />
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {data.listings.map((listing) => (
          <InternationalCard key={listing.id} listing={listing} rates={data.rates} locale={locale} />
        ))}
      </div>
    </section>
  );
}
