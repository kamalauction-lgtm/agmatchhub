import { getTranslations } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { createAnnouncement, setAnnouncementPublished, deleteAnnouncement } from "./actions";

/**
 * Announcements.
 *
 * Two-step by design: compose a draft, see how many people the audience rule
 * matches, then publish. A broadcast cannot be recalled from the people who
 * already read it, so the count between the two steps is the point.
 *
 * In-app only for now. The audience rule and the delivery split are the parts
 * that would be shared with WhatsApp or email later — nothing here assumes
 * the channel. SMS is never added (platform rule 11).
 */

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  body: string;
  severity: string;
  audience: string;
  is_published: boolean;
  created_at: string;
};

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireCapability("platform.configure");
  const { notice } = await searchParams;
  const t = await getTranslations("announcements");
  const supabase = await createClient();

  const [{ data: rows }, { data: agencies }, { data: campaigns }, { data: countries }, { data: plans }] =
    await Promise.all([
      supabase
        .from("announcements")
        .select("id, title, body, severity, audience, is_published, created_at")
        .order("created_at", { ascending: false })
        .limit(40),
      supabase.from("agencies").select("id, name").order("name"),
      supabase.from("growth_campaigns").select("id, name").order("name"),
      supabase.from("countries").select("code, name").order("name"),
      supabase.from("plans").select("key, name").order("rank"),
    ]);

  const list = (rows ?? []) as Row[];

  // Audience reach for each, so the list answers "who would see this" without
  // opening anything. Same function the delivery uses.
  const reach = new Map<string, number>();
  for (const r of list) {
    const { data } = await supabase.rpc("announcement_audience_count", { p_announcement: r.id });
    reach.set(r.id, Number(data ?? 0));
  }

  const input =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson";

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {notice && (
        <p
          className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${
            ["created", "published", "unpublished", "deleted"].includes(notice)
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning"
          }`}
        >
          {t(`notice.${notice}` as never)}
        </p>
      )}

      {/* Compose ---------------------------------------------------------- */}
      <section className="mb-9 rounded-xl border border-line p-6">
        <h2 className="font-semibold">{t("composeTitle")}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">{t("composeHint")}</p>

        <form action={createAnnouncement} className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-semibold sm:col-span-2">
            {t("titleLabel")}
            <input name="title" required maxLength={140} className={input} />
          </label>
          <label className="block text-xs font-semibold">
            {t("severity")}
            <select name="severity" defaultValue="info" className={input}>
              <option value="info">{t("sev.info")}</option>
              <option value="important">{t("sev.important")}</option>
              <option value="critical">{t("sev.critical")}</option>
            </select>
            {/* Said out loud, because overusing critical is how people stop
                reading them. */}
            <span className="mt-1 block text-xs font-normal text-muted">{t("severityHint")}</span>
          </label>

          <label className="block text-xs font-semibold sm:col-span-3">
            {t("bodyLabel")}
            <textarea name="body" required rows={3} maxLength={2000} className={input} />
          </label>

          <label className="block text-xs font-semibold">
            {t("audience")}
            <select name="audience" defaultValue="all" className={input}>
              {["all", "verified", "unverified", "agency", "country", "plan", "campaign", "inactive"].map((a) => (
                <option key={a} value={a}>{t(`aud.${a}` as never)}</option>
              ))}
            </select>
          </label>

          {/* All target selectors are always present. Which one matters is
              decided server-side by the chosen audience, and the action
              refuses a targeted audience with no target rather than sending
              to nobody. */}
          <label className="block text-xs font-semibold">
            {t("organisation")}
            <select name="agencyId" className={input}>
              <option value="">—</option>
              {(agencies ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold">
            {t("country")}
            <select name="countryCode" className={input}>
              <option value="">—</option>
              {(countries ?? []).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold">
            {t("plan")}
            <select name="planKey" className={input}>
              <option value="">—</option>
              {(plans ?? []).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold">
            {t("campaign")}
            <select name="campaignId" className={input}>
              <option value="">—</option>
              {(campaigns ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold">
            {t("inactiveDays")}
            <input name="inactiveDays" type="number" min={1} max={3650} placeholder="30" className={input} />
          </label>

          <div className="sm:col-span-3">
            <button
              type="submit"
              className="min-h-11 cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-crimson-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
            >
              {t("saveDraft")}
            </button>
          </div>
        </form>
      </section>

      {/* List ------------------------------------------------------------- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("listTitle")}
        </h2>
        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-muted">
            {t("empty")}
          </p>
        ) : (
          <ul className="space-y-3">
            {list.map((a) => (
              <li key={a.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          a.severity === "critical"
                            ? "bg-danger/10 text-danger"
                            : a.severity === "important"
                              ? "bg-warning/10 text-warning"
                              : "bg-surface text-muted"
                        }`}
                      >
                        {t(`sev.${a.severity}` as never)}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          a.is_published ? "bg-success/10 text-success" : "bg-surface text-muted"
                        }`}
                      >
                        {a.is_published ? t("published") : t("draft")}
                      </span>
                      <span className="text-xs text-muted">
                        {t("reaches", { count: reach.get(a.id) ?? 0, audience: t(`aud.${a.audience}` as never) })}
                      </span>
                    </div>
                    <p className="mt-1.5 font-semibold">{a.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{a.body}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <form action={setAnnouncementPublished}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="publish" value={a.is_published ? "false" : "true"} />
                      <button
                        type="submit"
                        className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold transition-colors duration-200 hover:border-crimson hover:text-crimson"
                      >
                        {a.is_published ? t("unpublish") : t("publish")}
                      </button>
                    </form>
                    {!a.is_published && (
                      <form action={deleteAnnouncement}>
                        <input type="hidden" name="id" value={a.id} />
                        <button
                          type="submit"
                          className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold text-muted transition-colors duration-200 hover:border-danger hover:text-danger"
                        >
                          {t("delete")}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
