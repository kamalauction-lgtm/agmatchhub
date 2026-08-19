import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { getAgentCard, cardUrl } from "@/lib/card/data";
import { CardView, type CardLabels } from "@/components/card/card-view";
import { SharePanel } from "@/components/listings/share-panel";
import { locales } from "@/i18n/request";

/**
 * "My name card" — the agent's own view. The preview below is the SAME
 * component the public page renders, so what the agent sees is exactly what
 * a contact receives at /c/<slug>.
 *
 * Content comes from the trust profile: the way to change the card is to
 * edit the profile, and the way to add buttons is to add social links with
 * visibility "public profile". The tip box says so instead of duplicating
 * those forms here.
 */

const PLATFORM_KEYS = [
  "facebook", "instagram", "linkedin", "tiktok", "youtube",
  "whatsapp", "telegram", "website", "agency_profile", "other",
] as const;

export default async function MyCardPage() {
  const user = await requireUser();
  const t = await getTranslations("card");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("public_slug, agent_status")
    .eq("id", user.id)
    .single();

  // The public views only carry verified agents — same gate as the card page.
  const card =
    profile?.public_slug && profile.agent_status === "verified"
      ? await getAgentCard(profile.public_slug)
      : null;

  // The preview promises "exactly what your contact sees", so its labels
  // follow the agent's language — same rule as the public page — while the
  // page chrome stays in the UI locale.
  const cardLang = (locales as readonly string[]).includes(card?.preferred_language ?? "")
    ? (card!.preferred_language as string)
    : undefined;
  const tc = cardLang
    ? await getTranslations({ locale: cardLang, namespace: "card" })
    : t;

  const labels: CardLabels = {
    verified: tc("verified"),
    listings: tc("listings"),
    viewListings: tc("viewListings"),
    saveContact: tc("saveContact"),
    share: tc("share"),
    copied: tc("copied"),
    platform: Object.fromEntries(PLATFORM_KEYS.map((k) => [k, tc(`platforms.${k}` as never)])),
  };

  return (
    <AgentShell>
      <h1 className="text-2xl font-semibold">{t("myTitle")}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t("myIntro")}</p>

      {!card ? (
        <div className="rounded-xl border border-dashed border-line p-8 text-center">
          <p className="text-sm text-muted">{t("notVerified")}</p>
          <Link
            href="/verification"
            className="mt-4 inline-block rounded-lg bg-crimson px-5 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
          >
            {t("verifyCta")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
          <div>
            <CardView card={card} labels={labels} />
          </div>

          <div className="space-y-4">
            <SharePanel
              url={cardUrl(card.public_slug)}
              caption={t("shareCaption", {
                name: card.display_name ?? "",
                url: cardUrl(card.public_slug),
              })}
              labels={{
                share: t("shareYourCard"),
                whatsapp: t("shareWhatsapp"),
                telegram: t("shareTelegram"),
                facebook: t("shareFacebook"),
                copy: t("copyLink"),
                copied: t("copied"),
                caption: t("shareCaptionLabel"),
              }}
            />

            <div className="rounded-xl border border-line p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("tipTitle")}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">{t("tipBody")}</p>
              <Link
                href="/profile"
                className="mt-3 inline-block rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-crimson hover:text-crimson"
              >
                {t("editProfile")}
              </Link>
            </div>

            <p className="text-xs text-muted">
              {t("publicUrl")}{" "}
              <a
                href={cardUrl(card.public_slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono font-medium text-crimson hover:underline"
              >
                /c/{card.public_slug}
              </a>
            </p>
          </div>
        </div>
      )}
    </AgentShell>
  );
}
