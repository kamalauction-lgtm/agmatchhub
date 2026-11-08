import Image from "next/image";
import { avatarUrl, initialsOf } from "@/lib/format";
import { CheckBadgeIcon } from "./icons";

/**
 * Who is advertising this property.
 *
 * The old version was a stack of bare lines — name, agency, badge — with no
 * photo, which read as a data dump rather than a person. On a portal the
 * buyer is choosing whether to trust someone enough to hand over their phone
 * number, and a face does more for that than any amount of copy.
 *
 * The photo comes from `agent_avatar_url` on the public view. That column was
 * always there; the page simply never used it, and `mediaUrl` would have
 * produced a broken URL if it had (see `avatarUrl`).
 *
 * Still no phone number. Contact goes through the enquiry form so consent,
 * assignment and the response SLA are recorded before anyone talks — the one
 * thing this card deliberately does NOT copy from 99.co, which puts Call and
 * WhatsApp buttons straight on the page.
 */

export function AgentCard({
  name,
  agencyName,
  avatarPath,
  isVerified,
  labels,
  children,
}: {
  name: string | null;
  agencyName: string | null;
  avatarPath: string | null;
  isVerified: boolean;
  labels: { listedBy: string; verified: string };
  children?: React.ReactNode;
}) {
  const photo = avatarUrl(avatarPath);
  const displayName = name ?? "—";

  return (
    <div className="rounded-card border border-line bg-surface-raised p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {labels.listedBy}
      </p>

      <div className="mt-3 flex items-center gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-brand-soft ring-1 ring-line">
          {photo ? (
            <Image src={photo} alt={displayName} fill sizes="56px" className="object-cover object-top" />
          ) : (
            /* Initials, not a silhouette icon: it still identifies the person
               and does not look like a broken image. */
            <span className="grid h-full w-full place-items-center text-lg font-bold text-brand">
              {initialsOf(name)}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <p className="truncate font-bold leading-tight">{displayName}</p>
          {agencyName && (
            <p className="mt-0.5 truncate text-sm text-muted">{agencyName}</p>
          )}
          {isVerified && (
            /* Green is reserved for exactly this in the token file — it is a
               signal that carries meaning, not decoration. */
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
              <CheckBadgeIcon className="h-3.5 w-3.5" />
              {labels.verified}
            </span>
          )}
        </div>
      </div>

      {children && <div className="mt-5 border-t border-line pt-5">{children}</div>}
    </div>
  );
}
