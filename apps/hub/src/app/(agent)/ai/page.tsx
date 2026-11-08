import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { aiQuotaFor } from "@/lib/ai/engine";

/**
 * The AI Workforce directory: the 36 roles from `ai_roles`, grouped by what
 * they do, in the agent's language.
 *
 * A live role opens the surface where it already works — it is not a chat
 * window of its own. A planned role says so plainly. A role that lives in
 * AG Hero is named but not linked until the agent has linked their Hero
 * account (E8); an unlinked agent gains nothing from a login page.
 */

export const dynamic = "force-dynamic";

type Role = {
  key: string; category: string; sort: number; status: "live" | "planned" | "hidden"; tier: "core" | "premium";
  route: string | null; external_url: string | null; name: Record<string, string>; description: Record<string, string>;
};

const CATEGORY_ORDER = [
  "admin_productivity", "leads_crm", "whatsapp_email", "marketing_content", "property_matching", "appointments",
  "listing_research", "property_management", "posters_video_social", "sales_transaction", "team_training", "international",
];

export default async function AiWorkforcePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = await getTranslations("aiWorkforce");

  const [{ data: rolesRaw }, quota, { data: profile }, { data: heroLink }] = await Promise.all([
    supabase.from("ai_roles").select("key, category, sort, status, tier, route, external_url, name, description").neq("status", "hidden"),
    aiQuotaFor(user.id),
    supabase.from("profiles").select("agent_status").eq("id", user.id).maybeSingle(),
    supabase.from("hero_links").select("status").eq("user_id", user.id).maybeSingle(),
  ]);
  // Hero-hosted roles open for linked AG Hero agents only (E8).
  const heroLinked = heroLink?.status === "linked";
  const roles = (rolesRaw ?? []) as Role[];
  const verified = profile?.agent_status === "verified";
  const pick = (m: Record<string, string>) => m[locale] ?? m.en ?? Object.values(m)[0] ?? "";

  const byCategory = new Map<string, Role[]>();
  for (const r of roles) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
  const categories = [...CATEGORY_ORDER.filter((c) => byCategory.has(c)), ...[...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c))];
  const live = roles.filter((r) => r.status === "live").length;

  return (
    <AgentShell wide>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <h1>{t("title")}</h1>
            <p className="mt-1 text-sm text-muted">{t("intro")}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-success/10 px-3 py-1 font-semibold text-success">{t("liveCount", { count: live })}</span>
            {quota && verified && (
              <span className="rounded-full bg-blue-soft px-3 py-1 font-semibold text-blue">
                {t("quota", { remaining: quota.remaining, total: quota.monthly_allowance })}
              </span>
            )}
          </div>
        </header>

        {!verified && (
          <p className="rounded-xl border border-crimson/30 bg-crimson-soft px-5 py-4 text-sm">
            {t("verifyFirst")}{" "}
            <Link href="/verification" className="font-semibold text-crimson underline">{t("verifyLink")}</Link>
          </p>
        )}

        {categories.map((cat) => (
          <section key={cat}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t(`category.${cat}` as never)}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(byCategory.get(cat) ?? []).sort((a, b) => a.sort - b.sort).map((r) => {
                const isLive = r.status === "live" && !!r.route;
                const heroOpen = heroLinked && !!r.external_url;
                const card = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold">{pick(r.name)}</h3>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          isLive ? "bg-success/10 text-success" : r.external_url ? "bg-indigo-soft text-indigo" : "bg-surface text-muted"
                        }`}
                      >
                        {isLive ? t("status.live") : r.external_url ? t("status.hero") : t("status.planned")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{pick(r.description)}</p>
                    <p className="mt-3 text-xs font-medium">
                      {r.tier === "premium" && <span className="mr-2 rounded bg-warning-soft px-1.5 py-0.5 text-warning">{t("premium")}</span>}
                      {isLive || heroOpen ? <span className="text-blue">{t("open")} {heroOpen ? "↗" : "→"}</span> : <span className="text-muted">{r.external_url ? t("heroHint") : t("comingSoon")}</span>}
                    </p>
                  </>
                );
                return isLive ? (
                  <Link key={r.key} href={r.route!} className="rounded-xl border border-line bg-card p-5 shadow-card transition-colors duration-150 hover:border-blue">
                    {card}
                  </Link>
                ) : heroOpen ? (
                  <a key={r.key} href={r.external_url!} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-line bg-card p-5 shadow-card transition-colors duration-150 hover:border-indigo">
                    {card}
                  </a>
                ) : (
                  <div key={r.key} className="rounded-xl border border-dashed border-line bg-card/60 p-5">
                    {card}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </AgentShell>
  );
}
