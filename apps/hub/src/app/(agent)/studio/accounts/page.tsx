import Link from "next/link";
import { getTranslations, getFormatter } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { metaConfigured } from "@/lib/social/meta";
import { disconnectAccount } from "../social-actions";

/**
 * Connected publish destinations (FB Pages / IG Business accounts).
 *
 * Honest about its dependency: until the Meta developer app credentials are
 * configured, the connect button is replaced by an explanation, not an error
 * after three redirects.
 */
export default async function StudioAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; disconnected?: string; error?: string }>;
}) {
  await requireUser();
  const { connected, disconnected, error } = await searchParams;
  const t = await getTranslations("studio.accounts");
  const format = await getFormatter();
  const configured = metaConfigured();

  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, platform, display_name, username, status, connected_at, expires_at")
    .order("connected_at", { ascending: false });

  const rows = accounts ?? [];

  const notice =
    connected ? { tone: "success" as const, text: t("connectedNotice", { count: Number(connected) || 0 }) }
    : disconnected ? { tone: "success" as const, text: t("disconnectedNotice") }
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

      {configured ? (
        <a
          href="/api/social/oauth/start"
          className="inline-block rounded-lg bg-crimson px-5 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
        >
          {t("connectCta")}
        </a>
      ) : (
        <div className="rounded-xl border border-dashed border-line p-5">
          <p className="text-sm font-semibold">{t("notConfiguredTitle")}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{t("notConfiguredBody")}</p>
        </div>
      )}

      <p className="mt-4 text-xs leading-5 text-muted">{t("requirementsNote")}</p>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted">
        {t("listLabel")}
      </h2>

      {!rows.length ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => (
            <article
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4"
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  <span aria-hidden className="mr-2">
                    {a.platform === "instagram_business" ? "📸" : "📘"}
                  </span>
                  {a.platform === "instagram_business" && a.username
                    ? `@${a.username}`
                    : a.display_name}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {t(`platform.${a.platform}` as never)}
                  {" · "}
                  {t("connectedAt", {
                    when: format.dateTime(new Date(a.connected_at), { dateStyle: "medium" }),
                  })}
                  {a.status !== "active" && (
                    <span className="ml-2 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                      {t(`status.${a.status}` as never)}
                    </span>
                  )}
                </p>
              </div>

              <form action={disconnectAccount}>
                <input type="hidden" name="id" value={a.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted hover:border-danger hover:text-danger"
                >
                  {t("disconnect")}
                </button>
              </form>
            </article>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">{t("disconnectNote")}</p>
    </AgentShell>
  );
}
