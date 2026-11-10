export type OfficeView = "office" | "list";

export function OfficeViewToggle({
  value,
  onChange,
  labels,
  dark = false,
}: {
  value: OfficeView;
  onChange: (v: OfficeView) => void;
  labels: { office: string; list: string; label: string };
  dark?: boolean;
}) {
  const btn = (v: OfficeView, text: string, icon: string) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={value === v}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors duration-150 ${
        value === v ? "bg-blue text-white shadow-card" : dark ? "text-white/80 hover:bg-white/10" : "text-muted-strong hover:bg-card"
      }`}
    >
      <span aria-hidden>{icon}</span>
      {text}
    </button>
  );
  return (
    <div role="group" aria-label={labels.label} className={`inline-flex gap-0.5 rounded-xl border p-0.5 ${dark ? "border-white/20 bg-white/10" : "border-line bg-surface"}`}>
      {btn("office", labels.office, "⬡")}
      {btn("list", labels.list, "☰")}
    </div>
  );
}
