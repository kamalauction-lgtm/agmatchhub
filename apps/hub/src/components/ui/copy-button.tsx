"use client";

import { useState } from "react";

/** Copies `text` to the clipboard and says so for two seconds. */
export function CopyButton({ text, label, copiedLabel, className = "" }: { text: string; label: string; copiedLabel: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* text stays selectable */ }
      }}
      className={`rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold hover:bg-surface ${className}`}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
