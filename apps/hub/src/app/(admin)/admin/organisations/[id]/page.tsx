import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { setOrganisationPolicy } from "../actions";

/**
 * Organisation 360.
 *
 * The screen that answers "what happens if we change IQI from 100% to 80%"
 * — and lets somebody actually do it, without a deploy and without a branch
 * named after a customer anywhere in the codebase.
 *
 * The impact preview is deliberately shown BEFORE the form rather than after
 * submission: the number of people a company-wide price change touches is the
 * one fact that should be visible while the decision is being made, not
 * afterwards in a confirmation dialog nobody reads.
 */

export const dynamic = "force-dynamic";

const money = (n: number, currency = "IDR") =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

export default async function OrganisationDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireCapability("commercial.manage");
  const { id } = await params;
  const { notice } = await searchParams;
  const t = await getTranslations("organisations");
  const supabase = await createClient();

  const { data: agency } = await supabase
    .from("agencies").select("id, name, country_code, registration_number").eq("id", id).maybeSingle();
  if (!agency) notFound();

  const [{ data: members }, { data: targets }, { data: plans }] = await Promise.all([
    supabase
      .from("agent_profiles")
      .select("user_id, profiles:user_id(id, display_name, agent_status)")
      .eq("agency_id", id),
    supabase
      .from("commercial_policy_targets")
      .select("commercial_policies(id, name, treatment, percent, amount, priority, is_active, effective_until, reason)")
      .eq("target_type", "agency")
      .eq("agency_id", id),
    supabase
      .from("plan_versions")
      .select("monthly_price, currency, plans!inner(key, name)")
      .eq("is_current", true)
      .eq("plans.key", "platinum")
      .maybeSingle(),
  ]);

  const people = (members ?? []).map(
    (m) => m.profiles as unknown as { id: string; display_name: string | null; agent_status: string | null },
  ).filter(Boolean);

  const verified = people.filter((p) => p?.agent_status === "verified").length;

  const policy = ((targets ?? [])[0]?.commercial_policies ?? null) as unknown as {
    id: string; name: string; treatment: string; percent: number | null;
    amount: number | null; is_active: boolean; reason: string | null;
  } | null;

  const basePrice = Number(
    (plans as unknown as { monthly_price?: string } | null)?.monthly_price ?? 0,
  );
  const currency = (plans as unknown as { currency?: string } | null)?.currency ?? "IDR";

  /* What each treatment would cost, per agent per month, so the choice is made
     against numbers instead of adjectives. */
  const scenarios = [
    { key: "complimentary", label: t("scenario.complimentary"), price: 0 },
    { key: "p90", label: t("scenario.p90"), price: basePrice * 0.1 },
    { key: "p80", label: t("scenario.p80"), price: basePrice * 0.2 },
    { key: "p50", label: t("scenario.p50"), price: basePrice * 0.5 },
    { key: "full", label: t("scenario.full"), price: basePrice },
  ];

  const input =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

  return (
    <>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{agency.name}</h1>
        <Link
          href="/admin/organisations"
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-crimson hover:text-crimson"
        >
          {t("back")}
        </Link>
      </div>
      <p className="mb-6 text-sm text-muted">
        {agency.country_code ?? "—"}
        {agency.registration_number ? ` · ${agency.registration_number}` : ""}
      </p>

      {notice && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t(`notice.${notice}` as never)}
        </p>
      )}

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [people.length, t("agents")],
          [verified, t("verified")],
          [policy ? t(`treatment.${policy.treatment}` as never) : t("standardPricing"), t("commercialPolicy")],
          [money(policy?.treatment === "complimentary" ? 0 : basePrice, currency), t("perAgentMonth")],
        ].map(([v, label]) => (
          <div key={String(label)} className="rounded-xl border border-line p-4">
            <p className="text-lg font-bold leading-tight">{v as string}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted">{label as string}</p>
          </div>
        ))}
      </section>

      {/* Impact preview --------------------------------------------------- */}
      <section className="mb-8 rounded-xl border border-line p-6">
        <h2 className="font-semibold">{t("impactTitle")}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          {t("impactHint", { count: people.length })}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2">{t("scenarioCol")}</th>
                <th className="py-2 text-right">{t("perAgentMonth")}</th>
                <th className="py-2 text-right">{t("orgMonthly", { count: people.length })}</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <tr key={s.key} className="border-t border-line">
                  <td className="py-2.5">{s.label}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">
                    {money(s.price, currency)}
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums">
                    {money(s.price * people.length, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">{t("impactCaveat")}</p>
      </section>

      {/* Set the policy ---------------------------------------------------- */}
      <section className="mb-8 rounded-xl border border-line p-6">
        <h2 className="mb-1 font-semibold">{t("setPolicyTitle")}</h2>
        <p className="mb-4 text-sm text-muted">{t("setPolicyHint")}</p>

        <form action={setOrganisationPolicy} className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="agencyId" value={agency.id} />
          <label className="block text-sm">
            <span className="font-medium">{t("treatmentLabel")}</span>
            <select name="treatment" defaultValue={policy?.treatment ?? "complimentary"} className={input}>
              <option value="complimentary">{t("treatment.complimentary")}</option>
              <option value="percent_discount">{t("treatment.percent_discount")}</option>
              <option value="fixed_price">{t("treatment.fixed_price")}</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">{t("valueLabel")}</span>
            <input name="value" type="number" min={0} step="1" defaultValue={policy?.percent ?? ""} className={input} />
            <span className="mt-1 block text-xs text-muted">{t("valueHint")}</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium">{t("reasonLabel")}</span>
            <input name="reason" required maxLength={300} defaultValue={policy?.reason ?? ""} className={input} />
          </label>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="min-h-11 cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-crimson-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
            >
              {t("applyPolicy")}
            </button>
            <p className="mt-2 text-xs text-muted">
              {t("applyWarning", { count: people.length })}
            </p>
          </div>
        </form>
      </section>

      {/* Members ----------------------------------------------------------- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("membersTitle")}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/agents/${p.id}`} className="text-crimson hover:underline">
                      {p.display_name ?? p.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted">{p.agent_status}</td>
                </tr>
              ))}
              {!people.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-muted">{t("noMembers")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
