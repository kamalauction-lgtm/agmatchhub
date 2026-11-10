import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAgentBySlug, getAgentListings } from "@/lib/listings";
import { mediaUrl } from "@/lib/format";
import { ListingCard } from "@/components/listing-card";
import { CheckBadgeIcon, PinIcon } from "@/components/icons";
import { requireLocale } from "@/i18n/require-locale";

/**
 * An agent's own landing page: /agent/<slug>.
 *
 * Their mandates and the listings they market for other agents, in one grid,
 * under their name. Nothing distinguishes the two — to a visitor this is simply
 * her inventory, which is the model working correctly (module design §7.2).
 *
 * NOINDEX, deliberately, and worth stating plainly because it is a real
 * trade-off rather than an oversight:
 *
 *   A borrowed listing also exists on the marketplace under its true owner. If
 *   these pages were indexed, near-identical copies would compete with the
 *   canonical listing — thin content that degrades the whole domain, and the
 *   borrowing agent would still lose the ranking to the original.
 *
 *   The design (§7.2) eventually wants an agent's OWN listings indexed here,
 *   with borrowed ones excluded. That needs a per-listing split which this view
 *   deliberately does not expose, because such a flag would leak the co-broke
 *   relationship to anyone reading the API. Until that is designed properly,
 *   the whole namespace stays out of search.
 *
 * These pages are a SHARING surface: the agent sends the link on WhatsApp, in
 * groups, to their own network. That is how agents in this market distribute
 * anyway, and it works perfectly well without Google.
 */

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const agent = await getAgentBySlug(slug);
  if (!agent) return { title: "—", robots: { index: false, follow: false } };

  return {
    title: agent.display_name ?? slug,
    description: agent.biography ?? undefined,
    robots: { index: false, follow: true },
  };
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  requireLocale(locale);
  setRequestLocale(locale);

  const agent = await getAgentBySlug(slug);
  if (!agent) notFound();

  const [listings, t] = await Promise.all([
    getAgentListings(agent),
    getTranslations("agentPage"),
  ]);

  /* Only facts the agent's profile actually states. An empty tile reading "0"
     or "—" makes a new agent look worse than saying nothing about them. */
  const stats: Array<[string, string]> = [
    [t("statListings"), String(listings.length)],
    agent.markets_served?.length
      ? [t("statMarkets"), agent.markets_served.slice(0, 3).join(", ")]
      : null,
    agent.property_categories?.length
      ? [t("statCategories"), String(agent.property_categories.length)]
      : null,
  ].filter(Boolean) as Array<[string, string]>;

  const photo = mediaUrl(agent.profile_photo_path) ?? agent.avatar_url;
  const place = [agent.city, agent.state_region].filter(Boolean).join(", ");

  return (
    <>
      {/* Agent header — the same navy band as the marketplace hero, so an
          agent's page reads as part of the platform rather than a stray white
          screen an agent might mistake for someone else's site. */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(ellipse_at_top_right,rgb(37_99_235/0.45),transparent_60%),radial-gradient(ellipse_at_bottom_left,rgb(229_57_53/0.3),transparent_55%)]"
        />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 sm:flex-row sm:items-start">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full bg-white/10 ring-4 ring-white/15">
            {photo ? (
              <Image
                src={photo}
                alt=""
                fill
                unoptimized
                className="object-cover"
                priority
              />
            ) : (
              <span className="grid h-full w-full place-items-center text-4xl font-bold text-white/70">
                {(agent.display_name ?? "?").charAt(0)}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {agent.display_name}
              </h1>
              {agent.is_verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2.5 py-0.5 text-xs font-semibold text-white">
                  <CheckBadgeIcon className="h-3.5 w-3.5" />
                  {t("verified")}
                </span>
              )}
            </div>

            {agent.agency_name && (
              <p className="mt-1.5 text-sm font-medium text-white/80">{agent.agency_name}</p>
            )}
            {place && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-white/60">
                <PinIcon className="h-4 w-4 shrink-0" />
                {place}
              </p>
            )}

            {agent.biography && (
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                {agent.biography}
              </p>
            )}

            {stats.length > 0 && (
              <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/10 pt-5">
                {stats.map(([label, value]) => (
                  <div key={label}>
                    <dd className="text-xl font-bold tracking-tight text-white">{value}</dd>
                    <dt className="mt-0.5 text-xs font-medium uppercase tracking-wide text-white/50">
                      {label}
                    </dt>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </section>

      {/* Inventory ---------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="mb-5 text-lg font-bold">{t("inventory", { count: listings.length })}</h2>
        {!listings.length ? (
          <p className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
            {t("empty")}
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} locale={locale} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
