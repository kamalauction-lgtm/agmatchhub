import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireCapability, capabilityCountries } from "@/lib/authz";
import { saveAgency } from "./actions";
import { createClient } from "@/lib/supabase/server";

/**
 * Organisations.
 *
 * `agencies` has existed since the first migration and had zero rows until an
 * organisation policy needed something to point at. It is the company model —
 * there is no separate "organisations" table, and adding one would have split
 * the same concept across two places.
 *
 * The list leads with agent counts rather than the company name alone, because
 * the operational question is never "which companies exist" — it is "how many
 * people does this commercial decision affect".
 */

export const dynamic = "force-dynamic";

export default async function OrganisationsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireCapability("commercial.manage");
  const { notice } = await searchParams;
  const t = await getTranslations("organisations");
  const supabase = await createClient();

  // Screen 11: the countries this admin may create organisations in (00125).
  const scope = await capabilityCountries("commercial.manage");
  let cq = supabase.from("countries").select("code, name").eq("active", true).order("name");
  if (scope) cq = cq.in("code", scope);
  const { data: countryOptions } = await cq;

  const [{ data: agencies }, { data: profiles }, { data: policies }] = await Promise.all([
    supabase.from("agencies").select("id, name, country_code, registration_number").order("name"),
    supabase
      .from("agent_profiles")
      .select("agency_id, user_id, profiles:user_id(agent_status)"),
    supabase
      .from("commercial_policy_targets")
      .select("agency_id, commercial_policies(id, name, treatment, percent, amount, is_active)")
      .eq("target_type", "agency"),
  ]);

  const byAgency = new Map<string, { total: number; verified: number }>();
  for (const p of profiles ?? []) {
    if (!p.agency_id) continue;
    const row = byAgency.get(p.agency_id) ?? { total: 0, verified: 0 };
    row.total += 1;
    if ((p.profiles as unknown as { agent_status?: string } | null)?.agent_status === "verified") {
      row.verified += 1;
    }
    byAgency.set(p.agency_id, row);
  }

  const policyByAgency = new Map<string, { name: string; treatment: string; active: boolean }>();
  for (const t2 of policies ?? []) {
    const pol = t2.commercial_policies as unknown as
      | { name: string; treatment: string; is_active: boolean }
      | null;
    if (t2.agency_id && pol) {
      policyByAgency.set(t2.agency_id, {
        name: pol.name, treatment: pol.treatment, active: pol.is_active,
      });
    }
  }

  const unlinked = (profiles ?? []).filter((p) => !p.agency_id).length;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>
      {notice && (
        <p className="mb-6 rounded-lg bg-surface px-4 py-3 text-sm font-medium" role="status">{t(`notice.${notice}` as never)}</p>
      )}
      <details className="mb-6 rounded-xl border border-line p-4" data-agency-create="1">
        <summary className="cursor-pointer text-sm font-semibold">{t("agencyForm.create")}</summary>
        <form action={saveAgency} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">{t("agencyForm.name")}</span>
            <input name="name" required minLength={2} maxLength={160} defaultValue="" className="min-h-10 w-full rounded-lg border border-line bg-background px-3 text-sm" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">{t("agencyForm.registration")}</span>
            <input name="registrationNumber" maxLength={80} defaultValue="" className="min-h-10 w-full rounded-lg border border-line bg-background px-3 text-sm" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">{t("agencyForm.country")}</span>
            <select name="countryCode" required defaultValue="" className="min-h-10 w-full rounded-lg border border-line bg-background px-3 text-sm">
              <option value="" disabled>{t("agencyForm.chooseCountry")}</option>
              {(countryOptions ?? []).map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
            </select></label>
          <div className="sm:col-span-3"><button type="submit" className="min-h-10 cursor-pointer rounded-lg bg-crimson px-4 text-sm font-semibold text-white hover:bg-crimson-strong">{t("agencyForm.createButton")}</button></div>
        </form>
      </details>

      {unlinked > 0 && (
        /* Said plainly: an organisation policy only reaches agents whose
           profile actually points at the agency. Silence here would let
           somebody set a company discount and wonder why nothing changed. */
        <p className="mb-6 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {t("unlinkedWarning", { count: unlinked })}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">{t("organisation")}</th>
              <th className="px-4 py-3">{t("country")}</th>
              <th className="px-4 py-3 text-right">{t("agents")}</th>
              <th className="px-4 py-3 text-right">{t("verified")}</th>
              <th className="px-4 py-3">{t("commercialPolicy")}</th>
            </tr>
          </thead>
          <tbody>
            {(agencies ?? []).map((a) => {
              const counts = byAgency.get(a.id) ?? { total: 0, verified: 0 };
              const pol = policyByAgency.get(a.id);
              return (
                <tr key={a.id} className="border-t border-line hover:bg-surface">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/organisations/${a.id}`} className="text-crimson hover:underline">
                      {a.name}
                    </Link>
                    {a.registration_number && (
                      <span className="block font-mono text-xs text-muted">
                        {a.registration_number}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{a.country_code ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{counts.total}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{counts.verified}</td>
                  <td className="px-4 py-3">
                    {pol ? (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          pol.active ? "bg-success/10 text-success" : "bg-surface text-muted"
                        }`}
                      >
                        {t(`treatment.${pol.treatment}` as never)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">{t("standardPricing")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!(agencies ?? []).length && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">{t("empty")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
