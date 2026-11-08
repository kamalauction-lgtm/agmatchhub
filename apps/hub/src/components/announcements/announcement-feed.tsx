import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { dismissAnnouncement } from "@/app/(agent)/dashboard/announcement-actions";

/**
 * What the platform is telling this agent right now.
 *
 * Reads `my_announcements()`, which resolves the audience rule and excludes
 * anything already read — so this renders nothing at all on a normal day. That
 * is the point: a banner strip that is always there stops being read, and the
 * only way to keep the critical ones working is for the ordinary ones to
 * disappear once acknowledged.
 *
 * Dismissing writes a read receipt for this person only. It never deletes and
 * never affects anyone else's copy.
 */

type Item = {
  id: string;
  title: string;
  body: string;
  severity: string;
  created_at: string;
};

const TONE: Record<string, string> = {
  critical: "border-danger/40 bg-danger/5",
  important: "border-warning/40 bg-warning/5",
  info: "border-line bg-surface",
};

export async function AnnouncementFeed() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_announcements");
  const items = (data ?? []) as Item[];
  if (items.length === 0) return null;

  const t = await getTranslations("announcements");

  return (
    <section className="mb-6 space-y-3">
      {items.map((a) => (
        <div
          key={a.id}
          className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 ${
            TONE[a.severity] ?? TONE.info
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{a.title}</p>
            <p className="mt-0.5 text-sm text-muted">{a.body}</p>
          </div>
          <form action={dismissAnnouncement}>
            <input type="hidden" name="id" value={a.id} />
            <button
              type="submit"
              className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold text-muted transition-colors duration-200 hover:border-crimson hover:text-crimson focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
            >
              {t("dismiss")}
            </button>
          </form>
        </div>
      ))}
    </section>
  );
}
