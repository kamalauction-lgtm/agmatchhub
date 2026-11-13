import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, capabilityCountries } from "@/lib/authz";

const FILTERS = ["new", "under_review", "additional_information_required", "verified", "rejected", "suspended", "banned", "all"] as const;
/** Review window for new agents, in hours (owner: 24 by default, longer when needed). */
const WINDOWS = [24, 48, 72, 168] as const;
/** Start of the review window, as an ISO timestamp (request time, server side). */
function windowStart(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

export default async function AgentQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; country?: string; h?: string }>;
}) {
  await requireCapability("agent.verify");
  const sp = await searchParams;
  // Since 00129 new agents start working at once; admins review them here
  // afterwards, so "new" is the default queue.
  const status = sp.status ?? "new";
  const hours = (WINDOWS as readonly number[]).includes(Number(sp.h)) ? Number(sp.h) : WINDOWS[0];
  // Agent 360 queue search and filter (P1-d-1). The name is matched literally:
  // PostgREST pattern characters are stripped before use.
  const q = (sp.q ?? "").replace(/[%_,()*\\]/g, " ").trim().slice(0, 80);
  const country = /^[A-Z]{2}$/.test(sp.country ?? "") ? sp.country! : "";
  const supabase = await createClient();
  const t = await getTranslations("admin");
  const td = await getTranslations("dashboard");

  let query = supabase
    .from("profiles")
    .select("id, display_name, agent_status, country_code, created_at, agent_profiles(agency_name, licence_number, country_code, submitted_at)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status === "new") {
    query = query
      .gte("created_at", windowStart(hours))
      .not("agent_status", "in", "(verified,banned)");
  } else if (status !== "all") query = query.eq("agent_status", status);
  const scope = await capabilityCountries("agent.verify");
  if (scope) query = query.in("country_code", scope);
  if (country) query = query.eq("country_code", country);
  if (q) query = query.ilike("display_name", `%${q}%`);
  const countries = scope ?? ["ID", "MY"];
  const keep = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ status, ...(status === "new" ? { h: String(hours) } : {}), ...(q ? { q } : {}), ...(country ? { country } : {}), ...extra });
    return `/admin/agents?${u.toString()}`;
  };
  const { data: rows } = await query;
  const joined = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("agentsTitle")}</h1>

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={keep({ status: f })}
            className={`rounded-full border px-3 py-1 ${
              f === status
                ? "border-crimson bg-crimson-soft font-semibold text-crimson"
                : "border-line text-muted hover:text-foreground"
            }`}
          >
            {f === "all" ? t("filterAll") : f === "new" ? t("agentQueue.newAgents") : td(`status.${f}`)}
          </Link>
        ))}
      </div>

      {status === "new" && (
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm" data-review-window={hours}>
          <span className="text-muted">{t("agentQueue.window")}</span>
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={keep({ h: String(w) })}
              className={`rounded-full border px-3 py-1 ${w === hours ? "border-crimson font-semibold text-crimson" : "border-line text-muted hover:text-foreground"}`}
            >
              {t("agentQueue.hours", { n: w })}
            </Link>
          ))}
          <span className="basis-full text-xs text-muted">{t("agentQueue.newHint")}</span>
        </div>
      )}

      <form method="get" action="/admin/agents" className="mb-6 flex flex-wrap items-end gap-2 text-sm" data-agent-search="1">
        <input type="hidden" name="status" value={status} />
        <label className="block">
          <span className="mb-1 block text-xs text-muted">{t("agentQueue.search")}</span>
          <input name="q" defaultValue={q} maxLength={80} className="min-h-10 rounded-lg border border-line bg-background px-3" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">{t("agentQueue.country")}</span>
          <select name="country" defaultValue={country} className="min-h-10 rounded-lg border border-line bg-background px-2">
            <option value="">{t("agentQueue.allCountries")}</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button type="submit" className="min-h-10 cursor-pointer rounded-lg border border-line px-3 font-medium hover:border-crimson hover:text-crimson">{t("agentQueue.apply")}</button>
      </form>

      {!rows?.length ? (
        <p className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">
          {t("emptyQueue")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs text-muted uppercase">
              <tr>
                <th className="px-4 py-3">{t("cols.agent")}</th>
                <th className="px-4 py-3">{t("cols.agency")}</th>
                <th className="px-4 py-3">{t("cols.licence")}</th>
                <th className="px-4 py-3">{t("cols.country")}</th>
                <th className="px-4 py-3">{t("cols.status")}</th>
                <th className="px-4 py-3">{t("agentQueue.joined")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ap = Array.isArray(r.agent_profiles) ? r.agent_profiles[0] : r.agent_profiles;
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium">{r.display_name}</td>
                    <td className="px-4 py-3">{ap?.agency_name ?? "—"}</td>
                    <td className="px-4 py-3">{ap?.licence_number ?? "—"}</td>
                    <td className="px-4 py-3">{r.country_code ?? ap?.country_code ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-surface px-2 py-1 text-xs font-medium">
                        {td(`status.${r.agent_status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{r.created_at ? joined.format(new Date(r.created_at)) : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/agents/${r.id}`} className="font-medium text-crimson hover:underline">
                        {t("review")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
