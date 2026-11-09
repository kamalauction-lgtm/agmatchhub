import type { HTMLAttributes } from "react";

/**
 * Shared command header (futuristic pilot). The one dark top band used by the
 * agent pages. Colours come from the `--command-*` tokens in globals.css, so
 * the band is identical in light and dark mode. Pages pass their own title,
 * summary and actions as children; nothing about them is decided here.
 */
export function CommandHeader({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <header
      className={`command-band overflow-hidden rounded-3xl p-6 shadow-card sm:p-8 ${className}`}
      {...props}
    />
  );
}
