import {
  AreaIcon,
  BathIcon,
  BedIcon,
  BuildingIcon,
  CalendarIcon,
  DocumentIcon,
  HomeIcon,
} from "./icons";

/**
 * Key facts for a project page.
 *
 * The local `KeyFacts` grid tops out at five cells and draws its hairlines
 * with the parent's background, which leaves a grey hole whenever the count
 * does not fill a row. A project can state seven facts or two, so these are
 * separate tiles: any count wraps cleanly and nothing is drawn for a fact the
 * listing does not state.
 */

export type InternationalFact = {
  key: string;
  icon: "type" | "bed" | "bath" | "area" | "tenure" | "completion" | "developer";
  label: string;
  value: string;
};

const ICONS = {
  type: HomeIcon,
  bed: BedIcon,
  bath: BathIcon,
  area: AreaIcon,
  tenure: DocumentIcon,
  completion: CalendarIcon,
  developer: BuildingIcon,
};

export function InternationalFacts({ title, facts }: { title: string; facts: InternationalFact[] }) {
  if (!facts.length) return null;
  const odd = facts.length % 2 === 1;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        {facts.map((f, i) => {
          const Icon = ICONS[f.icon];
          return (
            <div
              key={f.key}
              className={`min-w-0 rounded-xl border border-line bg-surface-raised px-4 py-3.5 shadow-card ${
                odd && i === facts.length - 1 ? "col-span-2 md:col-span-1" : ""
              }`}
            >
              <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Icon className="h-4 w-4 shrink-0" />
                {f.label}
              </dt>
              <dd className="mt-1 break-words text-base font-bold leading-snug">{f.value}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
