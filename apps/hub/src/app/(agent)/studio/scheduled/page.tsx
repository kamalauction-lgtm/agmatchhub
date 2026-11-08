import Link from "next/link";
import { getTranslations, getFormatter } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { cancelPost } from "../social-actions";

/**
 * The agent's publish queue: what is waiting, what went out, what failed and
 * why. Failures show Meta's error string — an agent whose 9pm post silently
 * vanished stops trusting the scheduler, so nothing here is hidden.
 */

type Row = {
  id: string;
  platform: string;
  caption: string;
  scheduled_at: string;
  status: string;
  last_error: string | null;
  social_accounts: { display_name: string | null; username: string | null } | null;
};

const STATUS_TONE: Record<string, string> = {
  scheduled: "bg-surface text-foreground",
  publishing: "bg-accent/15 text-warning",
  published: "bg-success/10 text-success",
  failed: "bg-danger/10 text-danger",
  canceled: "bg-surface text-muted",
};

export default async function ScheduledPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ scheduled?: string; canceled?: string; error?: string }>;
}) {
  await requireUser();
  const { scheduled, canceled, error } = await searchParams;
  const t = await getTranslations("studio.queue");
  const format = await getFormatter();

  const supabase = await createClient();
  const { data } = await supabase
    .from("scheduled_posts")
    .select(
      "id, platform, caption, scheduled_at, status, last_error, social_accounts (display_name, username)"
    )
    .order("scheduled_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as unknown as Row[];

  const notice =
    scheduled ? { tone: "success" as const, text: t("scheduledNotice") }
    : canceled ? { tone: "success" as const, text: t("canceledNotice") }
    : error ? { tone: "warn" as const, text: t(`errors.${error}` as never) }
    : null;

  return (
    <AgentShell>
      <Link href="/studio" className="text-sm font-medium text-muted hover:text-crimson">
        ← {t("back")}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t("intro")}</p>

      {notice && (
        <p
          className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${
            notice.tone === "success" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
          }`}
        >
          {notice.text}
        </p>
      )}

      {!rows.length ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => {
            const account = p.social_accounts;
            const accountLabel =
              p.platform === "instagram_business" && account?.username
                ? `@${account.username}`
                : (account?.display_name ?? "—");
            return (
              <article key={p.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    <span aria-hidden className="mr-1.5">
                      {p.platform === "instagram_business" ? "📸" : "📘"}
                    </span>
                    {accountLabel}
                    <span className="ml-2 font-normal text-muted">
                      {format.dateTime(new Date(p.scheduled_at), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      STATUS_TONE[p.status] ?? "bg-surface"
                    }`}
                  >
                    {t(`status.${p.status}` as never)}
                  </span>
                </div>

                <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-muted">
                  {p.caption}
                </p>

                {p.status === "failed" && p.last_error && (
                  <p className="mt-2 rounded-lg bg-danger/5 px-3 py-2 text-xs text-muted">
                    {t("failedReason", { reason: p.last_error })}
                  </p>
                )}

                {p.status === "scheduled" && (
                  <form action={cancelPost} className="mt-3">
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:border-danger hover:text-danger"
                    >
                      {t("cancel")}
                    </button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </AgentShell>
  );
}
