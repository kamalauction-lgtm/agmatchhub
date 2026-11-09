import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { CommandHeader } from "@/components/ui/command-header";
import { Badge } from "@/components/ui/badge";
import { WorkforceGallery, type WorkerItem, type WorkforceLabels } from "@/components/ai/workforce-gallery";
import { aiQuotaFor } from "@/lib/ai/engine";

/**
 * The AI Workforce directory: the 36 roles from `ai_roles`, grouped by what
 * they do, in the agent's language — each one a CHARACTER (`ai_role_personas`,
 * 00097): a name, a portrait from the owner's six character sheets, a one-line
 * persona and three strengths. The cast is the default row per role unless a
 * row for the agent's country exists, which wins (Decision: country first).
 *
 * A live role opens the surface where it already works — it is not a chat
 * window of its own. A planned role says so plainly. A role that lives in
 * AG Hero is named but not linked until the agent has linked their Hero
 * account (E8); an unlinked agent gains nothing from a login page.
 *
 * Presentation (futuristic pilot, step 2): search, category navigation and the
 * worker detail dialog live in `WorkforceGallery`. This page only computes the
 * facts and their labels. It does not decide what a role can do.
 */

export const dynamic = "force-dynamic";

type Role = {
  key: string; category: string; sort: number; status: "live" | "planned" | "hidden"; tier: "core" | "premium";
  route: string | null; external_url: string | null; name: Record<string, string>; description: Record<string, string>;
};
type Persona = {
  role_key: string; country_code: string | null; name: string;
  tagline: Record<string, string>; skills: Record<string, string[]>; portrait_path: string | null; avatar_path: string | null;
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

  const [{ data: rolesRaw }, { data: personasRaw }, quota, { data: profile }, { data: heroLink }] = await Promise.all([
    supabase.from("ai_roles").select("key, category, sort, status, tier, route, external_url, name, description").neq("status", "hidden"),
    supabase.from("ai_role_personas").select("role_key, country_code, name, tagline, skills, portrait_path, avatar_path"),
    aiQuotaFor(user.id),
    supabase.from("profiles").select("agent_status, country_code").eq("id", user.id).maybeSingle(),
    supabase.from("hero_links").select("status").eq("user_id", user.id).maybeSingle(),
  ]);
  // Hero-hosted roles open for linked AG Hero agents only (E8).
  const heroLinked = heroLink?.status === "linked";
  const roles = (rolesRaw ?? []) as Role[];
  const verified = profile?.agent_status === "verified";
  const country = profile?.country_code ?? null;
  const pick = (m: Record<string, string>) => m[locale] ?? m.en ?? Object.values(m)[0] ?? "";
  const pickList = (m: Record<string, string[]> | null | undefined) => m?.[locale] ?? m?.en ?? [];

  // The cast: the agent's country row wins over the default row.
  const personaOf = new Map<string, Persona>();
  for (const p of (personasRaw ?? []) as Persona[]) {
    const cur = personaOf.get(p.role_key);
    if (!cur || (p.country_code && p.country_code === country)) personaOf.set(p.role_key, p);
    else if (cur.country_code && cur.country_code !== country && !p.country_code) personaOf.set(p.role_key, p);
  }
  const countryCast = country ? ((personasRaw ?? []) as Persona[]).some((p) => p.country_code === country) : false;

  const byCategory = new Map<string, Role[]>();
  for (const r of roles) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
  const categoryKeys = [...CATEGORY_ORDER.filter((c) => byCategory.has(c)), ...[...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c))];
  const live = roles.filter((r) => r.status === "live").length;

  // Every fact the gallery shows, decided here from verified backend state.
  const items: WorkerItem[] = categoryKeys.flatMap((cat) =>
    (byCategory.get(cat) ?? []).sort((a, b) => a.sort - b.sort).map((r): WorkerItem => {
      const p = personaOf.get(r.key);
      const isLive = r.status === "live" && !!r.route;
      const heroOpen = heroLinked && !!r.external_url;
      const actionHref = isLive ? r.route! : heroOpen ? r.external_url! : null;
      return {
        key: r.key,
        category: cat,
        name: pick(r.name),
        persona: p?.name ?? null,
        tagline: p ? pick(p.tagline) : "",
        description: pick(r.description),
        skills: pickList(p?.skills).slice(0, 3),
        portrait: p?.portrait_path ?? null,
        premium: r.tier === "premium",
        statusTone: isLive ? "success" : r.external_url ? "accent" : "neutral",
        statusLabel: isLive ? t("status.live") : r.external_url ? t("status.hero") : t("status.planned"),
        actionHref,
        actionExternal: !isLive && heroOpen,
        actionLabel: t("open"),
        unavailableHint: r.external_url ? t("heroHint") : t("comingSoon"),
        alsoHeroHref: isLive && heroOpen ? r.external_url! : null,
        alsoHeroLabel: isLive && heroOpen ? t("alsoHero") : null,
      };
    })
  );

  const categories = categoryKeys.map((c) => ({ key: c, label: t(`category.${c}` as never) }));
  const labels: WorkforceLabels = {
    search: t("search"),
    allCategories: t("allCategories"),
    noResults: t("noResults"),
    close: t("close"),
    detailStatus: t("detailStatus"),
    detailSkills: t("detailSkills"),
    premium: t("premium"),
    alsoHero: t("alsoHero"),
  };

  return (
    <AgentShell wide>
      <div className="space-y-8">
        {/* Command band: fixed colours so the text stays legible in dark mode. */}
        <CommandHeader className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <h1>{t("title")}</h1>
            <p className="command-muted mt-2 text-sm">{t("meet")}</p>
            <p className="command-muted mt-1 text-sm">{t("intro")}</p>
            <p className="command-muted mt-3 text-xs">{t("catalogueNote", { count: roles.length })}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="accent">{t("specialists", { count: roles.length })}</Badge>
            {countryCast && country && <Badge tone="accent">{t("castCountry", { country })}</Badge>}
            {quota && verified && (
              <Badge tone="info">{t("quota", { remaining: quota.remaining, total: quota.monthly_allowance })}</Badge>
            )}
          </div>
        </CommandHeader>

        {!verified && (
          <p className="rounded-xl border border-crimson/30 bg-crimson-soft px-5 py-4 text-sm">
            {t("verifyFirst")}{" "}
            <Link href="/verification" className="font-semibold text-crimson underline">{t("verifyLink")}</Link>
          </p>
        )}

        <WorkforceGallery items={items} categories={categories} labels={labels} />

        <p className="text-xs text-muted">{t("statusNote")}</p>
      </div>
    </AgentShell>
  );
}
