import type { ButtonHTMLAttributes } from "react";

/**
 * Shared button (Phase 1 foundation). Token classes only.
 *
 * Primary uses `crimson-strong`, not `crimson`: white on #e53935 is 4.2:1,
 * under the 4.5:1 body-text minimum; white on #c62828 is 5.6:1.
 * Every size keeps a 44px tap target (min-h-11).
 */
const VARIANTS = {
  primary:
    "bg-crimson-strong text-white hover:opacity-90 disabled:opacity-50",
  accent:
    "bg-accent text-white hover:opacity-90 disabled:opacity-50",
  secondary:
    "border border-line-strong bg-card text-foreground hover:bg-surface disabled:opacity-50",
  ghost:
    "text-muted-strong hover:bg-surface disabled:opacity-50",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function buttonClass(variant: ButtonVariant = "primary", extra = "") {
  return [
    "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
    "disabled:cursor-not-allowed",
    VARIANTS[variant],
    extra,
  ].join(" ");
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}
