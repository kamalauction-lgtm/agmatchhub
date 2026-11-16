import { getTranslations } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import Image from "next/image";
import { Panel, StatCard } from "@/components/admin/panel";
import { BarChart } from "@/components/admin/charts";
import { updateModel, updateSettings, updateRoleStatus, upsertPersonaVariant, setKnowledgeStatus } from "./actions";

/**
 * The AI console: what the engine spent, what it refused, which model answers
 * which feature, the caps, and the Workforce catalogue.
 *
 * Read entirely through the signed-in admin's own client — the RLS policies
 * on the ai_* tables and the two reporting RPCs are what grant access, so the
 * page cannot show a non-admin anything by accident.
 */

export const dynamic = "force-dynamic";

const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(micros >= 1_000_000 ? 2 : 3)}`;

export default async function AiAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireCapability("ai.manage");
  const { notice } = await searchParams;
  const t = await getTranslations("adminAi");
  const supabase = await createClient();

  const [{ data: daily }, { data: byFeature }, { data: models }, { data: settings }, { data: roles }, { data: recent }] =
    await Promise.all([
      supabase.rpc("ai_admin_daily", { p_days: 30 }),
      supabase.rpc("ai_admin_by_feature", { p_days: 30 }),
      supabase.from("ai_models").select("*").order("tier").order("feature"),
      supabase.from("ai_settings").select("*").limit(1).maybeSingle(),
      supabase.from("ai_roles").select("key, category, sort, name, status, tier, route, external_url").order("category").order("sort"),
      supabase
        .from("ai_jobs")
        .select("id, created_at, user_id, feature, status, denied_reason, provider, model, tokens_in, tokens_out, cost_micros, latency_ms, error")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  // Display names for the recent-calls table; the admin may read profiles.
  const userIds = Array.from(new Set((recent ?? []).map((j) => j.user_id)));
  const { data: people } = userIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.display_name ?? "—"]));

  type Day = { day: string; jobs: number; ok: number; denied: number; errors: number; cost_micros: number; tokens: number };
  const days = ((daily ?? []) as Day[]).map((d) => ({ ...d, jobs: +d.jobs, ok: +d.ok, denied: +d.denied, errors: +d.errors, cost_micros: +d.cost_micros }));
  // Screen 12: a cost is only shown once real pricing exists. With no rate
  // configured (they default to 0) every $0 would be a fiction, not a fact.
  const costKnown = (models ?? []).some((m: { input_cost_micros_per_1k?: number | null; output_cost_micros_per_1k?: number | null }) => Number(m.input_cost_micros_per_1k ?? 0) > 0 || Number(m.output_cost_micros_per_1k ?? 0) > 0);
  const costOf = (micros: number) => (costKnown ? usd(micros) : t("costUnavailable"));
  const total = days.reduce((a, d) => ({ jobs: a.jobs + d.jobs, cost: a.cost + d.cost_micros, errors: a.errors + d.errors, denied: a.denied + d.denied }), { jobs: 0, cost: 0, errors: 0, denied: 0 });

  // Which provider keys THIS deployment carries. Presence only — never the value.
  const keys = [
    { name: "GEMINI_API_KEY", present: !!process.env.GEMINI_API_KEY },
    { name: "ANTHROPIC_API_KEY", present: !!process.env.ANTHROPIC_API_KEY },
    { name: "CRON_SECRET", present: !!(process.env.CRON_SECRET ?? process.env.SOCIAL_CRON_SECRET) },
  ];

  const circuitOpen = !!settings?.circuit_open_until && new Date(settings.circuit_open_until) > new Date();

  const input = "w-full rounded-lg border border-line bg-card px-2 py-1 text-xs";
  const btn = "min-h-8 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold hover:border-crimson hover:text-crimson";

  // The cast (00097): default row per role plus any country overrides.
  const { data: personas } = await supabase
    .from("ai_role_personas").select("id, role_key, country_code, name, avatar_path").order("role_key");
  const personaDefault = new Map((personas ?? []).filter((p) => !p.country_code).map((p) => [p.role_key, p]));
  const personaFor = (key: string, c: string) => (personas ?? []).find((p) => p.role_key === key && p.country_code === c) ?? null;

  // Market facts and closing steps (00098): draft until the owner verifies.
  const [{ data: facts }, { data: steps }] = await Promise.all([
    supabase.from("market_facts").select("id, country_code, audience, topic, body, status, verified_at").order("country_code").order("position"),
    supabase.from("closing_steps").select("id, country_code, transaction_type, position, title, status, verified_at").order("country_code").order("transaction_type").order("position"),
  ]);
  const knowledgeRow = (table: "market_facts" | "closing_steps", r: { id: string; country_code: string; status: string; verified_at: string | null }, label: string, sub: string) => (
    <tr key={r.id}>
      <td className="px-4 py-2 font-mono text-muted">{r.country_code}</td>
      <td className="px-2 py-2"><p className="font-medium">{label}</p><p className="max-w-xl truncate text-muted" title={sub}>{sub}</p></td>
      <td className="px-2 py-2 text-muted">{r.verified_at ? new Date(r.verified_at).toLocaleDateString() : "—"}</td>
      <td className="px-2 py-2">
        <form action={setKnowledgeStatus} className="flex items-center gap-1">
          <input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={r.id} />
          <select name="status" defaultValue={r.status} className={`${input} w-28`} aria-label={`${table} ${r.id}`}>
            <option value="draft">{t("knowStatus.draft")}</option><option value="verified">{t("knowStatus.verified")}</option><option value="retired">{t("knowStatus.retired")}</option>
          </select>
          <button type="submit" className={btn}>{t("save")}</button>
        </form>
      </td>
    </tr>
  );

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <a href="/admin/ai/office" className="text-sm font-semibold text-crimson hover:underline" data-office-link="1">{t("openOffice")}</a>
      </div>
      <p className="mb-6 mt-1 max-w-3xl text-sm text-muted">{t("intro")}</p>

      {notice && (
        <p className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${notice === "updated" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {t(`notice.${notice}` as never)}
        </p>
      )}

      {/* Keys ------------------------------------------------------------- */}
      <Panel title={t("keysTitle")} hint={t("keysHint")} className="mb-6">
        <ul className="flex flex-wrap gap-3">
          {keys.map((k) => (
            <li key={k.name} className={`rounded-full px-3 py-1 font-mono text-xs ${k.present ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
              {k.name} · {k.present ? t("keyPresent") : t("keyMissing")}
            </li>
          ))}
        </ul>
      </Panel>

      {/* KPIs ------------------------------------------------------------- */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard value={total.jobs} label={t("kpi.jobs")} icon="✦" tone="blue" caption={t("caption30d")} series={days.map((d) => d.jobs)} />
        <StatCard value={costOf(total.cost)} label={t("kpi.cost")} icon="$" tone="indigo" caption={costKnown ? t("caption30d") : t("costUnavailableHint")} series={costKnown ? days.map((d) => d.cost_micros) : []} />
        <StatCard value={total.errors} label={t("kpi.errors")} icon="!" tone="red" caption={t("caption30d")} series={days.map((d) => d.errors)} invert />
        <StatCard value={total.denied} label={t("kpi.denied")} icon="⊘" tone="orange" caption={t("caption30d")} series={days.map((d) => d.denied)} invert />
      </div>

      {/* Chart + by feature ----------------------------------------------- */}
      <div className="mb-6 grid gap-6 xl:grid-cols-5">
        <Panel title={t("chartTitle")} className="xl:col-span-3">
          <BarChart
            labels={days.map((d) => d.day.slice(5))}
            series={[
              { key: "ok", label: t("seriesOk"), colour: "var(--blue)", values: days.map((d) => d.ok) },
              { key: "denied", label: t("seriesDenied"), colour: "var(--warning)", values: days.map((d) => d.denied) },
              { key: "errors", label: t("seriesErrors"), colour: "var(--crimson)", values: days.map((d) => d.errors) },
            ]}
            emptyLabel={t("chartEmpty")}
          />
        </Panel>
        <Panel title={t("byFeatureTitle")} hint={t("byFeatureHint")} className="xl:col-span-2" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface text-left text-muted">
                <tr>
                  <th className="px-4 py-2">{t("cols.feature")}</th><th className="px-2 py-2 text-right">{t("cols.jobs")}</th>
                  <th className="px-2 py-2 text-right">{t("cols.denied")}</th><th className="px-2 py-2 text-right">{t("cols.errors")}</th>
                  <th className="px-2 py-2 text-right">{t("cols.cost")}</th><th className="px-2 py-2 text-right">{t("cols.users")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(byFeature ?? []).map((r: { feature: string; jobs: number; denied: number; errors: number; cost_micros: number; users: number }) => (
                  <tr key={r.feature}>
                    <td className="px-4 py-2 font-mono">{r.feature}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.jobs}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.denied}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.errors}</td>
                    <td className="px-2 py-2 text-right tabular-nums" data-cost-known={costKnown ? "1" : "0"}>{costOf(+r.cost_micros)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.users}</td>
                  </tr>
                ))}
                {!byFeature?.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">{t("noJobs")}</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* Model routing ---------------------------------------------------- */}
      <Panel title={t("modelsTitle")} hint={t("modelsHint")} className="mb-6" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th className="px-4 py-2">{t("modelCols.feature")}</th><th className="px-2 py-2">{t("modelCols.provider")}</th>
                <th className="px-2 py-2">{t("modelCols.model")}</th><th className="px-2 py-2">{t("modelCols.fallback")}</th>
                <th className="px-2 py-2">{t("modelCols.tier")}</th><th className="px-2 py-2">{t("modelCols.costIn")}</th>
                <th className="px-2 py-2">{t("modelCols.costOut")}</th><th className="px-2 py-2">{t("modelCols.enabled")}</th><th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(models ?? []).map((m) => (
                <tr key={m.feature}>
                  <td colSpan={9} className="p-0">
                    <form action={updateModel} className="grid min-w-[1040px] grid-cols-[1.2fr_0.9fr_1.3fr_1.6fr_0.9fr_0.7fr_0.7fr_0.4fr_auto] items-center gap-2 px-4 py-2">
                      <input type="hidden" name="feature" value={m.feature} />
                      <input type="hidden" name="max_output_tokens" value={m.max_output_tokens} />
                      <span className="font-mono" title={m.description}>{m.feature}</span>
                      <select name="provider" defaultValue={m.provider} className={input}>
                        <option value="gemini">gemini</option><option value="anthropic">anthropic</option><option value="none">{t("providerNone")}</option>
                      </select>
                      <input name="model" defaultValue={m.model} className={input} />
                      <span className="flex gap-1">
                        <select name="fallback_provider" defaultValue={m.fallback_provider ?? ""} className={input}>
                          <option value="">—</option><option value="gemini">gemini</option><option value="anthropic">anthropic</option>
                        </select>
                        <input name="fallback_model" defaultValue={m.fallback_model ?? ""} className={input} />
                      </span>
                      <select name="tier" defaultValue={m.tier} className={input}>
                        <option value="standard">standard</option><option value="premium">premium</option>
                      </select>
                      <input name="input_cost_micros_per_1k" type="number" min={0} defaultValue={m.input_cost_micros_per_1k} className={input} />
                      <input name="output_cost_micros_per_1k" type="number" min={0} defaultValue={m.output_cost_micros_per_1k} className={input} />
                      <input name="enabled" type="checkbox" defaultChecked={m.enabled} className="h-4 w-4" />
                      <button type="submit" className={btn}>{t("save")}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Settings --------------------------------------------------------- */}
      <Panel title={t("settingsTitle")} hint={t("settingsHint")} className="mb-6">
        <form action={updateSettings} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
            <input name="enabled" type="checkbox" defaultChecked={settings?.enabled ?? true} className="h-4 w-4" />
            {t("settings.enabled")}
          </label>
          <label className="text-xs text-muted">{t("settings.dailyCap")}
            <input name="daily_platform_cap_micros" type="number" min={0} defaultValue={settings?.daily_platform_cap_micros ?? 0} className={`${input} mt-1`} />
          </label>
          <label className="text-xs text-muted">{t("settings.monthlyCap")}
            <input name="monthly_platform_cap_micros" type="number" min={0} defaultValue={settings?.monthly_platform_cap_micros ?? 0} className={`${input} mt-1`} />
          </label>
          <label className="text-xs text-muted">{t("settings.perUserDailyCap")}
            <input name="per_user_daily_cap" type="number" min={0} defaultValue={settings?.per_user_daily_cap ?? 0} className={`${input} mt-1`} />
          </label>
          <label className="text-xs text-muted">{t("settings.threshold")}
            <input name="circuit_error_threshold" type="number" min={1} defaultValue={settings?.circuit_error_threshold ?? 5} className={`${input} mt-1`} />
          </label>
          <div className="flex items-end gap-3 text-xs sm:col-span-2">
            <span className={`rounded-full px-3 py-1 font-semibold ${circuitOpen ? "bg-crimson-soft text-crimson" : "bg-success/10 text-success"}`}>
              {circuitOpen ? t("settings.circuitOpen", { until: new Date(settings!.circuit_open_until!).toLocaleTimeString() }) : t("settings.circuitClosed")}
            </span>
            {circuitOpen && (
              <label className="flex items-center gap-2"><input name="close_circuit" type="checkbox" className="h-4 w-4" />{t("settings.reset")}</label>
            )}
            <button type="submit" className={`${btn} ml-auto`}>{t("save")}</button>
          </div>
        </form>
      </Panel>

      {/* Roles ------------------------------------------------------------ */}
      <Panel title={t("rolesTitle")} hint={t("rolesHint")} className="mb-6" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th className="px-4 py-2">{t("roleCols.role")}</th><th className="px-2 py-2">{t("roleCols.category")}</th>
                <th className="px-2 py-2">{t("roleCols.tier")}</th><th className="px-2 py-2">{t("roleCols.route")}</th><th className="px-2 py-2">{t("roleCols.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(roles ?? []).map((r) => (
                <tr key={r.key}>
                  <td className="px-4 py-2">
                    <span className="font-medium">{(r.name as Record<string, string>).en}</span>
                    <span className="ml-2 font-mono text-muted">{r.key}</span>
                  </td>
                  <td className="px-2 py-2 font-mono text-muted">{r.category}</td>
                  <td className="px-2 py-2">{r.tier}</td>
                  <td className="px-2 py-2 font-mono text-muted">{r.external_url ? "Hero ↗" : r.route ?? "—"}</td>
                  <td className="px-2 py-2">
                    <form action={updateRoleStatus} className="flex items-center gap-2">
                      <input type="hidden" name="key" value={r.key} />
                      <select name="status" defaultValue={r.status} className={input}>
                        <option value="live">{t("roleStatus.live")}</option>
                        <option value="planned">{t("roleStatus.planned")}</option>
                        <option value="hidden">{t("roleStatus.hidden")}</option>
                      </select>
                      <button type="submit" className={btn}>{t("save")}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Characters -------------------------------------------------------- */}
      <Panel title={t("personasTitle")} hint={t("personasHint")} className="mb-6" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th className="px-4 py-2">{t("personaCols.role")}</th>
                <th className="px-2 py-2">{t("personaCols.default")}</th>
                <th className="px-2 py-2">{t("personaCols.my")}</th>
                <th className="px-2 py-2">{t("personaCols.id")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(roles ?? []).map((r) => {
                const d = personaDefault.get(r.key);
                return (
                  <tr key={r.key}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {d?.avatar_path && <Image src={d.avatar_path} alt="" width={28} height={28} unoptimized className="h-7 w-7 rounded-full object-cover" />}
                        <span className="font-medium">{(r.name as Record<string, string>).en}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 font-semibold text-indigo">{d ? `✦ ${d.name}` : "—"}</td>
                    {(["MY", "ID"] as const).map((c) => {
                      const v = personaFor(r.key, c);
                      return (
                        <td key={c} className="px-2 py-2">
                          <form action={upsertPersonaVariant} className="flex items-center gap-1">
                            <input type="hidden" name="roleKey" value={r.key} />
                            <input type="hidden" name="country" value={c} />
                            <input name="name" defaultValue={v?.name ?? ""} placeholder={t("personaSame")} maxLength={40} className={`${input} w-28`} aria-label={`${r.key} ${c}`} />
                            <button type="submit" className={btn}>{t("save")}</button>
                          </form>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Market facts & closing steps ------------------------------------- */}
      <Panel title={t("knowledgeTitle")} hint={t("knowledgeHint")} className="mb-6" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t("factsTitle")}</p>
          <table className="w-full text-xs">
            <thead className="text-left text-muted"><tr><th className="px-4 py-2">{t("knowCols.country")}</th><th className="px-2 py-2">{t("knowCols.item")}</th><th className="px-2 py-2">{t("knowCols.verifiedAt")}</th><th className="px-2 py-2">{t("knowCols.status")}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {(facts ?? []).map((f) => knowledgeRow("market_facts", f, `${f.audience} · ${f.topic}`, ((f.body as Record<string, string>)?.en ?? "")))}
            </tbody>
          </table>
          <p className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">{t("stepsTitle")}</p>
          <table className="w-full text-xs">
            <thead className="text-left text-muted"><tr><th className="px-4 py-2">{t("knowCols.country")}</th><th className="px-2 py-2">{t("knowCols.item")}</th><th className="px-2 py-2">{t("knowCols.verifiedAt")}</th><th className="px-2 py-2">{t("knowCols.status")}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {(steps ?? []).map((s) => knowledgeRow("closing_steps", s, `${s.transaction_type} · ${s.position}`, ((s.title as Record<string, string>)?.en ?? "")))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Recent ----------------------------------------------------------- */}
      <Panel title={t("recentTitle")} hint={t("recentHint")} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th className="px-4 py-2">{t("recentCols.when")}</th><th className="px-2 py-2">{t("recentCols.agent")}</th>
                <th className="px-2 py-2">{t("recentCols.feature")}</th><th className="px-2 py-2">{t("recentCols.status")}</th>
                <th className="px-2 py-2">{t("recentCols.model")}</th><th className="px-2 py-2 text-right">{t("recentCols.tokens")}</th>
                <th className="px-2 py-2 text-right">{t("recentCols.cost")}</th><th className="px-2 py-2 text-right">{t("recentCols.latency")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(recent ?? []).map((j) => (
                <tr key={j.id}>
                  <td className="px-4 py-2 tabular-nums text-muted">{new Date(j.created_at).toLocaleString()}</td>
                  <td className="px-2 py-2">{nameOf.get(j.user_id) ?? "—"}</td>
                  <td className="px-2 py-2 font-mono">{j.feature}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${j.status === "ok" ? "bg-success/10 text-success" : j.status === "denied" ? "bg-warning/10 text-warning" : "bg-crimson-soft text-crimson"}`}>
                      {t(`status.${j.status}` as never)}{j.denied_reason ? ` · ${j.denied_reason}` : j.error ? ` · ${j.error}` : ""}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-muted">{j.model ? `${j.provider}/${j.model}` : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{j.tokens_in + j.tokens_out}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{costOf(+j.cost_micros)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{j.latency_ms ?? "—"}</td>
                </tr>
              ))}
              {!recent?.length && <tr><td colSpan={8} className="px-4 py-6 text-center text-muted">{t("noJobs")}</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
