import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { getStudioListings } from "@/lib/studio/listings";
import { money, place } from "@/lib/listings/format";

/**
 * Content Studio — pick a listing (module design §5).
 *
 * The inventory here is everything the agent can legitimately promote: their
 * own published listings plus borrowed co-marketing ones, from the same view
 * that powers their public landing page. Drafts, tabs and sharing live one
 * level down at /studio/[listingId].
 */
export default async function StudioPickerPage() {
  const user = await requireUser();
  const t = await getTranslations("studio");
  const listings = await getStudioListings(user.id);

  return (
    <AgentShell wide>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("intro")}</p>
        </div>
        <p className="text-sm">
          <Link href="/studio/scheduled" className="font-medium text-crimson hover:underline">
            {t("queueLink")}
          </Link>
          {" · "}
          <Link href="/studio/accounts" className="font-medium text-crimson hover:underline">
            {t("accountsLink")}
          </Link>
        </p>
      </div>
      <div className="mb-6" />

      {!listings.length ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center">
          <p className="text-sm text-muted">{t("empty")}</p>
          <Link
            href="/listings/new"
            className="mt-4 inline-block rounded-lg bg-crimson px-5 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
          >
            {t("emptyCta")}
          </Link>
        </div>
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            {t("pick")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <Link
                key={l.id}
                href={`/studio/${l.id}`}
                className="group rounded-xl border border-line p-4 transition hover:border-crimson"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[11px] text-muted">
                    {l.human_readable_id}
                  </span>
                  {l.borrowed && (
                    <span className="rounded-full bg-crimson-soft px-2 py-0.5 text-xs font-semibold text-crimson">
                      {t("borrowedBadge")}
                    </span>
                  )}
                </div>
                <h3 className="mt-2 line-clamp-2 font-semibold group-hover:text-crimson">
                  {l.title}
                </h3>
                <p className="mt-0.5 text-sm text-muted">
                  {place({ regency_name: l.regency_name, province_name: l.province_name })}
                </p>
                {l.price !== null && (
                  <p className="mt-1 font-bold text-crimson">
                    {money(l.currency, l.price, l.rent_period)}
                  </p>
                )}
                <p className="mt-3 text-xs font-semibold text-crimson">{t("open")} →</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </AgentShell>
  );
}
