import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { setBillingMode, repricePlan } from "./actions";
import { formatMoney } from "@/lib/entitlements";

/**
 * Commercial control.
 *
 * Plans, price history, live policies and subscriptions — everything that was
 * SQL-only until now.
 *
 * Billing mode sits at the top because it is the setting that decides whether
 * any of the numbers below are real. During FREE_LAUNCH the platform computes
 * every price and collects nothing, which is what makes SHADOW_BILLING a
 * reporting change later rather than an engineering project.
 */

export const dynamic = "force-dynamic";

const money = (n: number | string | null, currency = "IDR") => formatMoney(n, currency);

/** Decision 4: three independent lists. Order = display order on the page. */
const CURRENCIES = ["MYR", "IDR", "USD"] as const;

export default async function CommercialPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireCapability("commercial.manage");
  const { notice } = await searchParams;
  const t = await getTranslations("commercial");
  const supabase = await createClient();

  const [{ data: settings }, { data: plans }, { data: policies }, { data: subs }, { data: grants }] =
    await Promise.all([
      supabase.from("commercial_settings").select("billing_mode").eq("id", true).maybeSingle(),
      supabase
        .from("plans")
        .select("id, key, name, rank, is_active, family, product_key, product_name, plan_versions(id, version, monthly_price, annual_price, currency, is_current, note, created_at)")
        .eq("family", "agent")
        .order("rank"),
      supabase
        .from("commercial_policies")
        .select("id, name, treatment, percent, amount, priority, is_active, effective_until, reason, commercial_policy_targets(target_type)")
        .order("priority", { ascending: false }),
      supabase
        .from("subscriptions")
        .select("id, status, cadence, source_label, profiles:user_id(id, display_name), plan_versions(plans(name))")
        .limit(50),
      supabase
        .from("entitlement_grants")
        .select("id, entitlement_key, int_value, source, reason, revoked_at, profiles:user_id(id, display_name)")
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

  const mode = settings?.billing_mode ?? "FREE_LAUNCH";
  const input =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson";

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {notice && (
        <p
          className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${
            ["billing_mode_set", "repriced"].includes(notice)
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning"
          }`}
        >
          {t(`notice.${notice}` as never)}
        </p>
      )}

      {/* Billing mode ----------------------------------------------------- */}
      <section className="mb-9 rounded-xl border border-line p-6">
        <h2 className="font-semibold">{t("billingTitle")}</h2>
        <p className="mb-4 mt-1 max-w-2xl text-sm text-muted">{t("billingHint")}</p>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {(["FREE_LAUNCH", "SHADOW_BILLING", "LIVE_BILLING"] as const).map((m) => (
            <div
              key={m}
              className={`rounded-lg border p-3 ${
                mode === m ? "border-crimson bg-crimson-soft/30" : "border-line"
              }`}
            >
              <p className="text-sm font-semibold">{t(`mode.${m}` as never)}</p>
              <p className="mt-1 text-xs text-muted">{t(`modeHint.${m}` as never)}</p>
            </div>
          ))}
        </div>

        <form action={setBillingMode} className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="font-medium">{t("changeMode")}</span>
            <select name="mode" defaultValue={mode} className={input}>
              <option value="FREE_LAUNCH">{t("mode.FREE_LAUNCH")}</option>
              <option value="SHADOW_BILLING">{t("mode.SHADOW_BILLING")}</option>
              <option value="LIVE_BILLING">{t("mode.LIVE_BILLING")}</option>
            </select>
          </label>
          <label className="block text-sm">
            {/* Typed confirmation, only meaningful for LIVE_BILLING — that
                switch starts charging real people. */}
            <span className="font-medium">{t("confirmLabel")}</span>
            <input name="confirm" placeholder="LIVE_BILLING" className={input} />
          </label>
          <button
            type="submit"
            className="min-h-11 cursor-pointer rounded-lg border border-line px-5 text-sm font-semibold transition-colors duration-200 hover:border-crimson hover:text-crimson"
          >
            {t("save")}
          </button>
        </form>
      </section>

      {/* Plans ------------------------------------------------------------ */}
      <section className="mb-9">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("plansTitle")}
        </h2>
        <p className="mb-3 text-xs text-muted">{t("plansHint")}</p>

        <div className="space-y-3">
          {(plans ?? []).map((p) => {
            const versions = (p.plan_versions ?? []) as unknown as {
              id: string; version: number; monthly_price: string | null;
              annual_price: string | null; currency: string; is_current: boolean; note: string | null;
            }[];
            const history = versions.filter((v) => !v.is_current).sort((a, b) => b.version - a.version);

            return (
              <div key={p.id} className="rounded-xl border border-line p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {p.product_name ?? p.name}
                      <span className="ml-2 text-sm font-normal text-muted">{p.name}</span>
                    </h3>
                    <p className="font-mono text-xs text-muted">{p.key}{p.product_key ? ` · ${t("soldAs", { product: p.product_key })}` : ""}</p>
                  </div>
                </div>

                {/* One price list per currency; each form reprices ONE list and
                    leaves the other two untouched (no live FX, Decision 4). */}
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {CURRENCIES.map((cur) => {
                    const current = versions.find((v) => v.is_current && v.currency === cur);
                    const step = cur === "IDR" ? "1000" : "1";
                    return (
                      <form key={cur} action={repricePlan} className="rounded-lg border border-line p-3">
                        <input type="hidden" name="planId" value={p.id} />
                        <input type="hidden" name="currency" value={cur} />
                        <div className="mb-2 flex items-baseline justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted">{cur}</span>
                          <span className="font-mono text-sm font-bold tabular-nums">
                            {current ? money(current.monthly_price, cur) : t("noList")}
                            {current && <span className="ml-1 text-xs font-normal text-muted">{t("perMonth")}</span>}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block text-xs font-semibold">
                            {t("monthly")}
                            <input name="monthlyPrice" type="number" min={0} step={step}
                                   defaultValue={current?.monthly_price ?? 0} className={input} />
                          </label>
                          <label className="block text-xs font-semibold">
                            {t("annual")}
                            <input name="annualPrice" type="number" min={0} step={step}
                                   defaultValue={current?.annual_price ?? 0} className={input} />
                          </label>
                        </div>
                        <label className="mt-2 block text-xs font-semibold">
                          {t("noteLabel")}
                          <input name="note" maxLength={200} className={input} />
                        </label>
                        <button
                          type="submit"
                          className="mt-2 min-h-9 w-full cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold transition-colors duration-200 hover:border-crimson hover:text-crimson"
                        >
                          {current ? t("newVersion") : t("firstVersion")}
                        </button>
                        {current && <p className="mt-1 text-right text-[11px] text-muted">v{current.version}{current.note ? ` · ${current.note}` : ""}</p>}
                      </form>
                    );
                  })}
                </div>

                {history.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-muted">
                      {t("priceHistory", { count: history.length })}
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {history.map((v) => (
                        <li key={v.id} className="flex justify-between gap-3">
                          <span>{v.currency} v{v.version}{v.note ? ` · ${v.note}` : ""}</span>
                          <span className="font-mono tabular-nums">
                            {money(v.monthly_price, v.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Policies --------------------------------------------------------- */}
      <section className="mb-9">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("policiesTitle")}
        </h2>
        <p className="mb-3 text-xs text-muted">{t("policiesHint")}</p>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">{t("policy")}</th>
                <th className="px-4 py-3">{t("treatmentCol")}</th>
                <th className="px-4 py-3">{t("appliesTo")}</th>
                <th className="px-4 py-3 text-right">{t("priority")}</th>
                <th className="px-4 py-3">{t("statusCol")}</th>
              </tr>
            </thead>
            <tbody>
              {(policies ?? []).map((p) => {
                const targets = (p.commercial_policy_targets ?? []) as unknown as { target_type: string }[];
                return (
                  <tr key={p.id} className={`border-t border-line ${p.is_active ? "" : "opacity-50"}`}>
                    <td className="px-4 py-3">
                      <span className="font-medium">{p.name}</span>
                      {p.reason && <span className="block text-xs text-muted">{p.reason}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {t(`treatment.${p.treatment}` as never)}
                      {p.percent !== null && ` ${p.percent}%`}
                      {p.amount !== null && ` ${money(p.amount)}`}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {targets.map((x) => t(`target.${x.target_type}` as never)).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{p.priority}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          p.is_active ? "bg-success/10 text-success" : "bg-surface text-muted"
                        }`}
                      >
                        {p.is_active ? t("active") : t("retired")}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!(policies ?? []).length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">{t("noPolicies")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Grants ----------------------------------------------------------- */}
      <section className="mb-9">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("grantsTitle")}
        </h2>
        <p className="mb-3 text-xs text-muted">{t("grantsHint")}</p>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <tbody>
              {(grants ?? []).map((g) => {
                const who = g.profiles as unknown as { id: string; display_name: string | null } | null;
                return (
                  <tr key={g.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      {who ? (
                        <Link href={`/admin/agents/${who.id}`} className="font-medium text-crimson hover:underline">
                          {who.display_name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{g.entitlement_key}</td>
                    <td className="px-4 py-3 font-mono tabular-nums">+{g.int_value}</td>
                    <td className="px-4 py-3 text-xs text-muted">{t(`source.${g.source}` as never)}</td>
                    <td className="px-4 py-3 text-xs text-muted">{g.reason}</td>
                  </tr>
                );
              })}
              {!(grants ?? []).length && (
                <tr><td className="px-4 py-8 text-center text-muted">{t("noGrants")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Subscriptions ---------------------------------------------------- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("subscriptionsTitle")}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <tbody>
              {(subs ?? []).map((s) => {
                const who = s.profiles as unknown as { id: string; display_name: string | null } | null;
                const plan = (s.plan_versions as unknown as { plans: { name: string } } | null)?.plans;
                return (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium">{who?.display_name ?? "—"}</td>
                    <td className="px-4 py-3">{plan?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">{s.status}</td>
                    <td className="px-4 py-3 text-xs text-muted">{s.source_label ?? "—"}</td>
                  </tr>
                );
              })}
              {!(subs ?? []).length && (
                /* Not an error: during FREE_LAUNCH entitlements resolve from the
                   default plan, so an agent needs no subscription row to work. */
                <tr><td className="px-4 py-8 text-center text-muted">{t("noSubscriptions")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
