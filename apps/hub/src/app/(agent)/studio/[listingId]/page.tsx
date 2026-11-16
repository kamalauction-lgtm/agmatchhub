import Link from "next/link";
import { getCompanions } from "@/lib/ai/cast";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { getStudioListing, publicMediaUrl } from "@/lib/studio/listings";
import { schedulePost } from "../social-actions";
import { draftStudioCopy, draftVideoScript } from "../ai-actions";
import { writeWhatsappBroadcast, writeSocialCaption } from "@/lib/ai/listing-writer";
import { buildStudioInput } from "@/lib/studio/input";
import { copyLanguage } from "@/lib/ai/copy-language";
import { unitSuffix } from "@/lib/listings/vocabulary";
import { aiQuotaFor } from "@/lib/ai/engine";
import { money, place } from "@/lib/listings/format";
import { StudioWorkspace } from "@/components/studio/studio-workspace";

/**
 * The studio workspace: one listing, tabs of generated assets (module design
 * §5). Drafts come from the deterministic writer — no model, no invented
 * facts — and the agent edits before anything leaves.
 *
 * The copy's language follows the LISTING's `language` column, not the UI
 * locale (§4.5): an agent browsing in English still wants Indonesian copy for
 * an Indonesian buyer. Only the property-type label needs the dictionary, so
 * it is resolved against the listing's language explicitly.
 */
export default async function StudioWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { listingId } = await params;
  const { error } = await searchParams;

  const listing = await getStudioListing(user.id, listingId);
  if (!listing) notFound();

  // P0-d-1c: copy, labels and the poster follow the listing's stored
  // language; Malay is written in English for now, and the page says so.
  const copy = copyLanguage(listing.language);
  const copyLocale = copy.lang;
  const unit = unitSuffix(listing.measurement_unit);
  const [t, tt] = await Promise.all([
    getTranslations("studio"),
    getTranslations({ locale: copyLocale, namespace: "propertyTypes" }),
  ]);

  // Connected publish destinations — RLS scopes this to the signed-in agent.
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, platform, display_name, username")
    .eq("status", "active")
    .order("platform");

  const input = buildStudioInput(listing, (slug) => (tt.has(slug as never) ? tt(slug as never) : slug));
  const quota = await aiQuotaFor(user.id);

  // The deterministic floor; the AI Marketing Studio button fills every tab
  // from the same facts when the engine allows it.
  const caption = writeSocialCaption(input);
  const drafts = {
    whatsapp: writeWhatsappBroadcast(input),
    caption,
    facebook: caption,
    tiktok: "",
  };

  // Poster facts, in the listing's language like everything else. Plain text —
  // the canvas draws its own icons and hierarchy.
  const en = copyLocale === "en";
  const specParts = [
    listing.bedrooms ? `${listing.bedrooms} ${en ? "BR" : "KT"}` : null,
    listing.bathrooms ? `${listing.bathrooms} ${en ? "BA" : "KM"}` : null,
    listing.land_size && listing.building_size
      ? en
        ? `Land ${listing.land_size} / build ${listing.building_size} ${unit}`
        : `LT ${listing.land_size} / LB ${listing.building_size} ${unit}`
      : listing.building_size
        ? `${en ? "Build" : "LB"} ${listing.building_size} ${unit}`
        : listing.land_size
          ? `${en ? "Land" : "LT"} ${listing.land_size} ${unit}`
          : null,
  ].filter(Boolean);

  const poster = {
    imageUrl: publicMediaUrl(listing.cover_image_path),
    badge:
      listing.listing_type === "rent"
        ? en
          ? "For rent"
          : "Disewakan"
        : en
          ? "For sale"
          : "Dijual",
    price: listing.price !== null ? money(listing.currency, listing.price, listing.rent_period) : "",
    title: listing.title,
    place: place({
      regency_name: listing.regency_name,
      province_name: listing.province_name,
    }),
    specs: specParts.join(" · "),
    agentName: listing.agent_display_name ?? "",
    fileBase: listing.human_readable_id || listing.id,
  };

  const cast = await getCompanions(["reply_drafter", "caption_writer", "video_scriptwriter", "poster_designer", "brochure_writer"]);
  return (
    <AgentShell wide>
      <Link href="/studio" className="text-sm font-medium text-muted hover:text-crimson">
        ← {t("backToList")}
      </Link>

      <div className="mb-6 mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted">{listing.human_readable_id}</span>
            {listing.borrowed && (
              <span className="rounded-full bg-crimson-soft px-2 py-0.5 text-xs font-semibold text-crimson">
                {t("borrowedBadge")}
              </span>
            )}
          </div>
          <h1 className="mt-1 text-xl font-semibold">{listing.title}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {place({
              regency_name: listing.regency_name,
              province_name: listing.province_name,
            })}
            {listing.price !== null &&
              ` · ${money(listing.currency, listing.price, listing.rent_period)}`}
          </p>
        </div>
      </div>

      <p className="mb-4 text-sm text-muted">{t("workspaceIntro")}</p>

      {error && (
        <p className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">
          {t(`errors.${error}` as never)}
        </p>
      )}

      <StudioWorkspace
        companions={{ whatsapp: cast.reply_drafter, caption: cast.caption_writer, facebook: cast.caption_writer, tiktok: cast.video_scriptwriter, images: cast.poster_designer, brochure: cast.brochure_writer }}
        drafts={drafts}
        shareUrl={listing.share_url}
        listingId={listing.id}
        coverImageUrl={publicMediaUrl(listing.cover_image_path)}
        poster={poster}
        accounts={(accounts ?? []).map((a) => ({
          id: a.id,
          platform: a.platform as "facebook_page" | "instagram_business",
          label:
            a.platform === "instagram_business"
              ? `📸 ${a.username ? `@${a.username}` : a.display_name}`
              : `📘 ${a.display_name}`,
        }))}
        scheduleAction={schedulePost}
        aiAction={draftStudioCopy}
        videoAction={draftVideoScript}
        quota={quota ? { remaining: quota.remaining, total: quota.monthly_allowance } : null}
        labels={{
          copyNotice: copy.lang === "en" ? (copy.fallback ? t("copyLanguage.englishFallback") : t("copyLanguage.english")) : t("copyLanguage.indonesian"),
          tabWhatsapp: t("tabWhatsapp"),
          tabCaption: t("tabCaption"),
          tabFacebook: t("tabFacebook"),
          tabTiktok: t("tabTiktok"),
          tabImages: t("tabImages"),
          tabBrochure: t("tabBrochure"),
          tabVideo: t("video.tab"),
          videoHelp: t("video.help"),
          videoCta: t("video.cta"),
          videoWorking: t("video.working"),
          videoScene: t("video.scene"),
          videoShot: t("video.shot"),
          videoVoice: t("video.voice"),
          videoOnScreen: t("video.onScreen"),
          videoShotList: t("video.shotList"),
          videoSeconds: t.raw("video.seconds") as string,
          whatsappHelp: t("whatsappHelp"),
          captionHelp: t("captionHelp"),
          facebookHelp: t("facebookHelp"),
          tiktokHelp: t("tiktokHelp"),
          imagesHelp: t("imagesHelp"),
          brochureHelp: t("brochureHelp"),
          openBrochure: t("openBrochure"),
          brochureBlurb: t("brochureBlurb"),
          aiCta: t("ai.cta"),
          aiWorking: t("ai.working"),
          aiSource: t.raw("ai.source") as string,
          rulesSource: t("ai.rulesSource"),
          aiReasons: Object.fromEntries(
            ["quota", "daily_cap", "platform_cap", "circuit_open", "disabled", "feature_off", "unverified", "no_provider", "failed"].map(
              (r) => [r, t(`ai.reason.${r}` as never)],
            ),
          ),
          aiQuota: t.raw("ai.quota") as string,
          emptyTab: t("ai.emptyTab"),
          poster: {
            presetFeed: t("poster.presetFeed"),
            presetStory: t("poster.presetStory"),
            download: t("poster.download"),
            shareImage: t("poster.shareImage"),
            noCoverNote: t("poster.noCoverNote"),
            exportFailed: t("poster.exportFailed"),
            styleDark: t("poster.styleDark"),
            styleLight: t("poster.styleLight"),
            styleBand: t("poster.styleBand"),
          },
          // .raw: {count}/{max} are substituted in the client component.
          chars: t.raw("chars") as string,
          captionLimit: t.raw("captionLimit") as string,
          copy: t("copy"),
          copied: t("copied"),
          reset: t("reset"),
          sendWhatsapp: t("sendWhatsapp"),
          phoneWarning: t("phoneWarning"),
          shareSheet: t("shareSheet"),
          telegram: t("telegram"),
          x: t("shareX"),
          openInstagram: t("openInstagram"),
          openFacebook: t("openFacebook"),
          copiedHint: t("copiedHint"),
          scheduleTitle: t("scheduleTitle"),
          scheduleHelp: t("scheduleHelp"),
          scheduleAccount: t("scheduleAccount"),
          scheduleTime: t("scheduleTime"),
          scheduleCta: t("scheduleCta"),
          scheduleNoAccounts: t("scheduleNoAccounts"),
          igNeedsImage: t("igNeedsImage"),
        }}
      />

      <p className="mt-4 text-sm text-muted">
        <Link href="/studio/scheduled" className="font-medium text-crimson hover:underline">
          {t("queueLink")}
        </Link>
        {" · "}
        <Link href="/studio/accounts" className="font-medium text-crimson hover:underline">
          {t("accountsLink")}
        </Link>
      </p>
    </AgentShell>
  );
}
