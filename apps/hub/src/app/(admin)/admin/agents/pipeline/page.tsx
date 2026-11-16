import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, capabilityCountries } from "@/lib/authz";
import { addProspect, deleteProspect, setProspectStage } from "./actions";

/**
 * Agent Acquisition Pipeline (screen 2, 00126): a small pre-account CRM for
 * agents the team wants to recruit. agent.invite, country-scoped by RLS. A
 * country accepts prospects only once its retention period is set (owner
 * decision 5); each card shows the date it will be deleted.
 */
const STAGES = ["new", "contacted", "interested", "invited", "declined", "converted"] as const;
const SOURCES = ["referral", "event", "portal_listing", "social", "inbound", "other"] as const;
type Prospect = { id: string; country_code: string; full_name: string; phone: string | null; email: string | null; agency_name: string | null; source: string; source_note: string | null; purpose_note: string; stage: string; last_contact_at: string | null; delete_after: string; created_at: string };

export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  await requireCapability("agent.invite");
  const sp = await searchParams;
  const t = await getTranslations("adminPipeline");
  const supabase = await createClient();
  const scope = await capabilityCountries("agent.invite");
  let cq = supabase.from("countries").select("code, name, settings").eq("active", true).order("name");
  if (scope) cq = cq.in("code", scope);
  const [{ data: countries }, { data: rows }] = await Promise.all([
    cq,
    supabase.from("agent_prospects").select("id, country_code, full_name, phone, email, agency_name, source, source_note, purpose_note, stage, last_contact_at, delete_after, created_at").order("created_at", { ascending: false }).limit(500),
  ]);
  const retention = new Map((countries ?? []).map((c) => [c.code, Number(((c.settings ?? {}) as { prospect_retention_days?: unknown }).prospect_retention_days) || null]));
  const ready = (countries ?? []).filter((c) => { const d = retention.get(c.code); return !!d && d >= 30 && d <= 730; });
  const prospects = (rows ?? []) as Prospect[];
  const field = "min-h-10 w-full rounded-lg border border-line bg-background px-3 text-sm";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin/agents" className="text-sm text-muted hover:text-foreground">← {t("back")}</Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 max-w-3xl text-sm text-muted">{t("hint")}</p>
      {sp.done && <p className="mb-4 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success" role="status">{t(`done.${sp.done}` as never)}</p>}
      {sp.error && <p className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{t.has(`errors.${sp.error}` as never) ? t(`errors.${sp.error}` as never) : t("errors.not_permitted")}</p>}

      {/* Retention per country: the owner's decision gates storage. */}
      <ul className="mb-6 flex flex-wrap gap-2 text-xs" data-retention="1">
        {(countries ?? []).map((c) => (
          <li key={c.code} className={`rounded-full px-3 py-1 ${retention.get(c.code) ? "bg-surface" : "bg-warning/10 text-warning"}`} data-retention-country={c.code} data-retention-days={retention.get(c.code) ?? ""}>
            {c.code}: {retention.get(c.code) ? t("retentionDays", { n: retention.get(c.code)! }) : t("retentionNotSet")}
          </li>
        ))}
      </ul>

      {ready.length === 0 ? (
        <p className="mb-8 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm" data-pipeline-locked="1">{t("locked")}</p>
      ) : (
        <details className="mb-8 rounded-xl border border-line p-4" data-prospect-add="1">
          <summary className="cursor-pointer text-sm font-semibold">{t("add")}</summary>
          <form action={addProspect} className="mt-3 grid gap-3 sm:grid-cols-3">
            <select name="countryCode" required defaultValue="" className={field} aria-label={t("fields.country")}>
              <option value="" disabled>{t("fields.country")}</option>
              {ready.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
            </select>
            <input name="fullName" required minLength={2} maxLength={120} placeholder={t("fields.name")} aria-label={t("fields.name")} className={field} />
            <input name="agencyName" maxLength={160} placeholder={t("fields.agency")} aria-label={t("fields.agency")} className={field} />
            <input name="phone" placeholder="+60123456789" aria-label={t("fields.phone")} className={field} />
            <input name="email" type="email" placeholder={t("fields.email")} aria-label={t("fields.email")} className={field} />
            <select name="source" required defaultValue="" className={field} aria-label={t("fields.source")}>
              <option value="" disabled>{t("fields.source")}</option>
              {SOURCES.map((s) => <option key={s} value={s}>{t(`source.${s}`)}</option>)}
            </select>
            <input name="sourceNote" maxLength={300} placeholder={t("fields.sourceNote")} aria-label={t("fields.sourceNote")} className={`${field} sm:col-span-3`} />
            <textarea name="purposeNote" required minLength={3} maxLength={500} rows={2} placeholder={t("fields.purpose")} aria-label={t("fields.purpose")} className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm sm:col-span-3" />
            <div className="sm:col-span-3"><button type="submit" className="min-h-10 cursor-pointer rounded-lg bg-crimson px-4 text-sm font-semibold text-white hover:bg-crimson-strong">{t("addButton")}</button></div>
          </form>
        </details>
      )}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6" data-pipeline={prospects.length}>
        {STAGES.map((stage) => (
          <section key={stage} className="rounded-xl border border-line" data-stage={stage}>
            <h2 className="border-b border-line px-3 py-2 text-sm font-semibold">{t(`stage.${stage}`)} <span className="text-muted">{prospects.filter((p) => p.stage === stage).length}</span></h2>
            <ul className="divide-y divide-line">
              {prospects.filter((p) => p.stage === stage).map((p) => (
                <li key={p.id} className="space-y-1 p-3 text-sm" data-prospect={p.id}>
                  <p className="font-medium">{p.full_name}<span className="ml-1 text-xs text-muted">{p.country_code}</span></p>
                  {p.agency_name && <p className="text-xs text-muted">{p.agency_name}</p>}
                  <p className="text-xs">{t(`source.${p.source}` as never)}{p.source_note ? ` · ${p.source_note}` : ""}</p>
                  <p className="text-xs text-muted">{p.purpose_note}</p>
                  <p className="text-[11px] text-muted" data-delete-after={p.delete_after}>{t("deletesOn", { date: p.delete_after.slice(0, 10) })}</p>
                  <form action={setProspectStage} className="flex gap-1">
                    <input type="hidden" name="prospectId" value={p.id} />
                    <select name="stage" defaultValue={p.stage} className="min-h-9 flex-1 rounded-lg border border-line bg-background px-2 text-xs" aria-label={t("moveTo")}>
                      {STAGES.map((s) => <option key={s} value={s}>{t(`stage.${s}`)}</option>)}
                    </select>
                    <button type="submit" className="min-h-9 cursor-pointer rounded-lg border border-line px-2 text-xs hover:border-crimson">{t("move")}</button>
                  </form>
                  <form action={deleteProspect}>
                    <input type="hidden" name="prospectId" value={p.id} />
                    <button type="submit" className="cursor-pointer text-[11px] text-danger hover:underline">{t("delete")}</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
