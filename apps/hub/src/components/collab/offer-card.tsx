import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { money, place } from "@/lib/listings/format";

/**
 * One co-marketing pool card (MatchHub 2.0). Every field here is a column of
 * the `pool_offer_cards` projection (00099–00102): property facts, the listing
 * agent's display name and the commission terms. Nothing private is reachable
 * from this component because nothing private is in the row it receives.
 *
 * Pickup and stop are the same server actions as before; only the markup
 * around them changes.
 */

export type OfferCardOffer = {
  id: string;
  listing_agent_id: string;
  total_commission_pct: number | null;
  marketing_agent_share_pct: number;
  payer: string;
  requires_la_approval: boolean;
  max_marketing_agents: number | null;
  notes: string | null;
  listings: {
    human_readable_id: string;
    title: string;
    listing_type: string;
    price: number;
    currency: string;
    rent_period: string | null;
    properties: {
      property_type: string;
      province_name: string | null;
      regency_name: string | null;
      bedrooms: number | null;
      bathrooms: number | null;
      building_size: number | null;
      land_size: number | null;
    } | null;
  } | null;
  profiles: { display_name: string } | null;
};

export async function OfferCard({
  offer: o,
  propertyTypeLabel,
  isOwn,
  mine,
  pickUp,
  drop,
}: {
  offer: OfferCardOffer;
  propertyTypeLabel: string | null;
  isOwn: boolean;
  mine: { id: string; status: string } | null;
  pickUp: (formData: FormData) => void | Promise<void>;
  drop: (formData: FormData) => void | Promise<void>;
}) {
  const t = await getTranslations("pool");
  const l = o.listings;
  const p = l?.properties ?? null;
  const share = Number(o.marketing_agent_share_pct);
  const specs = p
    ? [
        p.bedrooms ? t("spec.beds", { n: p.bedrooms }) : null,
        p.bathrooms ? t("spec.baths", { n: p.bathrooms }) : null,
        p.building_size ? t("spec.built", { n: p.building_size }) : null,
        p.land_size ? t("spec.land", { n: p.land_size }) : null,
      ].filter(Boolean)
    : [];

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-line bg-card p-4 shadow-card transition-colors duration-150 hover:border-blue sm:p-5">
      {/* Price tile: the projection has no photo, so the price and kind carry the card. */}
      <div className="flex items-end justify-between gap-3 rounded-xl bg-gradient-to-br from-blue-soft via-surface to-indigo-soft p-4">
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] text-muted">
            {l?.human_readable_id}
            {propertyTypeLabel ? ` · ${propertyTypeLabel}` : ""}
            {l ? ` · ${l.listing_type === "rent" ? t("filter.rent") : t("filter.sale")}` : ""}
          </p>
          <p className="mt-1 text-lg font-bold tracking-tight text-foreground">
            {l ? money(l.currency, l.price, l.rent_period) : "—"}
          </p>
        </div>
        <Badge tone="success" className="shrink-0">{share}% {t("badge.yourShare")}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {o.requires_la_approval && <Badge tone="warning">{t("badge.needsApproval")}</Badge>}
      </div>

      <h3 className="mt-2 font-semibold leading-snug">{l?.title ?? "—"}</h3>
      <p className="mt-0.5 text-sm text-muted">
        {place(p)}
        {specs.length ? ` · ${specs.join(" · ")}` : ""}
      </p>

      {/* Share bar: the agent's share of the commission, as the row states it. */}
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="text-muted">{t("badge.yourShare")}</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface" aria-hidden>
          <div className="h-full rounded-full bg-blue" style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />
        </div>
        <span className="font-semibold tabular-nums">{share}%</span>
      </div>

      <dl className="mt-3 space-y-1 border-t border-line pt-3 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("terms.listedBy")}</dt>
          <dd className="font-medium">{o.profiles?.display_name ?? "—"}</dd>
        </div>
        {o.total_commission_pct !== null && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t("terms.totalCommission")}</dt>
            <dd className="font-medium">{Number(o.total_commission_pct)}%</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("terms.payer")}</dt>
          <dd className="font-medium">{t(`payer.${o.payer}` as never)}</dd>
        </div>
        {o.max_marketing_agents !== null && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t("terms.maxAgents")}</dt>
            <dd className="font-medium">{o.max_marketing_agents}</dd>
          </div>
        )}
      </dl>

      {o.notes && <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs text-muted">{o.notes}</p>}

      <div className="mt-auto pt-4">
        {isOwn ? (
          <p className="rounded-xl bg-surface px-3 py-2.5 text-center text-sm font-medium text-muted">{t("state.yours")}</p>
        ) : mine ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone={mine.status === "pending" ? "warning" : "info"}>
              {mine.status === "pending" ? t("state.pending") : t("state.marketing")}
            </Badge>
            <form action={drop}>
              <input type="hidden" name="engagementId" value={mine.id} />
              <button type="submit" className={buttonClass("secondary", "min-h-9 px-3 text-xs hover:border-danger hover:text-danger")}>
                {t("drop")}
              </button>
            </form>
          </div>
        ) : (
          <form action={pickUp}>
            <input type="hidden" name="offerId" value={o.id} />
            <button type="submit" className={buttonClass("primary", "w-full")}>{t("pickUp")}</button>
            <p className="mt-1.5 text-center text-[11px] text-muted">{t("pickUpHelp", { share })}</p>
          </form>
        )}
      </div>
    </article>
  );
}
