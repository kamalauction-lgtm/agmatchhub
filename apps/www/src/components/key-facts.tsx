import { AreaIcon, BathIcon, BedIcon, HomeIcon, ParkingIcon } from "./icons";

/**
 * The facts a buyer scans before deciding to read anything else.
 *
 * Lifted straight above the fold because that is the first question about any
 * property — how big, how many rooms — and burying it in a specifications
 * table further down makes the page feel emptier than it is.
 *
 * Only facts the listing actually states are rendered. Nothing here shows a
 * dash or a zero standing in for missing data: an absent row is quieter and
 * more honest than a row that says nothing.
 */

export type Fact = { key: string; icon: "bed" | "bath" | "area" | "type" | "parking"; label: string; value: string };

const ICONS = {
  bed: BedIcon,
  bath: BathIcon,
  area: AreaIcon,
  type: HomeIcon,
  parking: ParkingIcon,
};

/**
 * Column counts, written out because Tailwind cannot see a computed class name.
 *
 * The grid used to be a hard `sm:grid-cols-4`. The hairlines between cells are
 * the parent's background showing through 1px gaps, so any unfilled cell
 * painted a grey rectangle that looked like a broken tile — and with no
 * bathroom recorded on a single listing in the catalogue, that phantom was on
 * every property page on the site.
 */
const COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-5",
};

export function KeyFacts({ facts }: { facts: Fact[] }) {
  if (!facts.length) return null;

  const columns = COLUMNS[Math.min(facts.length, 5)] ?? COLUMNS[4];
  // An odd count still leaves a hole in the two-column phone layout, so the
  // last fact widens to close it.
  const oddOnMobile = facts.length % 2 === 1 && facts.length > 1;

  return (
    <dl
      className={`mt-5 grid gap-px overflow-hidden rounded-card border border-line bg-line shadow-card ${columns}`}
    >
      {facts.map((f, i) => {
        const Icon = ICONS[f.icon];
        const last = i === facts.length - 1;
        return (
          <div
            key={f.key}
            className={`bg-surface-raised px-4 py-3.5 ${
              oddOnMobile && last ? "col-span-2 sm:col-span-1" : ""
            }`}
          >
            <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Icon className="h-4 w-4" />
              {f.label}
            </dt>
            <dd className="mt-1 text-lg font-bold leading-tight">{f.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}
