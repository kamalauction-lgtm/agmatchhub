"use client";

import { Icon } from "@/components/ui/icon";

/**
 * Light / dark switch. Added 21 Nov 2026 (owner: "where do I change it?").
 *
 * With no choice made, the app follows the device. A press writes the choice to
 * the `theme` cookie, which the root layout reads on the server and puts on
 * <html data-theme>, so the next page arrives already in the right colours with
 * no flash. Which icon shows is decided in CSS (.only-light / .only-dark), so
 * this component needs no state and renders the same on server and client.
 */
export function ThemeToggle({ label }: { label: string }) {
  function toggle() {
    const root = document.documentElement;
    const now = root.dataset.theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = now === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      data-theme-toggle="1"
      className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg border border-line text-muted-strong transition-colors duration-150 hover:border-blue hover:text-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
    >
      <Icon name="moon" size={20} className="only-light" />
      <Icon name="sun" size={20} className="only-dark" />
    </button>
  );
}
