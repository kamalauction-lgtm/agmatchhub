import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { BannerManager } from "@/components/admin/banner-manager";
import type { BannerRow } from "@/components/admin/banner-form";

/**
 * Advertising banners on the public marketplace (migration 00047).
 *
 * Admin-only by RLS as well as by route: the policy on `site_banners` requires
 * `is_platform_admin()`, so this page failing open would still not let a
 * non-admin write a row.
 */

export const dynamic = "force-dynamic";

const LABEL_KEYS = [
  "create", "save", "cancel", "edit", "delete", "pause", "activate",
  "live", "paused", "empty", "preview", "adLabel", "titlePlaceholder",
  "confirmDelete",
  "slot", "slotTop", "slotMiddle", "slotTopHelp", "slotMiddleHelp",
  "headline", "subtitle", "advertiser", "advertiserHelp",
  "location", "price", "image", "imageHelp", "link", "cta",
  "startsAt", "endsAt", "position", "active", "activeHelp",
] as const;

export default async function BannersPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireCapability("commercial.manage");
  const { done, error } = await searchParams;
  const t = await getTranslations("adminBanners");
  const supabase = await createClient();

  const { data, error: readError } = await supabase
    .from("site_banners")
    .select(
      "id, slot, title, subtitle, advertiser_label, location_label, price_label, image_path, link_url, cta_label, position, is_active, starts_at, ends_at"
    )
    .order("slot", { ascending: true })
    .order("position", { ascending: true });

  if (readError) console.error("banner list failed", readError.message);

  // Passed down rather than read in the client component: next-intl's client
  // hooks would ship the whole namespace to the browser for thirty labels.
  const labels = Object.fromEntries(LABEL_KEYS.map((k) => [k, t(k)]));

  const notice = done
    ? { tone: "success" as const, text: t(`done.${done}`) }
    : error
      ? { tone: "warn" as const, text: t(`errors.${error}`) }
      : null;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {notice && (
        <p
          className={`mt-5 rounded-lg px-4 py-3 text-sm font-medium ${
            notice.tone === "success"
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning"
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="mt-6">
        <BannerManager
          banners={(data ?? []) as BannerRow[]}
          labels={labels}
          marketplaceUrl={
            process.env.NEXT_PUBLIC_MARKETPLACE_URL ?? ""
          }
        />
      </div>
    </>
  );
}
