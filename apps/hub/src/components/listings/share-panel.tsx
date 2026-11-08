"use client";

import { useState } from "react";

/**
 * Share a listing to where Indonesian agents actually distribute: WhatsApp
 * first, then Telegram, then social.
 *
 * The caption is generated server-side and passed in, so this component stays
 * dumb — it only encodes and opens. Copy-to-clipboard exists because agents
 * paste into places we cannot deep-link (Instagram, TikTok, status updates).
 */
export function SharePanel({
  url,
  caption,
  labels,
}: {
  url: string;
  caption: string;
  labels: {
    share: string;
    whatsapp: string;
    telegram: string;
    facebook: string;
    copy: string;
    copied: string;
    caption: string;
  };
}) {
  const [copied, setCopied] = useState<"none" | "link" | "text">("none");

  const encodedCaption = encodeURIComponent(caption);
  const encodedUrl = encodeURIComponent(url);

  const targets = [
    {
      key: "whatsapp",
      label: labels.whatsapp,
      href: `https://wa.me/?text=${encodedCaption}`,
      className: "bg-success text-white",
    },
    {
      key: "telegram",
      label: labels.telegram,
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(caption)}`,
      className: "bg-[#229ED9] text-white",
    },
    {
      key: "facebook",
      label: labels.facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      className: "bg-[#1877F2] text-white",
    },
  ];

  async function copy(what: "link" | "text") {
    try {
      await navigator.clipboard.writeText(what === "link" ? url : caption);
      setCopied(what);
      setTimeout(() => setCopied("none"), 2000);
    } catch {
      /* clipboard blocked — the textarea below is still selectable */
    }
  }

  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {labels.share}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {targets.map((t) => (
          <a
            key={t.key}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded-lg px-3 py-2 text-sm font-semibold hover:opacity-90 ${t.className}`}
          >
            {t.label}
          </a>
        ))}
        <button
          type="button"
          onClick={() => copy("link")}
          className="rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface"
        >
          {copied === "link" ? labels.copied : labels.copy}
        </button>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-muted">
          {labels.caption}
        </summary>
        <textarea
          readOnly
          value={caption}
          rows={7}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs"
        />
        <button
          type="button"
          onClick={() => copy("text")}
          className="mt-1 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface"
        >
          {copied === "text" ? labels.copied : labels.copy}
        </button>
      </details>
    </div>
  );
}
