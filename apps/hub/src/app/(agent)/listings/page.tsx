import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { MAX_ACTIVE_LISTINGS } from "@/config/quotas";

/**
 * The agent's inventory — in two parts, because an agent now works two kinds
 * of stock: listings they hold the mandate for, and listings borrowed from
 * another agent under co-marketing terms (docs/module-co-marketing.md).
 *
 * The distinction is never cosmetic. Borrowed rows show whose listing it
 * really is and what share was agreed, and they carry no edit affordance —
 * the marketing agent markets the property, they do not own the facts.
 */

type OwnRow = {
  id: string;
  human_readable_id: string;
  title: string;
  listing_type: string;
  status: string;
  moderation_reason: string | null;
  price: number;
  currency: string;
  rent_period: string | null;
  properties: { regency_name: string | null; province_name: string | null } | null;
};

type BorrowedRow = {
  id: string;
  human_readable_id: string;
  accepted_terms: { marketing_agent_share_pct?: string; total_commission_pct?: string } | null;
  comarketing_offers: {
    human_readable_id: string;
    listings: {
      human_readable_id: string;
      title: string;
      listing_type: string;
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

export default async function MyListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { submitted, error } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("listings");
  const ts = await getTranslations("listingStatus");

  const [{ data: own }, { data: borrowed }] = await Promise.all([
    supabase
      .from("listings")
      .select(
        `id, human_readable_id, title, listing_type, status, moderation_reason,
         price, currency, rent_period,
         properties (regency_name, province_name)`
      )
      .eq("agent_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("comarketing_engagements")
      .select(
        `id, human_readable_id, accepted_terms,
         comarketing_offers (
           human_readable_id,
           listings (human_readable_id, title, listing_type, price, currency, rent_period,
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

      {submitted && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t("submittedNotice", { id: submitted })}
        </p>
      )}
      {error === "quota" && (
        <p className="mb-6 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {t("quotaReached", { max: MAX_ACTIVE_LISTINGS })}
        </p>
      )}

      {/* Own inventory --------------------------------------------------- */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        {t("sectionOwn")}
      </h2>

      {!ownRows.length ? (
        <p className="rounded-xl border border-line bg-surface p-10 text-center text-sm text-muted">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">{t("cols.listing")}</th>
                <th className="px-4 py-3">{t("cols.location")}</th>
                <th className="px-4 py-3">{t("cols.price")}</th>
                <th className="px-4 py-3">{t("cols.status")}</th>
              </tr>
            </thead>
            <tbody>
              {ownRows.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-xs">{l.human_readable_id}</td>
                  <td className="px-4 py-3 font-medium">{l.title}</td>
                  <td className="px-4 py-3 text-xs">{place(l.properties)}</td>
                  <td className="px-4 py-3">{money(l.currency, l.price, l.rent_period)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        l.status === "published"
                          ? "bg-success/10 text-success"
                          : l.status === "rejected"
                            ? "bg-danger/10 text-danger"
                            : "bg-surface"
                      }`}
                    >
                      {ts(l.status as never)}
                    </span>
                    {l.status === "rejected" && l.moderation_reason && (
                      <p className="mt-1 max-w-60 text-xs text-muted">{l.moderation_reason}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Borrowed inventory ---------------------------------------------- */}
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
            const offer = e.comarketing_offers;
            const listing = offer?.listings;
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
                  {listing
                    ? money(listing.currency, listing.price, listing.rent_period)
                    : "—"}
                </p>

                <dl className="mt-3 space-y-1 border-t border-line pt-3 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t("listedBy")}</dt>
                    <dd className="font-medium">{offer?.profiles?.display_name ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t("yourShare")}</dt>
                    <dd className="font-medium">
                      {share ? `${Number(share).toFixed(0)}%` : "—"}
                    </dd>
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
