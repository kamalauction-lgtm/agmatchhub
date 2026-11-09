/**
 * Marks synthetic inventory. Shown wherever a demo listing's title is shown,
 * so a visitor to the staging preview can never mistake a fictional property
 * for stock. Production never carries these rows.
 */
export function DemoBadge({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-gold-light/70 bg-gold-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold-ink ${className}`}
      title={label}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
      {label}
    </span>
  );
}
