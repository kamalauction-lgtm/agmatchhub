"use client";

import { useState } from "react";

/**
 * The two actions that make a digital card useful at a first meeting:
 * "save my contact" (a generated vCard — every phone knows what to do with a
 * .vcf) and "share this card" (native sheet on phones, copy on desktops).
 *
 * The vCard carries only what the card already shows publicly: name, agency
 * (when the identity is public), the card URL, and a phone number ONLY if the
 * agent published a WhatsApp link it can be read from. Nothing private is
 * reachable here — this component receives display data, not database rows.
 */

export type VCardData = {
  name: string;
  org: string | null;
  cardUrl: string;
  /** Digits parsed from a published wa.me link, if any. */
  phone: string | null;
};

export function CardActions({
  vcard,
  labels,
}: {
  vcard: VCardData;
  labels: { saveContact: string; share: string; copied: string };
}) {
  const [copied, setCopied] = useState(false);

  function saveContact() {
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${vcard.name}`,
      `N:${vcard.name};;;;`,
      vcard.org ? `ORG:${vcard.org}` : null,
      vcard.phone ? `TEL;TYPE=CELL:+${vcard.phone}` : null,
      `URL:${vcard.cardUrl}`,
      "END:VCARD",
    ].filter((l): l is string => !!l);

    const blob = new Blob([lines.join("\r\n")], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${vcard.name.replace(/[^\w-]+/g, "-")}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: vcard.name, url: vcard.cardUrl });
        return;
      } catch {
        /* sheet closed */
      }
    } else {
      try {
        await navigator.clipboard.writeText(vcard.cardUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* clipboard blocked */
      }
    }
  }

  return (
    <div className="flex flex-wrap justify-center gap-2">
      <button
        type="button"
        onClick={saveContact}
        className="rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
      >
        {labels.saveContact}
      </button>
      <button
        type="button"
        onClick={share}
        className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface"
      >
        {copied ? labels.copied : labels.share}
      </button>
    </div>
  );
}
