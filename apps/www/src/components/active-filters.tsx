import Link from "next/link";
import { CloseIcon } from "./icons";

/**
 * The filters currently narrowing the results, each removable on its own.
 *
 * Without this a buyer who has narrowed to "rumah, Bekasi, under 1 M, 3 beds"
 * has no way to widen by one step: the filters live in the query string and
 * the only visible escape is "clear everything". Showing them as chips makes
 * the state legible and each one reversible, which is the difference between
 * exploring a catalogue and fighting it.
 *
 * Plain links, so this works with JavaScript off and each removal is a real,
 * shareable URL.
 */

export type ActiveFilter = { key: string; label: string; removeHref: string };

export function ActiveFilters({
  filters,
  clearHref,
  clearLabel,
  removeLabelPrefix,
}: {
  filters: ActiveFilter[];
  clearHref: string;
  clearLabel: string;
  removeLabelPrefix: string;
}) {
  if (!filters.length) return null;

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <li key={f.key}>
          <Link
            href={f.removeHref}
            // The visible text is the filter; the accessible name says what
            // activating it does, which is not the same thing.
            aria-label={`${removeLabelPrefix} ${f.label}`}
            className="group inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface-raised py-1.5 pl-3 pr-2 text-sm font-medium transition-colors duration-200 hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {f.label}
            <CloseIcon className="h-3.5 w-3.5 text-muted transition-colors duration-200 group-hover:text-brand" />
          </Link>
        </li>
      ))}
      <li>
        <Link
          href={clearHref}
          className="cursor-pointer rounded-full px-2 py-1.5 text-sm font-semibold text-muted underline-offset-4 transition-colors duration-200 hover:text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {clearLabel}
        </Link>
      </li>
    </ul>
  );
}
