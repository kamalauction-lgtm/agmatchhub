import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, capabilityCountries } from "@/lib/authz";
import { moderateListing, quarantinePhoto } from "./actions";

/**
 * Marketplace listing moderation queue (§28 step 7). Every field the
 * moderator sees is what the public would see — plus the agent identity,
 * which moderation legitimately needs.
 */

function publicMediaUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/${path}` : null;
}

type QueueRow = {
  id: string;
  human_readable_id: string;
  title: string;
  description: string | null;
  listing_type: string;
  price: number;
  currency: string;
  rent_period: string | null;
  status: string;
  created_at: string;
  properties: {
    property_type: string;
    ownership_type: string | null;
    general_address: string | null;
    regency_name: string | null;
    province_name: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    building_size: number | null;
    land_size: number | null;
  } | null;
  profiles: { display_name: string; agent_status: string } | null;
  listing_media: {
    id: string;
    processed_path: string | null;
    derived_thumb_path: string | null;
    processing_state: string;
    is_cover: boolean;
    position: number;
  }[];
};

export default async function ListingModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireCapability("listing.moderate");
  const { done, error } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("adminListings");

  const scope = await capabilityCountries("listing.moderate");
  let query = supabase
    .from("listings")
    .select(
      `id, human_readable_id, title, description, listing_type, price, currency,
       rent_period, status, created_at,
       properties!inner (country_code, property_type, ownership_type, general_address, regency_name,
                   province_name, bedrooms, bathrooms, building_size, land_size),
       profiles (display_name, agent_status),
       listing_media (id, processed_path, derived_thumb_path, processing_state, is_cover, position)`
    )
    .eq("status", "pending_review")
    .order("created_at", { ascending: true })
    .limit(50);
  if (scope) query = query.in("properties.country_code", scope);
  const { data } = await query;

  // Photos the agent removed (00112) are kept as evidence but are not part of the listing.
  const rows = ((data ?? []) as unknown as QueueRow[]).map((r) => ({
    ...r,
    listing_media: r.listing_media.filter((m) => m.processing_state !== "removed"),
  }));

  // Processed imported photos are private until approval (00109): preview them
  // through short-lived signed links, which the 00108 policy grants only to
  // moderators of the listing's country.
  const previews = new Map<string, string>();
  const toSign = rows.flatMap((r) => r.listing_media)
    .filter((m) => m.processing_state === "processed" && m.derived_thumb_path)
    .map((m) => ({ id: m.id, path: m.derived_thumb_path!.replace(/^listing-media-intake\//, "") }));
  if (toSign.length) {
    const { data: signed } = await supabase.storage
      .from("listing-media-intake")
      .createSignedUrls(toSign.map((x) => x.path), 600);
    (signed ?? []).forEach((s, i) => { if (s.signedUrl) previews.set(toSign[i].id, s.signedUrl); });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-sm text-muted">{t("pending", { count: rows.length })}</p>

      {done && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t(done === "approve" ? "approved" : done === "quarantined" ? "quarantined" : "rejected")}
        </p>
      )}
      {error && (
        <p className="mb-6 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {t(`errors.${error}` as never)}
        </p>
      )}

      {!rows.length ? (
        <p className="rounded-xl border border-line bg-surface p-10 text-center text-sm text-muted">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-6">
          {rows.map((l) => {
            const p = l.properties;
            const cover = [...l.listing_media].sort(
              (a, b) => Number(b.is_cover) - Number(a.is_cover) || a.position - b.position
            )[0];
            const coverUrl = publicMediaUrl(cover?.processed_path ?? null);

            return (
              <article key={l.id} className="overflow-hidden rounded-xl border border-line">
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
                  <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-lg bg-surface sm:w-56">
                    {coverUrl ? (
                      <Image src={coverUrl} alt={l.title} fill unoptimized className="object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-muted">
                        {t("noPhoto")}
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold">
                      {l.listing_media.length} 📷
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-muted">{l.human_readable_id}</p>
                    <h2 className="mt-1 font-semibold">{l.title}</h2>
                    <p className="mt-1 text-sm text-muted">
                      {[p?.general_address, p?.regency_name, p?.province_name]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </p>
                    <p className="mt-2 text-lg font-bold text-crimson">
                      {l.currency} {Number(l.price).toLocaleString("id-ID")}
                      {l.rent_period ? (l.rent_period === "monthly" ? "/bln" : "/thn") : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {p?.property_type} · {p?.ownership_type?.toUpperCase() ?? "—"} ·{" "}
                      {p?.bedrooms ?? "—"} KT · {p?.bathrooms ?? "—"} KM ·{" "}
                      {p?.building_size ?? p?.land_size ?? "—"} m²
                    </p>
                    {l.description && (
                      <p className="mt-2 line-clamp-3 text-sm">{l.description}</p>
                    )}
                    <p className="mt-2 text-xs text-muted">
                      {t("byAgent")}: <strong>{l.profiles?.display_name ?? "—"}</strong>
                      {l.profiles?.agent_status === "verified" && " ✓"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-line bg-surface p-4 sm:flex-row sm:items-end">
                  {l.listing_media.some((m) => previews.has(m.id) || ["pending", "processing", "failed"].includes(m.processing_state)) && (
                    <div className="mb-3">
                      <p className="mb-2 text-xs font-semibold text-muted">{t("photos.title")}</p>
                      <ul className="flex flex-wrap gap-3">
                        {l.listing_media.filter((m) => m.processing_state !== "ready").map((m) => (
                          <li key={m.id} className="w-28 text-xs">
                            {previews.has(m.id) ? (
                              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                              <img src={previews.get(m.id)} alt="" className="h-20 w-28 rounded object-cover" />
                            ) : (
                              <div className="flex h-20 w-28 items-center justify-center rounded bg-surface text-muted">{t(`photos.state.${m.processing_state}` as never)}</div>
                            )}
                            {m.processing_state !== "quarantined" && (
                              <form action={quarantinePhoto} className="mt-1">
                                <input type="hidden" name="mediaId" value={m.id} />
                                <button type="submit" className="cursor-pointer text-xs text-muted underline hover:text-danger">{t("photos.quarantine")}</button>
                              </form>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs text-muted">{t("photos.note")}</p>
                    </div>
                  )}
                  <form action={moderateListing} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                    <input type="hidden" name="listingId" value={l.id} />
                    <div className="flex-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor={`r-${l.id}`}>
                        {t("reason")}
                      </label>
                      <input
                        id={`r-${l.id}`}
                        name="reason"
                        maxLength={1000}
                        placeholder={t("reasonPlaceholder")}
                        className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        name="decision"
                        value="approve"
                        className="rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                      >
                        {t("approve")}
                      </button>
                      <button
                        type="submit"
                        name="decision"
                        value="reject"
                        className="rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                      >
                        {t("reject")}
                      </button>
                    </div>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
