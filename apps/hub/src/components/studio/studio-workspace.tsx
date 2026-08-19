"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { PosterCanvas, type PosterData, type PosterLabels } from "./poster-canvas";

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
 */

/** Same rule the listing advisor enforces: a number in the copy bypasses lead
 *  capture and the response SLA. Generated drafts never contain one; this
 *  catches the agent typing one in. */
const PHONE = /(08\d{8,}|\+62[\s-]?8\d{7,})/;

/** Instagram's caption ceiling; pasting more truncates silently. */
const CAPTION_MAX = 2200;

export type StudioTextTabKey = "whatsapp" | "caption";
export type StudioTabKey = StudioTextTabKey | "images" | "brochure";

export type StudioAccount = {
  id: string;
  platform: "facebook_page" | "instagram_business";
  label: string;
};

export type StudioLabels = {
  tabWhatsapp: string;
  tabCaption: string;
  tabImages: string;
  tabBrochure: string;
  whatsappHelp: string;
  captionHelp: string;
  imagesHelp: string;
  brochureHelp: string;
  openBrochure: string;
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
};

export function StudioWorkspace({
  drafts,
  shareUrl,
  listingId,
  coverImageUrl,
  poster,
  accounts,
  scheduleAction,
  labels,
}: {
  drafts: Record<StudioTextTabKey, string>;
  shareUrl: string;
  listingId: string;
  coverImageUrl: string | null;
  poster: PosterData;
  accounts: StudioAccount[];
  scheduleAction: (fd: FormData) => void;
  labels: StudioLabels;
}) {
  const [tab, setTab] = useState<StudioTabKey>("whatsapp");
  const [text, setText] = useState<Record<StudioTextTabKey, string>>(drafts);
  const [copied, setCopied] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [when, setWhen] = useState("");

  // navigator.share exists on phones, not desktops; the server snapshot says
  // false so SSR and hydration agree, then the client snapshot takes over.
  const canShareSheet = useSyncExternalStore(
    () => () => {},
    () => !!navigator.share,
    () => false
  );

  const current = tab === "images" || tab === "brochure" ? "" : text[tab];
  const hasPhone = PHONE.test(current);
  const overCaptionLimit = tab === "caption" && current.length > CAPTION_MAX;

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const igWithoutImage =
    selectedAccount?.platform === "instagram_business" && !coverImageUrl;
  const whenIso = when ? new Date(when).toISOString() : "";

  const tabs: { key: StudioTabKey; label: string; help: string }[] = [
    { key: "whatsapp", label: labels.tabWhatsapp, help: labels.whatsappHelp },
    { key: "caption", label: labels.tabCaption, help: labels.captionHelp },
    { key: "images", label: labels.tabImages, help: labels.imagesHelp },
    { key: "brochure", label: labels.tabBrochure, help: labels.brochureHelp },
  ];

  async function copyText(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(current);
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

  return (
    <div className="rounded-xl border border-line">
      {/* Tabs ------------------------------------------------------------- */}
      <div role="tablist" className="flex border-b border-line">
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
            className={`px-4 py-3 text-sm font-semibold transition ${
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

        {tab === "brochure" && (
          <div className="mt-4">
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

        {tab !== "images" && tab !== "brochure" && (
          <>
        <textarea
          value={current}
          onChange={(e) =>
            setText((prev) => ({ ...prev, [tab as StudioTextTabKey]: e.target.value }))
          }
          rows={16}
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
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(current)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${btn} bg-[#229ED9] text-white hover:opacity-90`}
              >
                {labels.telegram}
              </a>
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
          {canShareSheet && (
            <button type="button" onClick={shareSheet} className={btnGhost}>
              {labels.shareSheet}
            </button>
          )}
          <button type="button" onClick={copyText} className={btnGhost}>
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

        {/* Schedule -------------------------------------------------------- */}
        {tab === "caption" && (
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

                {/* The queue receives EXACTLY this edited caption. */}
                <input type="hidden" name="accountId" value={accountId} />
                <input type="hidden" name="listingId" value={listingId} />
                <input type="hidden" name="caption" value={text.caption} />
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
