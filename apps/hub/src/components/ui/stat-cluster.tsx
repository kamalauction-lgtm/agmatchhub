/**
 * Three-or-so counts inside a CommandHeader (MatchHub 2.0). Values are passed
 * in by the page from rows it already loaded; this component computes nothing.
 * Fixed light-on-dark colours match the band's `--command-*` tokens.
 */
export function StatCluster({ items }: { items: { value: string | number; label: string }[] }) {
  if (!items.length) return null;
  return (
    <dl className="flex flex-wrap gap-2">
      {items.map((it) => (
        <div
          key={it.label}
          className="min-w-[6.5rem] rounded-xl border border-white/15 bg-white/10 px-3 py-2"
        >
          <dd className="text-xl font-bold tabular-nums text-white">{it.value}</dd>
          <dt className="command-muted text-[11px]">{it.label}</dt>
        </div>
      ))}
    </dl>
  );
}
