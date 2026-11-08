import type { HTMLAttributes } from "react";

/** Panel surface (Phase 1 foundation). Replaces hand-written card class strings over time. */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-line bg-card p-5 shadow-card ${className}`}
      {...props}
    />
  );
}
