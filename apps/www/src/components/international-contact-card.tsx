import { initialsOf } from "@/lib/format";
import { displayTitle } from "@/lib/listings";
import { ChatIcon } from "./icons";
import { CountryBadge } from "./international-country";

/**
 * The country's person in charge.
 *
 * Shows who will answer — name and role, as the view provides them — and one
 * button. The button goes to the enquiry form, NOT straight to WhatsApp, and
 * the number itself is never printed: the enquiry has to be recorded before
 * the chat opens, and a link that skips the form would lose the lead.
 *
 * With no PIC configured for the country the card still renders, naming the
 * desk rather than a person, because the form below still works.
 */
export function InternationalContactCard({
  name,
  role,
  countryCode,
  countryName,
  labels,
}: {
  name: string | null;
  role: string | null;
  countryCode: string;
  countryName: string;
  labels: { title: string; deskName: string; deskBody: string; cta: string; help: string };
}) {
  const shown = name ? displayTitle(name) : null;
  const detail = shown ? role : labels.deskBody;

  return (
    <section
      aria-label={labels.title}
      className="mt-5 flex flex-col gap-4 rounded-card border border-line bg-surface-raised p-5 shadow-card sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <span
          aria-hidden
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-electric-soft text-sm font-bold text-electric"
        >
          {shown ? initialsOf(shown) : <ChatIcon className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {labels.title}
            <CountryBadge code={countryCode} name={countryName} className="normal-case tracking-normal" />
          </p>
          <p className="mt-1 break-words font-bold leading-snug">{shown ?? labels.deskName}</p>
          {detail && <p className="break-words text-sm text-muted">{detail}</p>}
        </div>
      </div>
      <div className="sm:max-w-56 sm:text-right">
        <a
          href="#enquiry"
          className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-electric px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-electric-strong sm:w-auto"
        >
          <ChatIcon className="h-4 w-4" />
          {labels.cta}
        </a>
        <p className="mt-1.5 text-xs text-muted">{labels.help}</p>
      </div>
    </section>
  );
}
