import Link from "next/link";
import { ArrowRightIcon } from "./icons";

/**
 * One heading shape for every section on the site.
 *
 * The homepage previously repeated a slightly different heading block six
 * times — different sizes, some with a subtitle, one with a link styled as
 * text. Small inconsistencies like that are most of what makes a page read as
 * assembled rather than designed, and they compound as sections get added.
 *
 * The eyebrow is optional and deliberately quiet: it gives each band a label
 * without adding another loud line competing with the section title.
 */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-1.5 text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>

      {action && (
        <Link
          href={action.href}
          className="group inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-brand transition-colors duration-200 hover:text-brand-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {action.label}
          {/* Nudges on hover instead of scaling, so nothing around it shifts. */}
          <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
