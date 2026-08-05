import Link from "next/link";
import { getTranslations, getFormatter } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { SharePanel } from "@/components/listings/share-panel";
import { MAX_ACTIVE_LISTINGS } from "@/config/quotas";
import { shareCaption } from "@/lib/ai/listing-advisor";
import { boostListing } from "./boost-actions";

/**
 * The agent's inventory, in two parts: listings they hold the mandate for, and
 * listings borrowed from another agent under co-marketing terms.
 *
 * Each own listing carries the two actions that bring an agent back into the
 * product: **boost** (three days on top, then it lapses and they return to do
 * it again) and **share** (WhatsApp first — it is where these listings
 * actually travel).
 */

type OwnRow = {
  id: string;
  human_readable_id: string;
  title: string;
  slug: string;
  listing_type: string;
  status: string;
  moderation_reason: string | null;
  price: number;
  currency: string;
  rent_period: string | null;
  properties: {
    regency_name: string | null;
    province_name: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    building_size: number | null;
    land_size: number | null;
  } | null;
  listing_boosts: { ends_at: string; status: string }[];
};

type BorrowedRow = {
  id: string;
  accepted_terms: { marketing_agent_share_pct?: string } | null;
  comarketing_offers: {
    listings: {
      human_readable_id: string;
      title: string;
      price: number;
      currency: string;
      rent_period: string | null;
      properties: { regency_name: string | null; province_name: string | null } | null;
    } | null;
    profiles: { display_name: string } | null;
  } | null;
};

function money(currency: string, price: number, rentPeriod: string | null) {
  const suffix = rentPeriod ? (rentPeriod === "monthly" ? "/bln" : "/thn") : "";
  return `${currency} ${Number(price).toLocaleString("id-ID")}${suffix}`;
}

function place(p: { regency_name: string | null; province_name: string | null } | null) {
  return [p?.regency_name, p?.province_name].filter(Boolean).join(", ") || "—";
}

/** Active boost, decided once outside render (no impure calls in components). */
function activeBoostEnd(rows: { ends_at: string; status: string }[]): string | null {
  const now = Date.now();
  const live = rows.find((b) => b.status === "active" && Date.parse(b.ends_at) > now);
  return live?.ends_at ?? null;
}

export default async function MyListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; error?: string; boosted?: string }>;
}) {
  const user = await requireUser();
  const { submitted, error, boosted } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("listings");
  const ts = await getTranslations("listingStatus");
  const format = await getFormatter();

  const [{ data: own }, { data: borrowed }] = await Promise.all([
    supabase
      .from("listings")
      .select(
        `id, human_readable_id, title, slug, listing_type, status, moderation_reason,
         price, currency, rent_period,
         properties (regency_name, province_name, bedrooms, bathrooms, building_size, land_size),
         listing_boosts (ends_at, status)`
      )
      .eq("agent_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("comarketing_engagements")
      .select(
        `id, accepted_terms,
         comarketing_offers (
           listings (human_readable_id, title, price, currency, rent_period,
                     properties (regency_name, province_name)),
           profiles (display_name)
         )`
      )
      .eq("marketing_agent_id", user.id)
      .eq("status", "active")
      .order("accepted_at", { ascending: false }),
  ]);

  const ownRows = (own ?? []) as unknown as OwnRow[];
  const borrowedRows = (borrowed ?? []) as unknown as BorrowedRow[];
  const active = ownRows.filter((l) =>
    ["draft", "pending_review", "published"].includes(l.status)
  ).length;

  const siteUrl = process.env.NEXT_PUBLIC_MARKETPLACE_URL ?? "https://www.propertiguru.id";

  const notice =
    boosted ? { tone: "success" as const, text: t("boost.done") }
    : submitted ? { tone: "success" as const, text: t("submittedNotice", { id: submitted }) }
    : error ? { tone: "warn" as const, text: t(`boost.errors.${error}` as never) }
    : null;

  return (
    <AgentShell wide>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("quota", { active, max: MAX_ACTIVE_LISTINGS })}
            {borrowedRows.length > 0 && ` · ${t("borrowedCount", { count: borrowedRows.length })}`}
          </p>
        </div>
        <Link
          href="/listings/new"
          className="rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
        >
          {t("new")}
        </Link>
      </div>

      {notice && (
        <p
          className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${
            notice.tone === "success"
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning"
          }`}
        >
          {notice.text}
        </p>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        {t("sectionOwn")}
      </h2>

      {!ownRows.length ? (
        <p className="rounded-xl border border-line bg-surface p-10 text-center text-sm text-muted">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-4">
          {ownRows.map((l) => {
            const boostEnd = activeBoostEnd(l.listing_boosts ?? []);
            const isLive = l.status === "published";
            const url = `${siteUrl}/properti/${l.slug}`;
            const caption = shareCaption({
              title: l.title,
              price: money(l.currency, l.price, l.rent_period),
              place: place(l.properties),
              url,
              bedrooms: l.properties?.bedrooms,
              bathrooms: l.properties?.bathrooms,
              size: l.properties?.building_size ?? l.properties?.land_size,
            });

            return (
              <article key={l.id} className="rounded-xl border border-line p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted">{l.human_readable_id}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          l.status === "published"
                            ? "bg-success/10 text-success"
                            : l.status === "rejected"
                              ? "bg-danger/10 text-danger"
                              : "bg-surface"
                        }`}
                      >
                        {ts(l.status as never)}
                      </span>
                      {boostEnd && (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-warning">
                          ⚡ {t("boost.activeUntil", {
                            when: format.relativeTime(new Date(boostEnd)),
                          })}
                        </span>
                      )}
                    </div>

                    <h3 className="mt-2 font-semibold">{l.title}</h3>
                    <p className="mt-0.5 text-sm text-muted">{place(l.properties)}</p>
                    <p className="mt-1 font-bold text-crimson">
                      {money(l.currency, l.price, l.rent_period)}
                    </p>

                    {l.status === "rejected" && l.moderation_reason && (
                      <p className="mt-2 max-w-lg rounded-lg bg-danger/5 px-3 py-2 text-xs text-muted">
                        {l.moderation_reason}
                      </p>
                    )}
                  </div>

                  {isLive && (
                    <form action={boostListing} className="shrink-0">
                      <input type="hidden" name="listingId" value={l.id} />
                      <input type="hidden" name="product" value="boost_3d" />
                      <button
                        type="submit"
                        disabled={!!boostEnd}
                        className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${
                          boostEnd
                            ? "cursor-not-allowed border border-line text-muted"
                            : "bg-accent text-white hover:opacity-90"
                        }`}
                      >
                        {boostEnd ? t("boost.running") : t("boost.cta")}
                      </button>
                      <p className="mt-1 max-w-40 text-right text-[11px] text-muted">
                        {boostEnd ? t("boost.willLapse") : t("boost.help")}
                      </p>
                    </form>
                  )}
                </div>

                {isLive && (
                  <div className="mt-4">
                    <SharePanel
                      url={url}
                      caption={caption}
                      labels={{
                        share: t("share.label"),
                        whatsapp: t("share.whatsapp"),
                        telegram: t("share.telegram"),
                        facebook: t("share.facebook"),
                        copy: t("share.copy"),
                        copied: t("share.copied"),
                        caption: t("share.caption"),
                      }}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <h2 className="mb-1 mt-10 text-sm font-semibold uppercase tracking-wide text-muted">
        {t("sectionBorrowed")}
      </h2>
      <p className="mb-3 text-sm text-muted">{t("borrowedHelp")}</p>

      {!borrowedRows.length ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
          {t("borrowedEmpty")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {borrowedRows.map((e) => {
            const listing = e.comarketing_offers?.listings;
            const share = e.accepted_terms?.marketing_agent_share_pct;
            return (
              <article key={e.id} className="rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-full bg-crimson-soft px-2 py-0.5 text-xs font-semibold text-crimson">
                    {t("borrowedBadge")}
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    {listing?.human_readable_id}
                  </span>
                </div>
                <h3 className="mt-2 font-semibold">{listing?.title ?? "—"}</h3>
                <p className="mt-0.5 text-sm text-muted">{place(listing?.properties ?? null)}</p>
                <p className="mt-2 font-bold text-crimson">
                  {listing ? money(listing.currency, listing.price, listing.rent_period) : "—"}
                </p>
                <dl className="mt-3 space-y-1 border-t border-line pt-3 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t("listedBy")}</dt>
                    <dd className="font-medium">
                      {e.comarketing_offers?.profiles?.display_name ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t("yourShare")}</dt>
                    <dd className="font-medium">{share ? `${Number(share).toFixed(0)}%` : "—"}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </AgentShell>
  );
}
