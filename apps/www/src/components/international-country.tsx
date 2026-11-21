/**
 * How a country is shown everywhere in the International section: its
 * two-letter code as a small chip, then its name in the page's language.
 *
 * No flag emoji — Windows renders them as the two letters anyway, in a font
 * that does not match — and no country list: the name comes from
 * `countryName()` (Intl.DisplayNames), the code from the listing.
 */
export function CountryBadge({
  code,
  name,
  className = "",
}: {
  code: string;
  name: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <span
        aria-hidden
        className="shrink-0 rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] font-bold leading-4 tracking-wider text-background"
      >
        {code}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}
