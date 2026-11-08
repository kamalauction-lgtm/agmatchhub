import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { getAgentCard, getAgentCardListings, cardUrl } from "@/lib/card/data";
import { CardView, type CardLabels } from "@/components/card/card-view";
import { locales } from "@/i18n/request";

/**
 * The public digital name card: /c/<slug>. Master spec §71 — the shareable
 * face of the trust profile.
 *
 * Anonymous by design: this link travels in WhatsApp chats and QR scans, so
 * it renders without a session, from public views only. NOINDEX for the same
 * reason as the agent landing page — it is a sharing surface, not a search
 * surface.
 *
 * The card renders in the AGENT's preferred language, not the visitor's UI
 * cookie: the agent chose the words on their own card, and their audience is
 * the market they work in.
 */

const PLATFORM_KEYS = [
  "facebook", "instagram", "linkedin", "tiktok", "youtube",
  "whatsapp", "telegram", "website", "agency_profile", "other",
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const card = await getAgentCard(slug);
  return {
    title: card?.display_name ?? "—",
    robots: { index: false, follow: false },
  };
}

export default async function PublicCardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = await getAgentCard(slug);
  if (!card) notFound();

  const lang = (locales as readonly string[]).includes(card.preferred_language ?? "")
    ? (card.preferred_language as string)
    : undefined;
  const t = lang
    ? await getTranslations({ locale: lang, namespace: "card" })
    : await getTranslations("card");

  const labels: CardLabels = {
    verified: t("verified"),
    listings: t("listings"),
    viewListings: t("viewListings"),
    saveContact: t("saveContact"),
    share: t("share"),
    copied: t("copied"),
    recentListings: t("recentListings"),
    scanToSave: t("scanToSave"),
    activeListings: t("activeListings"),
    platform: Object.fromEntries(PLATFORM_KEYS.map((k) => [k, t(`platforms.${k}` as never)])),
  };

  /* Both are extras: a card that cannot reach the listings view or cannot
     draw a QR is still a valid card, so neither failure may take the page
     down with it. */
  const [listings, qrDataUrl] = await Promise.all([
    getAgentCardListings(card.id).catch(() => []),
    QRCode.toDataURL(cardUrl(card.public_slug), {
      width: 224,
      margin: 1,
      color: { dark: "#14181f", light: "#ffffff" },
    }).catch(() => null),
  ]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 py-8">
      <CardView card={card} labels={labels} listings={listings} qrDataUrl={qrDataUrl} />
    </main>
  );
}
