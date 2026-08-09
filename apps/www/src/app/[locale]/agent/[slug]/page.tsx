import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAgentBySlug, getAgentListings } from "@/lib/listings";
import { mediaUrl } from "@/lib/format";
import { ListingCard } from "@/components/listing-card";

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
  setRequestLocale(locale);

  const agent = await getAgentBySlug(slug);
  if (!agent) notFound();

  const [listings, t] = await Promise.all([
    getAgentListings(agent),
    getTranslations("agentPage"),
  ]);

  const photo = mediaUrl(agent.profile_photo_path) ?? agent.avatar_url;
  const place = [agent.city, agent.state_region].filter(Boolean).join(", ");

  return (
    <>
      {/* Agent card — top of the page, as on the benchmark. */}
      <section className="border-b border-line bg-gradient-to-b from-brand-soft to-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:flex-row sm:items-center">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-surface-raised">
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
              <span className="grid h-full w-full place-items-center text-3xl font-black text-muted">
                {(agent.display_name ?? "?").charAt(0)}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                {agent.display_name}
              </h1>
              {agent.is_verified && (
                <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                  ✓ {t("verified")}
                </span>
              )}
            </div>

            {agent.agency_name && (
              <p className="mt-1 text-sm text-muted">{agent.agency_name}</p>
            )}
            {place && <p className="mt-0.5 text-sm text-muted">📍 {place}</p>}

            {agent.biography && (
              <p className="mt-3 max-w-2xl text-sm text-muted">{agent.biography}</p>
            )}

            <p className="mt-3 text-sm font-semibold">
              {t("inventory", { count: listings.length })}
            </p>
          </div>
        </div>
      </section>

      {/* Inventory ---------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-10">
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
