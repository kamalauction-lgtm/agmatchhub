import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { updateCountry } from "./actions";

const selectCls =
  "rounded-lg border border-line bg-background px-2 py-1.5 text-sm outline-none focus:border-crimson";

export default async function CountriesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapability("platform.configure");
  const { saved, error } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("adminCountries");

  const [{ data: countries }, { data: languages }, { data: currencies }, { data: agents }] = await Promise.all([
    supabase.from("countries").select("*").order("name"),
    supabase.from("languages").select("code, name").order("code"),
    supabase.from("currencies").select("code").order("code"),
    // Candidates for the per-country ingest agent: verified profiles, grouped by country below.
    supabase.from("profiles").select("id, display_name, country_code").eq("agent_status", "verified").order("display_name").limit(500),
  ]);
  const ingestAgentOf = (c: { settings: unknown }) =>
    ((c.settings as { ingest?: { agent_id?: string | null } } | null)?.ingest?.agent_id ?? "") as string;
  const agreementOf = (c: { settings: unknown }) =>
    ((c.settings as { ingest?: { agreement_ref?: string | null } } | null)?.ingest?.agreement_ref ?? "") as string;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {saved && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t("savedNotice", { code: saved })}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {error === "ingest_agent" ? t("ingestAgentInvalid") : error === "invalid" ? t("invalidFields") : t("saveFailed")}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs text-muted uppercase">
            <tr>
              <th className="px-4 py-3">{t("cols.country")}</th>
              <th className="px-4 py-3">{t("cols.active")}</th>
              <th className="px-4 py-3">{t("cols.language")}</th>
              <th className="px-4 py-3">{t("cols.currency")}</th>
              <th className="px-4 py-3">{t("cols.unit")}</th>
              <th className="px-4 py-3">{t("cols.ingestAgent")}</th>
              <th className="px-4 py-3">{t("cols.local")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(countries ?? []).map((c) => (
              <tr key={c.code} className="border-t border-line">
                <td className="px-4 py-3 font-medium">
                  {c.name} <span className="text-xs text-muted">({c.code})</span>
                </td>
                <td className="px-4 py-3">
                  <input
                    form={`country-${c.code}`}
                    type="checkbox"
                    name="active"
                    defaultChecked={c.active}
                    className="h-4 w-4 accent-crimson"
                  />
                </td>
                <td className="px-4 py-3">
                  <select form={`country-${c.code}`} name="defaultLanguage" defaultValue={c.default_language} className={selectCls}>
                    {(languages ?? []).map((l) => (
                      <option key={l.code} value={l.code}>{l.code} — {l.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select form={`country-${c.code}`} name="defaultCurrency" defaultValue={c.default_currency} className={selectCls}>
                    {(currencies ?? []).map((cur) => (
                      <option key={cur.code} value={cur.code}>{cur.code}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select form={`country-${c.code}`} name="measurementUnit" defaultValue={c.measurement_unit} className={selectCls}>
                    <option value="sqft">sqft</option>
                    <option value="sqm">sqm</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  {/* Hero → ingest drafts land on this profile for the country (E10). */}
                  <select form={`country-${c.code}`} name="ingestAgentId" defaultValue={ingestAgentOf(c)} className={selectCls} title={t("ingestAgentHint")}>
                    <option value="">{t("ingestAgentNone")}</option>
                    {(agents ?? []).filter((a) => a.country_code === c.code).map((a) => (
                      <option key={a.id} value={a.id}>{a.display_name ?? a.id.slice(0, 8)}</option>
                    ))}
                  </select>
                  {/* P0-e-3b: partner photos are stored only under a recorded agreement. */}
                  <input form={`country-${c.code}`} name="ingestAgreementRef" defaultValue={agreementOf(c)} maxLength={200}
                    placeholder={t("ingestAgreementPlaceholder")} title={t("ingestAgreementHint")} aria-label={t("ingestAgreementHint")}
                    className={`mt-1 block w-full ${selectCls}`} />
                </td>
                <td className="px-4 py-3" data-country-local={c.code}>
                  {/* Screen 13: timezone and terminology, editable per country. */}
                  <input form={`country-${c.code}`} name="timezone" defaultValue={c.timezone ?? ""} maxLength={60}
                    placeholder="Asia/Kuala_Lumpur" aria-label={t("timezone")} title={t("timezone")} className={`block w-full ${selectCls}`} />
                  <input form={`country-${c.code}`} name="prospectRetentionDays" type="number" min={30} max={730}
                    defaultValue={String(((c.settings ?? {}) as Record<string, unknown>).prospect_retention_days ?? "")}
                    placeholder={t("prospectRetention")} aria-label={t("prospectRetention")} title={t("prospectRetention")} className={`mt-1 block w-full ${selectCls}`} />
                  {(["agent", "owner", "tenant"] as const).map((k) => (
                    <input key={k} form={`country-${c.code}`} name={`term${k[0].toUpperCase()}${k.slice(1)}`}
                      defaultValue={String(((c.terminology ?? {}) as Record<string, unknown>)[k] ?? "")} maxLength={60}
                      placeholder={t(`term.${k}`)} aria-label={t(`term.${k}`)} title={t(`term.${k}`)} className={`mt-1 block w-full ${selectCls}`} />
                  ))}
                </td>
                <td className="px-4 py-3 text-right">
                  <form id={`country-${c.code}`} action={updateCountry}>
                    <input type="hidden" name="code" value={c.code} />
                    <button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-crimson hover:text-crimson">
                      {t("save")}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
