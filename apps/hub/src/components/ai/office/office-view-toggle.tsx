export type OfficeView = "office" | "list";

export function OfficeViewToggle({
  value,
  onChange,
  labels,
}: {
  value: OfficeView;
  onChange: (v: OfficeView) => void;
  labels: { office: string; list: string; label: string };
}) {
  const btn = (v: OfficeView, text: string, icon: string) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={value === v}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors duration-150 ${
        value === v ? "bg-blue text-white shadow-card" : "text-muted-strong hover:bg-card"
      }`}
    >
      <span aria-hidden>{icon}</span>
      {text}
    </button>
  );
  return (
    <div role="group" aria-label={labels.label} className="inline-flex gap-0.5 rounded-xl border border-line bg-surface p-0.5">
      {btn("office", labels.office, "⬡")}
      {btn("list", labels.list, "☰")}
    </div>
  );
}
