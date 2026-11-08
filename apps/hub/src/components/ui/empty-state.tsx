import type { ReactNode } from "react";

/**
 * Empty state (Phase 1 foundation). Takes its text from the caller, so every
 * string still comes from messages/* in id, en and ms. No strings live here.
 */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-card px-6 py-10 text-center ${className}`}
    >
      {icon ? <div aria-hidden className="text-3xl">{icon}</div> : null}
      <p className="font-semibold text-foreground">{title}</p>
      {children ? <div className="max-w-prose text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
