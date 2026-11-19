import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, capabilityCountries } from "@/lib/authz";
import { CONSENT_METHODS, CONSENT_SCOPES, ONBOARD_MESSAGE_COOKIE } from "@/lib/agents/onboard";
import { newTemporaryPassword, onboardAgent } from "./actions";

/**
 * Open an account for an agent (00132). The admin has phoned the agent and has
 * their permission; this records it, creates the account with a temporary
 * password, emails it, and shows the admin a WhatsApp message once.
 */

export const dynamic = "force-dynamic";

const NOTICES: Record<string, "ok" | "warn"> = {
  created: "ok", reissued: "ok", created_email_failed: "warn", email_registered: "warn",
  invalid: "warn", failed: "warn", already_active: "warn", denied: "warn",
};

/** "Now" in a country's local time, for the datetime-local default. */
function localNow(timeZone: string | null | undefined): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: timeZone ?? "UTC", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

const inputCls = "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

export default async function OnboardAgentPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireCapability("agent.invite");
  const { notice } = await searchParams;
  const t = await getTranslations("onboard");
  const supabase = await createClient();
  const scope = await capabilityCountries("agent.invite");
  let cq = supabase.from("countries").select("code, name, timezone").eq("active", true).order("name");
  if (scope) cq = cq.in("code", scope);
  const { data: countries } = await cq;
  const message = (await cookies()).get(ONBOARD_MESSAGE_COOKIE)?.value ?? null;

  // Accounts opened this way, newest first (RLS limits them to this admin's countries).
  const { data: consents } = await supabase
    .from("agent_onboarding_consents")
    .select("user_id, method, scopes, source_platform, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  const seen = new Set<string>();
  const recent = (consents ?? []).filter((c) => (seen.has(c.user_id) ? false : (seen.add(c.user_id), true)));
  // Separate read: the consent's FK points at auth.users (hard rule 6), so
  // PostgREST cannot embed profiles from it.
  const { data: people } = recent.length
    ? await supabase.from("profiles").select("id, display_name, must_change_password, country_code").in("id", recent.map((c) => c.user_id))
    : { data: [] as { id: string; display_name: string | null; must_change_password: boolean; country_code: string | null }[] };
  const personById = new Map((people ?? []).map((p) => [p.id, p]));
  const nowLocal = localNow((countries ?? [])[0]?.timezone);

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {notice && NOTICES[notice] && (
        <p className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${NOTICES[notice] === "ok" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {t(`notice.${notice}` as never)}
        </p>
      )}

      {message && (
        <section className="mb-8 rounded-xl border border-success/40 bg-success/5 p-5" data-onboard-message="1">
          <h2 className="font-semibold">{t("messageTitle")}</h2>
          <p className="mt-1 text-xs text-muted">{t("messageHint")}</p>
          <textarea readOnly rows={7} value={message} className={`${inputCls} font-mono`} />
        </section>
      )}

      <form action={onboardAgent} className="mb-10 grid gap-4 rounded-xl border border-line p-6 sm:grid-cols-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted sm:col-span-2">{t("formTitle")}</h2>
        <label className="block text-sm">
          <span className="font-medium">{t("fullName")}</span>
          <input name="fullName" required minLength={2} maxLength={80} className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">{t("emailField")}</span>
          <input name="email" type="email" required maxLength={200} autoComplete="off" className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">WhatsApp</span>
          <input name="whatsapp" maxLength={30} placeholder="+62 812 3456 7890" className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">{t("country")}</span>
          <select name="country" required className={inputCls} defaultValue={(countries ?? [])[0]?.code}>
            {(countries ?? []).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium">{t("sourcePlatform")}</span>
          <input name="sourcePlatform" maxLength={200} placeholder={t("sourcePlatformHint")} className={inputCls} />
        </label>

        <fieldset className="rounded-lg border border-line p-4 sm:col-span-2">
          <legend className="px-1 text-sm font-semibold">{t("consentTitle")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">{t("method")}</span>
              <select name="method" required defaultValue="phone_call" className={inputCls}>
                {CONSENT_METHODS.map((m) => <option key={m} value={m}>{t(`methods.${m}` as never)}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("consentedAt")}</span>
              <input name="consentedAt" type="datetime-local" required defaultValue={nowLocal} className={inputCls} />
            </label>
          </div>
          <p className="mt-3 text-sm font-medium">{t("scopesTitle")}</p>
          <ul className="mt-2 space-y-2 text-sm">
            {CONSENT_SCOPES.map((s) => (
              <li key={s}>
                <label className="inline-flex items-start gap-2">
                  <input type="checkbox" name="scopes" value={s} defaultChecked disabled={s === "open_account"} className="mt-0.5 h-4 w-4 accent-crimson" />
                  <span>{t(`scope.${s}` as never)}</span>
                </label>
              </li>
            ))}
          </ul>
          <label className="mt-3 block text-sm">
            <span className="font-medium">{t("note")}</span>
            <textarea name="note" rows={2} maxLength={1000} placeholder={t("noteHint")} className={inputCls} />
          </label>
          <label className="mt-3 inline-flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirmed" required className="mt-0.5 h-4 w-4 accent-crimson" />
            <span className="font-medium">{t("confirm")}</span>
          </label>
        </fieldset>

        <label className="block text-sm">
          <span className="font-medium">{t("language")}</span>
          <select name="language" defaultValue="id" className={inputCls}>
            <option value="id">Bahasa Indonesia</option>
            <option value="ms">Bahasa Melayu</option>
            <option value="en">English</option>
          </select>
        </label>
        <div className="flex items-end sm:col-span-1">
          <button type="submit" className="min-h-11 w-full cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white hover:bg-crimson-strong">
            {t("submit")}
          </button>
        </div>
      </form>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("recentTitle")}</h2>
        {!recent.length ? (
          <p className="rounded-xl border border-line p-6 text-center text-sm text-muted">{t("recentNone")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">{t("fullName")}</th>
                  <th className="px-4 py-3">{t("country")}</th>
                  <th className="px-4 py-3">{t("sourcePlatform")}</th>
                  <th className="px-4 py-3">{t("status")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => {
                  const p = personById.get(c.user_id) ?? null;
                  return (
                    <tr key={c.user_id} className="border-t border-line">
                      <td className="px-4 py-3 font-medium"><a href={`/admin/agents/${c.user_id}`} className="text-crimson hover:underline">{p?.display_name ?? "—"}</a></td>
                      <td className="px-4 py-3 text-muted">{p?.country_code ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">{c.source_platform ?? "—"}</td>
                      <td className="px-4 py-3" data-onboard-status={p?.must_change_password ? "waiting" : "active"}>
                        {p?.must_change_password ? t("statusWaiting") : t("statusActive")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p?.must_change_password && (
                          <form action={newTemporaryPassword} className="inline">
                            <input type="hidden" name="userId" value={c.user_id} />
                            <button type="submit" className="cursor-pointer text-xs font-semibold text-crimson hover:underline">{t("reissue")}</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
