import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { money, place } from "@/lib/listings/format";
import { pickUpListing, dropListing } from "./pickup-actions";

/**
 * The co-marketing pool: listings other agents have opened up, under stated
 * commission terms, for anyone verified to market as their own inventory.
 *
 * This is the screen the whole module exists for. An agent with no mandates of
 * their own can assemble real stock here; an agent with more listings than
 * time can put them in front of a hundred other agents.
 *
 * What a browser sees is deliberately bounded (migration 00044): the property
 * facts, the photos, the listing agent's name and the commission terms — never
 * `property_private` (exact address, owner identity, the seller's floor) or
 * `comarketing_offer_private` (the advertised-price floor, internal notes).
 * Marketing a property does not make you party to the listing agent's
 * confidences.
 */

export const dynamic = "force-dynamic";

type OfferRow = {
  id: string;
  human_readable_id: string;
  listing_agent_id: string;
  total_commission_pct: number | null;
  marketing_agent_share_pct: number;
  payer: string;
  requires_la_approval: boolean;
  max_marketing_agents: number | null;
  notes: string | null;
  created_at: string;
  expires_at: string | null;
  listings: {
    id: string;
    human_readable_id: string;
    title: string;
    listing_type: string;
    price: number;
    currency: string;
    rent_period: string | null;
    properties: {
      property_type: string;
      property_category: string;
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

type Filters = {
  province?: string;
  type?: string;
  listingType?: string;
  minShare?: string;
  maxPrice?: string;
};

async function getPool(userId: string, f: Filters) {
  const supabase = await createClient();

  let query = supabase
    .from("comarketing_offers")
    .select(
      `id, human_readable_id, listing_agent_id, total_commission_pct, marketing_agent_share_pct,
       payer, requires_la_approval, max_marketing_agents, notes, created_at, expires_at,
       listings!inner (
         id, human_readable_id, title, listing_type, price, currency, rent_period,
         properties!inner (property_type, property_category, province_name, regency_name,
                           bedrooms, bathrooms, building_size, land_size)
       ),
       profiles!listing_agent_id (display_name)`
    )
    .eq("status", "active")
    .eq("scope", "open_pool")
    .order("created_at", { ascending: false })
    .limit(60);

  // Filters run in Postgres, not in the page — a pool that grows to thousands
  // of offers must not be fetched whole and thrown away in JavaScript.
  if (f.province) query = query.eq("listings.properties.province_name", f.province);
  if (f.type) query = query.eq("listings.properties.property_type", f.type);
  if (f.listingType) query = query.eq("listings.listing_type", f.listingType);
  if (f.minShare) query = query.gte("marketing_agent_share_pct", Number(f.minShare));
  if (f.maxPrice) query = query.lte("listings.price", Number(f.maxPrice));

  const [offers, mine] = await Promise.all([
    query,
    supabase
      .from("comarketing_engagements")
      .select("id, offer_id, status")
      .eq("marketing_agent_id", userId)
      .in("status", ["pending", "active", "paused"]),
  ]);

  if (offers.error) console.error("pool query failed", offers.error.message);

  return {
    offers: (offers.data ?? []) as unknown as OfferRow[],
    /** offer_id -> the agent's own engagement, so a card knows which state to show. */
    engagements: new Map(
      (mine.data ?? []).map((e) => [e.offer_id as string, e as { id: string; status: string }])
    ),
  };
}

/** Distinct provinces present in the pool, for the filter — no hard-coded list. */
async function getProvinces() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comarketing_offers")
    .select("listings!inner (properties!inner (province_name))")
    .eq("status", "active")
    .eq("scope", "open_pool")
    .limit(500);

  const names = new Set<string>();
  for (const row of (data ?? []) as unknown as {
    listings: { properties: { province_name: string | null } | null } | null;
  }[]) {
    const n = row.listings?.properties?.province_name;
    if (n) names.add(n);
  }
  return [...names].sort();
}

const PROPERTY_TYPES = [
  "rumah", "apartemen", "kondominium", "villa", "kost",
  "ruko", "rukan", "kantor", "toko", "hotel",
  "gudang", "pabrik", "tanah", "kavling", "lainnya",
] as const;

export default async function PoolPage({
  searchParams,
}: {
  searchParams: Promise<Filters & { picked?: string; dropped?: string; error?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const t = await getTranslations("pool");
  const tt = await getTranslations("propertyTypes");

  const [{ offers, engagements }, provinces] = await Promise.all([
    getPool(user.id, sp),
    getProvinces(),
  ]);

  const notice =
    sp.picked === "pending" ? { tone: "warn" as const, text: t("notice.pickedPending") }
    : sp.picked ? { tone: "success" as const, text: t("notice.picked") }
    : sp.dropped ? { tone: "success" as const, text: t("notice.dropped") }
    : sp.error ? { tone: "warn" as const, text: t(`errors.${sp.error}`) }
    : null;

  const filtered = Boolean(
    sp.province || sp.type || sp.listingType || sp.minShare || sp.maxPrice
  );

  return (
    <AgentShell wide>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Link
          href="/listings"
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-crimson hover:text-crimson"
        >
          {t("offerMine")}
        </Link>
        <Link
          href="/collab/partners"
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-crimson hover:text-crimson"
        >
          {t("partnersLink")}
        </Link>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-muted">{t("intro")}</p>

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

      {/* Filters ----------------------------------------------------------- */}
      <form
        action="/collab/pool"
        className="mb-6 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <label className="text-xs font-medium text-muted lg:col-span-2">
          {t("filter.province")}
          <select
            name="province"
            defaultValue={sp.province ?? ""}
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-crimson"
          >
            <option value="">{t("filter.any")}</option>
            {provinces.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-muted">
          {t("filter.type")}
          <select
            name="type"
            defaultValue={sp.type ?? ""}
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-crimson"
          >
            <option value="">{t("filter.any")}</option>
            {PROPERTY_TYPES.map((p) => (
              <option key={p} value={p}>{tt(p)}</option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-muted">
          {t("filter.listingType")}
          <select
            name="listingType"
            defaultValue={sp.listingType ?? ""}
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-crimson"
          >
            <option value="">{t("filter.any")}</option>
            <option value="sale">{t("filter.sale")}</option>
            <option value="rent">{t("filter.rent")}</option>
          </select>
        </label>

        <label className="text-xs font-medium text-muted">
          {t("filter.minShare")}
          <input
            name="minShare"
            type="number"
            min={0}
            max={99}
            defaultValue={sp.minShare ?? ""}
            placeholder="50"
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-crimson"
          />
        </label>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong"
          >
            {t("filter.apply")}
          </button>
          {filtered && (
            <Link
              href="/collab/pool"
              className="rounded-lg border border-line px-3 py-2 text-sm hover:border-crimson hover:text-crimson"
            >
              {t("filter.clear")}
            </Link>
          )}
        </div>
      </form>

      {/* Results ----------------------------------------------------------- */}
      <p className="mb-3 text-sm text-muted">{t("count", { count: offers.length })}</p>

      {!offers.length ? (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
          {filtered ? t("emptyFiltered") : t("empty")}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {offers.map((o) => {
            const l = o.listings;
            const p = l?.properties ?? null;
            const mine = engagements.get(o.id);
            // An agent's own offers are readable here (the pool policy does not
            // exclude them), and the guard refuses the pickup. Say so on the card
            // rather than offering a button that can only fail.
            const isOwn = o.listing_agent_id === user.id;
            const share = Number(o.marketing_agent_share_pct);

            return (
              <article key={o.id} className="rounded-xl border border-line p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-muted">
                      {l?.human_readable_id}
                    </span>
                    {p && (
                      <span className="rounded-full bg-surface px-2 py-0.5 text-xs">
                        {tt(p.property_type as never)}
                      </span>
                    )}
                    {o.requires_la_approval && (
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                        {t("badge.needsApproval")}
                      </span>
                    )}
                  </div>
                  <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-sm font-bold text-success">
                    {share}% {t("badge.yourShare")}
                  </span>
                </div>

                <h3 className="mt-2 font-semibold">{l?.title ?? "—"}</h3>
                <p className="mt-0.5 text-sm text-muted">{place(p)}</p>
                <p className="mt-1 font-bold text-crimson">
                  {l ? money(l.currency, l.price, l.rent_period) : "—"}
                </p>

                {p && (
                  <p className="mt-2 text-xs text-muted">
                    {[
                      p.bedrooms ? t("spec.beds", { n: p.bedrooms }) : null,
                      p.bathrooms ? t("spec.baths", { n: p.bathrooms }) : null,
                      p.building_size ? t("spec.built", { n: p.building_size }) : null,
                      p.land_size ? t("spec.land", { n: p.land_size }) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}

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
                    <dd className="font-medium">{t(`payer.${o.payer}`)}</dd>
                  </div>
                  {o.max_marketing_agents !== null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">{t("terms.maxAgents")}</dt>
                      <dd className="font-medium">{o.max_marketing_agents}</dd>
                    </div>
                  )}
                </dl>

                {o.notes && (
                  <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs text-muted">
                    {o.notes}
                  </p>
                )}

                <div className="mt-4">
                  {isOwn ? (
                    <p className="rounded-lg bg-surface px-3 py-2.5 text-center text-sm font-medium text-muted">
                      {t("state.yours")}
                    </p>
                  ) : mine ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-success">
                        {mine.status === "pending" ? t("state.pending") : t("state.marketing")}
                      </span>
                      <form action={dropListing}>
                        <input type="hidden" name="engagementId" value={mine.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:border-danger hover:text-danger"
                        >
                          {t("drop")}
                        </button>
                      </form>
                    </div>
                  ) : (
                    <form action={pickUpListing}>
                      <input type="hidden" name="offerId" value={o.id} />
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
                      >
                        {t("pickUp")}
                      </button>
                      <p className="mt-1.5 text-center text-[11px] text-muted">
                        {t("pickUpHelp", { share })}
                      </p>
                    </form>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AgentShell>
  );
}
