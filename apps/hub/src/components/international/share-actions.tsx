"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";

/**
 * "Send this to a buyer": copy the public marketplace link, hand it to the
 * phone's share sheet where there is one, or open WhatsApp with the link in
 * a ready message. Rendered only when a marketplace URL is configured — the
 * caller passes a real link or does not render this at all.
 *
 * Words come in as props so no translation namespace ships to the browser.
 */

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue";
const noop = () => () => {};

export function ShareActions({
  url,
  title,
  message,
  labels,
}: {
  url: string;
  title: string;
  /** Ready text for the buyer; the link is appended here. */
  message: string;
  labels: { copy: string; copied: string; share: string; whatsapp: string; open: string; linkLabel: string };
}) {
  const [copied, setCopied] = useState(false);
  // The share sheet exists only in some browsers; false on the server.
  const canShare = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link stays visible and selectable below */
    }
  }

  async function share() {
    try {
      await navigator.share({ title, text: message, url });
    } catch {
      /* dismissed */
    }
  }

  const secondary = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-strong bg-card px-4 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-surface ${FOCUS}`;

  return (
    <div data-intl-share>
      <label htmlFor="intl-share-link" className="text-xs font-semibold text-muted-strong">{labels.linkLabel}</label>
      <input
        id="intl-share-link"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className={`mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 font-mono text-xs text-foreground outline-none ${FOCUS}`}
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <button type="button" onClick={copy} className={secondary}>
          <Icon name={copied ? "check" : "link"} size={18} />
          <span aria-live="polite">{copied ? labels.copied : labels.copy}</span>
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${message}\n${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-success-fill px-4 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90 ${FOCUS}`}
        >
          <Icon name="message-circle" size={18} />
          {labels.whatsapp}
        </a>
        {canShare && (
          <button type="button" onClick={share} className={secondary}>
            <Icon name="send" size={18} />
            {labels.share}
          </button>
        )}
        <a href={url} target="_blank" rel="noopener noreferrer" className={secondary}>
          <Icon name="external-link" size={18} />
          {labels.open}
        </a>
      </div>
    </div>
  );
}
