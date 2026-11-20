"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * What a visitor sees when a page throws. Added 20 Nov 2026 after the first
 * load following a release showed Next's bare "This page couldn't load" screen
 * and a reload a few seconds later was fine.
 *
 * A failure right after a release is usually the old and new builds briefly
 * overlapping, so the page reloads itself once. The timestamp guard means a
 * page that is genuinely broken reloads once and then stays on this screen
 * instead of looping.
 *
 * The copy lives here, not in messages/: an error boundary must be a client
 * component, the client bundle carries no dictionary (see app/layout.tsx), and
 * global-error renders with no layout or provider at all.
 */

const COPY = {
  en: { title: "This page didn't load", body: "It is usually a brief hiccup. Reload to try again; your work on other pages is not affected.", reload: "Reload" },
  id: { title: "Halaman ini gagal dimuat", body: "Biasanya hanya gangguan sesaat. Muat ulang untuk mencoba lagi; pekerjaan Anda di halaman lain tidak terpengaruh.", reload: "Muat ulang" },
  ms: { title: "Halaman ini gagal dimuatkan", body: "Biasanya gangguan seketika sahaja. Muat semula untuk cuba lagi; kerja anda di halaman lain tidak terjejas.", reload: "Muat semula" },
} as const;

const KEY = "hub:error-reload-at";
const WINDOW_MS = 60_000;

const noop = () => () => {};

/**
 * The page's language is only known in the browser (the server renders this
 * component with no document), so the server and the first client pass use
 * English and the copy switches once the document's language can be read.
 */
export function useErrorCopy() {
  const lang = useSyncExternalStore(noop, () => document.documentElement.lang.slice(0, 2), () => "en");
  return COPY[lang as keyof typeof COPY] ?? COPY.en;
}

/** Reloads once per minute at most; does nothing when storage is unavailable. */
export function useReloadOnce(error: unknown) {
  useEffect(() => {
    console.error(error);
    try {
      const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
      if (Date.now() - last > WINDOW_MS) {
        window.sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      /* private mode or blocked storage: stay on the message */
    }
  }, [error]);
}
