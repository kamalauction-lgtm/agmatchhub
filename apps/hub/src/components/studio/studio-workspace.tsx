"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { PosterCanvas, type PosterData, type PosterLabels } from "./poster-canvas";
import type { StudioAiResult } from "@/app/(agent)/studio/ai-actions";
import type { VideoScript } from "@/lib/ai/video-script";
import { CompanionBadge, type Companion } from "@/components/ai/companion";

/**
 * The Content Studio workspace: tabs over one listing, each holding a
 * generated draft the agent edits before anything leaves (module design §4.2 —
 * never auto-posted without the agent pressing the button, never rewritten).
 *
 * Three ways out of the textarea, in order of directness:
 *   1. Intents — WhatsApp/Telegram/X prefill the text in one tap.
 *   2. The native share sheet (mobile) — carries the caption into any
 *      installed app, including Instagram and Facebook, which offer no
 *      text-prefill URL. Copy-then-open is the desktop fallback.
 *   3. Scheduling — hands the exact edited caption to the publish queue for a
 *      connected FB Page / IG Business account.
 *
 * Drafts are generated server-side and passed in; labels arrive as props so
 * the message dictionary stays out of the browser bundle.
 *
 * AI MARKETING STUDIO (E3/E4)
 *   "Write with AI" asks the server action for every channel at once and
 *   fills the tabs; the deterministic drafts remain the Reset baseline. The
 *   status line says which assistant answered, or why the model did not.
 */

/** Same rule the listing advisor enforces: a number in the copy bypasses lead
 *  capture and the response SLA. Generated drafts never contain one; this
 *  catches the agent typing one in. */
const PHONE = /(08\d{8,}|\+62[\s-]?8\d{7,}|\+60[\s-]?1\d{8,})/;

/** Instagram's caption ceiling; pasting more truncates silently. */
const CAPTION_MAX = 2200;

export type StudioTextTabKey = "whatsapp" | "caption" | "facebook" | "tiktok";
export type StudioTabKey = StudioTextTabKey | "images" | "brochure" | "video";

export type StudioAccount = {
  id: string;
  platform: "facebook_page" | "instagram_business";
  label: string;
};

export type StudioLabels = {
  tabWhatsapp: string;
  tabCaption: string;
  tabFacebook: string;
  tabTiktok: string;
  tabImages: string;
  tabBrochure: string;
  tabVideo: string;
  videoHelp: string;
  videoCta: string;
  videoWorking: string;
  videoScene: string;
  videoShot: string;
  videoVoice: string;
  videoOnScreen: string;
  videoShotList: string;
  videoSeconds: string;
  whatsappHelp: string;
  captionHelp: string;
  facebookHelp: string;
  tiktokHelp: string;
  imagesHelp: string;
  brochureHelp: string;
  openBrochure: string;
  brochureBlurb: string;
  poster: PosterLabels;
  /** Raw templates; {count}/{max} substituted here. */
  chars: string;
  captionLimit: string;
  copy: string;
  copied: string;
  reset: string;
  sendWhatsapp: string;
  phoneWarning: string;
  shareSheet: string;
  telegram: string;
  x: string;
  openInstagram: string;
  openFacebook: string;
  copiedHint: string;
  scheduleTitle: string;
  scheduleHelp: string;
  scheduleAccount: string;
  scheduleTime: string;
  scheduleCta: string;
  scheduleNoAccounts: string;
  igNeedsImage: string;
  /** AI Marketing Studio */
  aiCta: string;
  aiWorking: string;
  /** `[model]` substituted here. */
  aiSource: string;
  rulesSource: string;
  aiReasons: Record<string, string>;
  /** `[remaining]`/`[total]` substituted here; empty string hides it. */
  aiQuota: string;
  emptyTab: string;
};

export function StudioWorkspace({
  companions,
  drafts,
  shareUrl,
  listingId,
  coverImageUrl,
  poster,
  accounts,
  scheduleAction,
  aiAction,
  videoAction,
  quota,
  labels,
}: {
  /** Who is at the agent's side on each tab: Mira (WhatsApp), Kira (captions), Neo (TikTok), Juno (posters), Atlas (brochure). */
  companions?: Partial<Record<string, Companion>>;
  drafts: Record<StudioTextTabKey, string>;
  /** Null when no valid marketplace URL is configured: the Telegram and Facebook share targets are hidden. */
  shareUrl: string | null;
  listingId: string;
  coverImageUrl: string | null;
  poster: PosterData;
  accounts: StudioAccount[];
  scheduleAction: (fd: FormData) => void;
  aiAction: (listingId: string) => Promise<StudioAiResult>;
  /** The Video Script Writer (00098): a 30-second walkthrough with a shot list. */
  videoAction: (listingId: string) => Promise<VideoScript>;
  quota: { remaining: number; total: number } | null;
  labels: StudioLabels;
}) {
  const [tab, setTab] = useState<StudioTabKey>("whatsapp");
  const [text, setText] = useState<Record<StudioTextTabKey, string>>(drafts);
  const [brochure, setBrochure] = useState("");
  const [ai, setAi] = useState<{ busy: boolean; source?: "ai" | "rules"; reason?: string; model?: string; error?: boolean }>({ busy: false });
  const [copied, setCopied] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [when, setWhen] = useState("");
  const [video, setVideo] = useState<VideoScript | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoErr, setVideoErr] = useState(false);

  async function writeVideo() {
    setVideoBusy(true); setVideoErr(false);
    try { setVideo(await videoAction(listingId)); } catch { setVideoErr(true); } finally { setVideoBusy(false); }
  }
  const videoText = video
    ? [video.title, "", `${labels.videoVoice}: ${video.hook}`, "", ...video.scenes.map((s, i) => `${i + 1}. [${s.seconds}s] ${labels.videoShot}: ${s.shot}\n   ${labels.videoVoice}: ${s.voice}${s.onScreen ? `\n   ${labels.videoOnScreen}: ${s.onScreen}` : ""}`), "", `CTA: ${video.cta}`, "", `${labels.videoShotList}:`, ...video.shotList.map((s) => `- ${s}`)].join("\n")
    : "";

  // navigator.share exists on phones, not desktops; the server snapshot says
  // false so SSR and hydration agree, then the client snapshot takes over.
  const canShareSheet = useSyncExternalStore(
    () => () => {},
    () => !!navigator.share,
    () => false
  );

  const isText = tab !== "images" && tab !== "brochure" && tab !== "video";
  const current = isText ? text[tab as StudioTextTabKey] : "";
  const hasPhone = PHONE.test(current);
  const overCaptionLimit = tab === "caption" && current.length > CAPTION_MAX;

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const igWithoutImage =
    selectedAccount?.platform === "instagram_business" && !coverImageUrl;
  const whenIso = when ? new Date(when).toISOString() : "";

  const tabs: { key: StudioTabKey; label: string; help: string }[] = [
    { key: "whatsapp", label: labels.tabWhatsapp, help: labels.whatsappHelp },
    { key: "caption", label: labels.tabCaption, help: labels.captionHelp },
    { key: "facebook", label: labels.tabFacebook, help: labels.facebookHelp },
    { key: "tiktok", label: labels.tabTiktok, help: labels.tiktokHelp },
    { key: "video", label: labels.tabVideo, help: labels.videoHelp },
    { key: "images", label: labels.tabImages, help: labels.imagesHelp },
    { key: "brochure", label: labels.tabBrochure, help: labels.brochureHelp },
  ];

  async function writeWithAi() {
    setAi({ busy: true });
    try {
      const r = await aiAction(listingId);
      setText({ whatsapp: r.texts.whatsapp, caption: r.texts.caption, facebook: r.texts.facebook, tiktok: r.texts.tiktok });
      setBrochure(r.texts.brochure);
      setAi({ busy: false, source: r.source, reason: r.reason, model: r.model });
    } catch {
      setAi({ busy: false, error: true });
    }
  }

  async function copyText(value = current): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      return false; // clipboard blocked — the textarea is still selectable
    }
  }

  /** IG and FB strip prefilled text by policy, so: copy first, then open. */
  async function copyThenOpen(url: string) {
    const ok = await copyText();
    if (ok) {
      setPasteHint(true);
      setTimeout(() => setPasteHint(false), 6000);
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function shareSheet() {
    try {
      await navigator.share({ text: current });
    } catch {
      /* user closed the sheet — nothing to do */
    }
  }

  const btn = "rounded-lg px-4 py-2.5 text-sm font-semibold";
  const btnGhost = `${btn} border border-line hover:bg-surface`;

  const statusLine = ai.error
    ? labels.aiReasons.failed
    : ai.source === "ai"
      ? labels.aiSource.replace("[model]", ai.model ?? "AI")
      : ai.source === "rules"
        ? (labels.aiReasons[ai.reason ?? "failed"] ?? labels.rulesSource)
        : null;

  return (
    <div className="rounded-xl border border-line">
      {/* AI Marketing Studio -------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/60 px-4 py-3">
        <div className="min-w-0 text-xs text-muted">
          <CompanionBadge c={companions?.[tab] ?? companions?.caption} className="mb-1" />
          {statusLine ? (
            <p>
              <span className={`mr-2 rounded-full px-2 py-0.5 font-semibold ${ai.source === "ai" ? "bg-indigo-soft text-indigo" : "bg-card text-muted"}`}>
                {ai.source === "ai" ? "✦ AI" : "✍︎"}
              </span>
              {statusLine}
            </p>
          ) : (
            <p>{labels.rulesSource}</p>
          )}
          {quota && labels.aiQuota && (
            <p className="mt-0.5 tabular-nums">
              {labels.aiQuota.replace("[remaining]", String(quota.remaining)).replace("[total]", String(quota.total))}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={writeWithAi}
          disabled={ai.busy}
          className={`${btn} bg-crimson text-white hover:bg-crimson-strong disabled:opacity-60`}
        >
          {ai.busy ? labels.aiWorking : `✦ ${labels.aiCta}`}
        </button>
      </div>

      {/* Tabs ------------------------------------------------------------- */}
      <div role="tablist" className="flex overflow-x-auto border-b border-line">
        {tabs.map((item) => (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={tab === item.key}
            onClick={() => {
              setTab(item.key);
              setCopied(false);
              setPasteHint(false);
            }}
            className={`shrink-0 px-4 py-3 text-sm font-semibold transition ${
              tab === item.key
                ? "border-b-2 border-crimson text-crimson"
                : "text-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-5">
        <p className="text-sm text-muted">{tabs.find((item) => item.key === tab)?.help}</p>

        {tab === "images" && (
          <div className="mt-3">
            <PosterCanvas data={poster} labels={labels.poster} />
          </div>
        )}

        {tab === "video" && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={writeVideo} disabled={videoBusy} className={`${btn} bg-crimson text-white hover:bg-crimson-strong disabled:opacity-60`}>
                {videoBusy ? labels.videoWorking : `✦ ${labels.videoCta}`}
              </button>
              {video && (
                <p className="text-xs text-muted">
                  <span className={`mr-2 rounded-full px-2 py-0.5 font-semibold ${video.source === "ai" ? "bg-indigo-soft text-indigo" : "bg-card text-muted"}`}>{video.source === "ai" ? "✦ AI" : "✍︎"}</span>
                  {video.source === "ai" ? labels.aiSource.replace("[model]", video.model ?? "AI") : (labels.aiReasons[video.reason ?? "failed"] ?? labels.rulesSource)}
                </p>
              )}
              {videoErr && <p className="text-xs text-danger">{labels.aiReasons.failed}</p>}
            </div>
            {video && (
              <>
                <p className="text-base font-semibold">{video.title}</p>
                <p className="rounded-lg bg-indigo-soft px-3 py-2 text-sm italic">“{video.hook}”</p>
                <ol className="space-y-2">
                  {video.scenes.map((s, i) => (
                    <li key={i} className="grid gap-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm sm:grid-cols-[4rem_1fr]">
                      <span className="text-xs font-semibold text-muted">{labels.videoScene} {i + 1} · {labels.videoSeconds.replace("{n}", String(s.seconds))}</span>
                      <div>
                        <p><span className="font-semibold">{labels.videoShot}:</span> {s.shot}</p>
                        <p><span className="font-semibold">{labels.videoVoice}:</span> {s.voice}</p>
                        {s.onScreen && <p className="text-xs text-muted"><span className="font-semibold">{labels.videoOnScreen}:</span> {s.onScreen}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="text-sm"><span className="font-semibold">CTA:</span> {video.cta}</p>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.videoShotList}</p>
                  <ul className="mt-1 list-disc pl-5 text-sm">{video.shotList.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
                <button type="button" onClick={() => copyText(videoText)} className={btnGhost}>{copied ? labels.copied : labels.copy}</button>
              </>
            )}
          </div>
        )}

        {tab === "brochure" && (
          <div className="mt-4 space-y-4">
            {/* The assistant's short blurb for the brochure; the print view
                itself still reads the listing. */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.brochureBlurb}</p>
              <textarea
                value={brochure}
                onChange={(e) => setBrochure(e.target.value)}
                rows={5}
                placeholder={labels.emptyTab}
                className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-6"
              />
              {brochure && (
                <button type="button" onClick={() => copyText(brochure)} className={`mt-2 ${btnGhost}`}>
                  {copied ? labels.copied : labels.copy}
                </button>
              )}
            </div>
            <a
              href={`/studio/${listingId}/brochure`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
            >
              {labels.openBrochure}
            </a>
          </div>
        )}

        {isText && (
          <>
        <textarea
          value={current}
          onChange={(e) =>
            setText((prev) => ({ ...prev, [tab as StudioTextTabKey]: e.target.value }))
          }
          rows={16}
          placeholder={labels.emptyTab}
          className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-6"
        />

        <p className="mt-1 text-xs text-muted">
          {labels.chars.replace("{count}", String(current.length))}
          {overCaptionLimit && (
            <span className="ml-2 font-semibold text-warning">
              {labels.captionLimit.replace("{max}", String(CAPTION_MAX))}
            </span>
          )}
        </p>

        {hasPhone && (
          <p className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
            {labels.phoneWarning}
          </p>
        )}

        {/* Send / share ---------------------------------------------------- */}
        <div className="mt-4 flex flex-wrap gap-2">
          {tab === "whatsapp" && (
            <a
              href={`https://wa.me/?text=${encodeURIComponent(current)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${btn} bg-success text-white hover:opacity-90`}
            >
              {labels.sendWhatsapp}
            </a>
          )}
          {tab === "caption" && (
            <>
              <button
                type="button"
                onClick={() => copyThenOpen("https://www.instagram.com/")}
                className={`${btn} bg-[#E1306C] text-white hover:opacity-90`}
              >
                {labels.openInstagram}
              </button>
              {shareUrl && (
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(current)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${btn} bg-[#229ED9] text-white hover:opacity-90`}
                >
                  {labels.telegram}
                </a>
              )}
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(current)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={btnGhost}
              >
                {labels.x}
              </a>
            </>
          )}
          {tab === "facebook" && shareUrl && (
            <button
              type="button"
              onClick={() =>
                copyThenOpen(
                  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
                )
              }
              className={`${btn} bg-[#1877F2] text-white hover:opacity-90`}
            >
              {labels.openFacebook}
            </button>
          )}
          {canShareSheet && (
            <button type="button" onClick={shareSheet} className={btnGhost}>
              {labels.shareSheet}
            </button>
          )}
          <button type="button" onClick={() => copyText()} className={btnGhost}>
            {copied ? labels.copied : labels.copy}
          </button>
          <button
            type="button"
            onClick={() =>
              setText((prev) => ({
                ...prev,
                [tab as StudioTextTabKey]: drafts[tab as StudioTextTabKey],
              }))
            }
            className={`${btn} border border-line text-muted hover:bg-surface`}
          >
            {labels.reset}
          </button>
        </div>

        {pasteHint && (
          <p className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success">
            {labels.copiedHint}
          </p>
        )}

        {/* Schedule — the caption tab for Instagram accounts, the Facebook
            tab for Pages; either way the queue receives EXACTLY the text
            in that tab. */}
        {(tab === "caption" || tab === "facebook") && (
          <div className="mt-6 rounded-xl border border-line bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {labels.scheduleTitle}
            </p>

            {!accounts.length ? (
              <p className="mt-2 text-sm text-muted">
                <Link href="/studio/accounts" className="font-semibold text-crimson hover:underline">
                  {labels.scheduleNoAccounts}
                </Link>
              </p>
            ) : (
              <form action={scheduleAction} className="mt-3">
                <p className="text-sm text-muted">{labels.scheduleHelp}</p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-muted">
                      {labels.scheduleAccount}
                    </span>
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm">
                    <span className="text-xs font-medium text-muted">{labels.scheduleTime}</span>
                    <input
                      type="datetime-local"
                      value={when}
                      onChange={(e) => setWhen(e.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                {igWithoutImage && (
                  <p className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
                    {labels.igNeedsImage}
                  </p>
                )}

                <input type="hidden" name="accountId" value={accountId} />
                <input type="hidden" name="listingId" value={listingId} />
                <input type="hidden" name="caption" value={text[tab as "caption" | "facebook"]} />
                <input type="hidden" name="imageUrl" value={coverImageUrl ?? ""} />
                <input type="hidden" name="scheduledAt" value={whenIso} />

                <button
                  type="submit"
                  disabled={!accountId || !when || igWithoutImage}
                  className={`mt-3 ${btn} ${
                    !accountId || !when || igWithoutImage
                      ? "cursor-not-allowed border border-line text-muted"
                      : "bg-crimson text-white hover:bg-crimson-strong"
                  }`}
                >
                  {labels.scheduleCta}
                </button>
              </form>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
