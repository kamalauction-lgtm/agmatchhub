import { getTranslations, getFormatter } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { Panel, StatCard } from "@/components/admin/panel";
import { heroConfigured } from "@/lib/hero/client";
import { benefitDateInput } from "@/lib/hero/dates";
import { updateHeroBenefits, regrantAllHero, recheckHeroLink } from "./actions";

/**
 * AG Hero: who is linked, what the launch benefit is worth, when it ends.
 * Values are rows; the dates are not hard-coded anywhere (Decision 3).
 */
export const dynamic = "force-dynamic";

export default async function AdminHeroPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireCapability("commercial.manage");
  const { notice } = await searchParams;
  const t = await getTranslations("adminHero");
  const format = await getFormatter();
  const supabase = await createClient();

  const [{ data: benefits }, { data: links }, { data: grantCounts }] = await Promise.all([
    supabase.from("hero_benefits").select("*").limit(1).maybeSingle(),
    supabase.from("hero_links").select("user_id, status, method, linked_at, last_checked_at, last_result, last_error, hero_country, hero_membership_status").order("last_checked_at", { ascending: false }).limit(200),
    supabase.from("entitlement_grants").select("user_id").eq("source", "hero_benefit").is("revoked_at", null).gt("effective_until", new Date().toISOString()),
  ]);
  const userIds = Array.from(new Set((links ?? []).map((l) => l.user_id)));
  const { data: people } = userIds.length
    ? await supabase.from("profiles").select("id, display_name, country_code").in("id", userIds)
    : { data: [] as { id: string; display_name: string | null; country_code: string | null }[] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p]));
  const grantsBy = new Map<string, number>();
  for (const g of grantCounts ?? []) grantsBy.set(g.user_id, (grantsBy.get(g.user_id) ?? 0) + 1);

  const linked = (links ?? []).filter((l) => l.status === "linked").length;
  const stale = (links ?? []).filter((l) => l.status === "stale").length;
  const input = "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm";
  const btn = "min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold hover:border-crimson hover:text-crimson";

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 max-w-3xl text-sm text-muted">{t("intro")}</p>

      {notice && (
        <p className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${["updated", "regranted", "linked"].includes(notice) ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {t(`notice.${notice}` as never)}
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard value={linked} label={t("kpi.linked")} icon="⬢" tone="green" />
        <StatCard value={stale} label={t("kpi.stale")} icon="⚠" tone="orange" invert />
        <StatCard value={heroConfigured() ? t("kpi.keyOn") : t("kpi.keyOff")} label={t("kpi.key")} icon="⚿" tone={heroConfigured() ? "blue" : "red"} />
      </div>

      {/* Benefit values ---------------------------------------------------- */}
      <Panel title={t("benefitsTitle")} hint={t("benefitsHint")} className="mb-6">
        {benefits && (
          <form action={updateHeroBenefits} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-sm lg:col-span-4">
              <input name="enabled" type="checkbox" defaultChecked={benefits.enabled} className="h-4 w-4" />{t("f.enabled")}
            </label>
            <label className="text-xs text-muted">{t("f.listings")}<input name="listing_active_limit" type="number" min={0} defaultValue={benefits.listing_active_limit} className={`${input} mt-1`} /></label>
            <label className="text-xs text-muted">{t("f.aiTasks")}<input name="ai_monthly_usage" type="number" min={0} defaultValue={benefits.ai_monthly_usage} className={`${input} mt-1`} /></label>
            <label className="text-xs text-muted">{t("f.posters")}<input name="ai_poster_exports" type="number" min={0} defaultValue={benefits.ai_poster_exports} className={`${input} mt-1`} /></label>
            <label className="text-xs text-muted">{t("f.grace")}<input name="grace_days" type="number" min={0} max={90} defaultValue={benefits.grace_days} className={`${input} mt-1`} /></label>
            <label className="flex items-center gap-2 text-sm"><input name="matchhub_enabled" type="checkbox" defaultChecked={benefits.matchhub_enabled} className="h-4 w-4" />{t("f.matchhub")}</label>
            <label className="flex items-center gap-2 text-sm"><input name="comarketing_enabled" type="checkbox" defaultChecked={benefits.comarketing_enabled} className="h-4 w-4" />{t("f.comarketing")}</label>
            <label className="text-xs text-muted">{t("f.studio")}
              <select name="content_studio_level" defaultValue={benefits.content_studio_level} className={`${input} mt-1`}>
                {["none", "basic", "advanced"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">{t("f.roles")}
              <select name="ai_roles_tier" defaultValue={benefits.ai_roles_tier} className={`${input} mt-1`}>
                {["none", "core", "workforce"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">{t("f.expires")}<input name="expires_at" type="date" defaultValue={benefitDateInput(benefits.expires_at)} className={`${input} mt-1`} /></label>
            <label className="text-xs text-muted">{t("f.review")}<input name="review_at" type="date" defaultValue={benefitDateInput(benefits.review_at)} className={`${input} mt-1`} /></label>
            <div className="flex items-end gap-2 lg:col-span-2">
              <button type="submit" className={btn}>{t("save")}</button>
            </div>
          </form>
        )}
        <form action={regrantAllHero} className="mt-4 border-t border-line pt-4">
          <button type="submit" className={btn}>{t("regrant")}</button>
          <span className="ml-3 text-xs text-muted">{t("regrantHint")}</span>
        </form>
      </Panel>

      {/* Links -------------------------------------------------------------- */}
      <Panel title={t("linksTitle")} hint={t("linksHint")} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th className="px-4 py-2">{t("cols.agent")}</th><th className="px-2 py-2">{t("cols.status")}</th><th className="px-2 py-2">{t("cols.method")}</th>
                <th className="px-2 py-2">{t("cols.hero")}</th><th className="px-2 py-2">{t("cols.grants")}</th><th className="px-2 py-2">{t("cols.checked")}</th><th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(links ?? []).map((l) => (
                <tr key={l.user_id}>
                  <td className="px-4 py-2">{nameOf.get(l.user_id)?.display_name ?? "—"} <span className="text-muted">{nameOf.get(l.user_id)?.country_code ?? ""}</span></td>
                  <td className="px-2 py-2">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${l.status === "linked" ? "bg-success/10 text-success" : l.status === "stale" ? "bg-warning/10 text-warning" : "bg-surface text-muted"}`}>{l.status}</span>
                    {l.last_result === "error" && <span className="ml-1 text-danger" title={l.last_error ?? ""}>!</span>}
                  </td>
                  <td className="px-2 py-2">{l.method}</td>
                  <td className="px-2 py-2 text-muted">{[l.hero_country, l.hero_membership_status].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-2 py-2 tabular-nums">{grantsBy.get(l.user_id) ?? 0}</td>
                  <td className="px-2 py-2 text-muted">{format.relativeTime(new Date(l.last_checked_at))}</td>
                  <td className="px-2 py-2">
                    <form action={recheckHeroLink}><input type="hidden" name="userId" value={l.user_id} /><button type="submit" className={btn}>{t("recheck")}</button></form>
                  </td>
                </tr>
              ))}
              {!links?.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">{t("noLinks")}</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
