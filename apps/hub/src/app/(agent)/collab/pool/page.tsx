import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { CommandHeader } from "@/components/ui/command-header";
import { StatCluster } from "@/components/ui/stat-cluster";
import { EnvironmentBadge } from "@/components/ui/environment-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { OfferCard } from "@/components/collab/offer-card";
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

/** One flat row of pool_offer_cards (migration 00099). */
type PoolCardRow = {
  offer_id: string;
  offer_human_readable_id: string;
  listing_agent_id: string;
  listing_agent_display_name: string | null;
  total_commission_pct: number | null;
  marketing_agent_share_pct: number;
  payer: string;
  requires_la_approval: boolean;
  max_marketing_agents: number | null;
  notes: string | null;
  created_at: string;
  expires_at: string | null;
  listing_id: string;
  listing_human_readable_id: string;
  title: string;
  listing_type: string;
  price: number;
  currency: string;
  rent_period: string | null;
  property_type: string;
  property_category: string;
  province_name: string | null;
  regency_name: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  building_size: number | null;
  land_size: number | null;
};

/** Reshape a flat card row into the OfferRow the render code reads. */
function toOfferRow(r: PoolCardRow): OfferRow {
  return {
    id: r.offer_id,
    human_readable_id: r.offer_human_readable_id,
    listing_agent_id: r.listing_agent_id,
    total_commission_pct: r.total_commission_pct,
    marketing_agent_share_pct: r.marketing_agent_share_pct,
    payer: r.payer,
    requires_la_approval: r.requires_la_approval,
    max_marketing_agents: r.max_marketing_agents,
    notes: r.notes,
    created_at: r.created_at,
    expires_at: r.expires_at,
    listings: {
      id: r.listing_id,
      human_readable_id: r.listing_human_readable_id,
      title: r.title,
      listing_type: r.listing_type,
      price: r.price,
      currency: r.currency,
      rent_period: r.rent_period,
      properties: {
        property_type: r.property_type,
        property_category: r.property_category,
        province_name: r.province_name,
        regency_name: r.regency_name,
        bedrooms: r.bedrooms,
        bathrooms: r.bathrooms,
        building_size: r.building_size,
        land_size: r.land_size,
      },
    },
    profiles: r.listing_agent_display_name
      ? { display_name: r.listing_agent_display_name }
      : null,
  };
}

async function getPool(userId: string, f: Filters) {
  const supabase = await createClient();

  // Reads the 00099 projection: only card columns, never the listing's
  // moderation or ownership columns.
  let query = supabase
    .from("pool_offer_cards")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(60);

  // Filters run in Postgres, not in the page — a pool that grows to thousands
  // of offers must not be fetched whole and thrown away in JavaScript.
  if (f.province) query = query.eq("province_name", f.province);
  if (f.type) query = query.eq("property_type", f.type);
  if (f.listingType) query = query.eq("listing_type", f.listingType);
  if (f.minShare) query = query.gte("marketing_agent_share_pct", Number(f.minShare));
  if (f.maxPrice) query = query.lte("price", Number(f.maxPrice));

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
    offers: ((offers.data ?? []) as unknown as PoolCardRow[]).map(toOfferRow),
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
    .from("pool_offer_cards")
    .select("province_name")
    .limit(500);

  const names = new Set<string>();
  for (const row of (data ?? []) as { province_name: string | null }[]) {
    if (row.province_name) names.add(row.province_name);
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
  const tc = await getTranslations("common");

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
      {/* Command band: title, intro and three counts from the rows already loaded. */}
      <CommandHeader className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="command-muted mt-1 text-sm">{t("intro")}</p>
        </div>
        <StatCluster
          items={[
            { value: offers.length, label: t("band.inPool") },
            { value: engagements.size, label: t("band.youMarket") },
            { value: offers.filter((o) => o.requires_la_approval).length, label: t("band.needApproval") },
          ]}
        />
      </CommandHeader>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <EnvironmentBadge label={tc("environment.staging")} />
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href="/listings" className={buttonClass("secondary", "min-h-10")}>{t("offerMine")}</Link>
          <Link href="/collab/partners" className={buttonClass("secondary", "min-h-10")}>{t("partnersLink")}</Link>
        </div>
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

      {/* Filters ----------------------------------------------------------- */}
      <form
        action="/collab/pool"
        className="mb-6 grid gap-3 rounded-2xl border border-line bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-6"
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
          <button type="submit" className={buttonClass("primary", "min-h-10")}>{t("filter.apply")}</button>
          {filtered && (
            <Link href="/collab/pool" className={buttonClass("ghost", "min-h-10")}>{t("filter.clear")}</Link>
          )}
        </div>
      </form>

      {/* Results ----------------------------------------------------------- */}
      <p className="mb-3 text-sm text-muted">{t("count", { count: offers.length })}</p>

      {!offers.length ? (
        <EmptyState icon="✦" title={filtered ? t("emptyFiltered") : t("empty")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {offers.map((o) => {
            const p = o.listings?.properties ?? null;
            // An agent's own offers are readable here (the pool policy does not
            // exclude them), and the guard refuses the pickup. Say so on the card
            // rather than offering a button that can only fail.
            const isOwn = o.listing_agent_id === user.id;
            return (
              <OfferCard
                key={o.id}
                offer={o}
                propertyTypeLabel={p ? tt(p.property_type as never) : null}
                isOwn={isOwn}
                mine={engagements.get(o.id) ?? null}
                pickUp={pickUpListing}
                drop={dropListing}
              />
            );
          })}
        </div>
      )}
    </AgentShell>
  );
}
