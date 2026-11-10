import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { requireCapability, capabilityCountries } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { INVITE_LINK_COOKIE } from "@/lib/agents/invitations";
import { createInvitation, resendInvitation, revokeInvitation } from "./actions";

/**
 * Agent invitations (P0-b, 00106).
 *
 * An admin invites an agent by name and e-mail; the agent then registers with
 * their own password and accepts the link. No admin ever sets or sees a
 * password. The list is what RLS returns: only invitations in countries the
 * admin holds agent.invite for.
 */

export const dynamic = "force-dynamic";

const NOTICE_TONE: Record<string, "ok" | "warn"> = {
  created: "ok",
  resent: "ok",
  revoked: "ok",
  denied: "warn",
  invalid: "warn",
  email_registered: "warn",
  already_invited: "warn",
  country_inactive: "warn",
  not_pending: "warn",
  failed: "warn",
};

type Row = {
  id: string;
  full_name: string;
  email: string;
  country_code: string;
  status: "pending" | "redeemed" | "revoked";
  expires_at: string;
  send_count: number;
  last_sent_at: string;
  created_at: string;
};

type State = "pending" | "expired" | "redeemed" | "revoked";

/**
 * Data layer, outside the component (the React Compiler refuses Date.now()
 * during render). Expiry is a fact about the data at request time.
 */
async function getInvitations(): Promise<(Row & { state: State })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_invitations")
    .select("id, full_name, email, country_code, status, expires_at, send_count, last_sent_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const now = Date.now();
  return ((data ?? []) as Row[]).map((r) => ({
    ...r,
    state: r.status === "pending" && new Date(r.expires_at).getTime() <= now ? "expired" : r.status,
  }));
}

export default async function AdminInvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireCapability("agent.invite");
  const { notice } = await searchParams;
  const t = await getTranslations("adminInvitations");
  const supabase = await createClient();

  const scope = await capabilityCountries("agent.invite");
  let countryQuery = supabase.from("countries").select("code, name").eq("active", true).order("name");
  if (scope) countryQuery = countryQuery.in("code", scope);

  const [rows, { data: countries }] = await Promise.all([getInvitations(), countryQuery]);

  // The link is shown once, right after create or resend, then the cookie expires.
  const link =
    notice === "created" || notice === "resent"
      ? (await cookies()).get(INVITE_LINK_COOKIE)?.value ?? null
      : null;

  const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const input =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {notice && NOTICE_TONE[notice] && (
        <p
          className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${
            NOTICE_TONE[notice] === "ok" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
          }`}
        >
          {t(`notice.${notice}` as never)}
        </p>
      )}

      {link && (
        <section className="mb-8 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">{t("linkTitle")}</h2>
          <p className="mt-1 text-xs text-muted">{t("linkHint")}</p>
          <label className="mt-3 block text-sm">
            <span className="sr-only">{t("linkTitle")}</span>
            <input readOnly value={link} className={`${input} font-mono text-xs`} id="invite-link" />
          </label>
        </section>
      )}

      <section className="mb-10 rounded-xl border border-line p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("createTitle")}</h2>
        {(countries ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("noCountries")}</p>
        ) : (
          <form action={createInvitation} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">{t("fullName")}</span>
              <input name="fullName" required minLength={2} maxLength={120} className={input} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("email")}</span>
              <input name="email" type="email" required maxLength={200} className={input} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("phone")}</span>
              <input name="phone" type="tel" maxLength={40} className={input} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("country")}</span>
              <select name="country" required className={input}>
                {(countries ?? []).map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("language")}</span>
              <select name="language" className={input} defaultValue="">
                <option value="">—</option>
                <option value="id">Bahasa Indonesia</option>
                <option value="ms">Bahasa Melayu</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("agency")}</span>
              <input name="agency" maxLength={160} className={input} />
            </label>
            <div className="sm:col-span-2">
              <p className="mb-3 text-xs text-muted">{t("createHint")}</p>
              <button
                type="submit"
                className="min-h-11 cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-crimson-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
              >
                {t("createCta")}
              </button>
            </div>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("listTitle")}</h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">{t("person")}</th>
                <th className="px-4 py-3">{t("country")}</th>
                <th className="px-4 py-3">{t("state")}</th>
                <th className="px-4 py-3">{t("expires")}</th>
                <th className="px-4 py-3">{t("sent")}</th>
                <th className="px-4 py-3 text-right">{t("action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const state = r.state;
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <span className="font-medium">{r.full_name}</span>
                      <span className="block text-xs text-muted">{r.email}</span>
                    </td>
                    <td className="px-4 py-3">{r.country_code}</td>
                    <td className="px-4 py-3">{t(`stateLabel.${state}` as never)}</td>
                    <td className="px-4 py-3 text-muted">{when.format(new Date(r.expires_at))}</td>
                    <td className="px-4 py-3 text-muted">{r.send_count}</td>
                    <td className="px-4 py-3 text-right">
                      {r.status === "pending" ? (
                        <div className="inline-flex gap-2">
                          <form action={resendInvitation}>
                            <input type="hidden" name="invitationId" value={r.id} />
                            <button
                              type="submit"
                              className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold hover:border-crimson hover:text-crimson"
                            >
                              {t("resend")}
                            </button>
                          </form>
                          <form action={revokeInvitation}>
                            <input type="hidden" name="invitationId" value={r.id} />
                            <button
                              type="submit"
                              className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold text-muted hover:border-danger hover:text-danger"
                            >
                              {t("revoke")}
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">{t("empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
