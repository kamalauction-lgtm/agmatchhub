import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { Badge } from "@/components/ui/badge";
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
  const categories = [...CATEGORY_ORDER.filter((c) => byCategory.has(c)), ...[...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c))];
  const live = roles.filter((r) => r.status === "live").length;

  return (
    <AgentShell wide>
      <div className="space-y-8">
        {/* Command band: fixed colours so the text stays legible in dark mode. */}
        <header
          className="relative overflow-hidden rounded-3xl p-6 text-white shadow-card sm:p-8"
          style={{ background: "linear-gradient(120deg, #0b1b33 0%, #1c2f4f 60%, #243f6e 100%)" }}
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 max-w-2xl">
              <h1 className="text-white">{t("title")}</h1>
              <p className="mt-2 text-sm text-[#c8d6f2]">{t("meet")}</p>
              <p className="mt-1 text-sm text-[#c8d6f2]">{t("intro")}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="success">{t("liveCount", { count: live })}</Badge>
              {countryCast && country && <Badge tone="accent">{t("castCountry", { country })}</Badge>}
              {quota && verified && (
                <Badge tone="info">{t("quota", { remaining: quota.remaining, total: quota.monthly_allowance })}</Badge>
              )}
            </div>
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
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {(byCategory.get(cat) ?? []).sort((a, b) => a.sort - b.sort).map((r) => {
                const isLive = r.status === "live" && !!r.route;
                const heroOpen = heroLinked && !!r.external_url;
                const p = personaOf.get(r.key);
                const skills = pickList(p?.skills).slice(0, 3);
                const chipTone = isLive ? "success" : r.external_url ? "accent" : "neutral";
                const card = (
                  <>
                    {/* Portrait ----------------------------------------------- */}
                    <div className="relative aspect-[448/232] w-full overflow-hidden rounded-t-2xl bg-blue-soft">
                      {p?.portrait_path ? (
                        <Image
                          src={p.portrait_path}
                          alt={p.name}
                          fill
                          unoptimized
                          sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw"
                          className={`object-cover transition-transform duration-300 group-hover:scale-[1.03] ${isLive || heroOpen ? "" : "saturate-[.6]"}`}
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-4xl text-blue/40">✦</div>
                      )}
                      <Badge tone={chipTone} className="absolute right-3 top-3 shadow-card">
                        {isLive ? t("status.live") : r.external_url ? t("status.hero") : t("status.planned")}
                      </Badge>
                      {r.tier === "premium" && (
                        <span className="absolute left-3 top-3 rounded-full bg-warning-soft px-2.5 py-0.5 text-[11px] font-semibold text-warning shadow-card">{t("premium")}</span>
                      )}
                    </div>

                    {/* Words --------------------------------------------------- */}
                    <div className="p-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-base font-semibold">{pick(r.name)}</h3>
                        {p && <span className="shrink-0 rounded-full bg-indigo-soft px-2.5 py-0.5 text-sm font-bold text-indigo">✦ {p.name}</span>}
                      </div>
                      <p className="mt-1.5 text-sm leading-6 text-muted">{p ? pick(p.tagline) || pick(r.description) : pick(r.description)}</p>
                      {skills.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-1.5">
                          {skills.map((s) => (
                            <li key={s} className="rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-muted-strong">{s}</li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-4 text-xs font-semibold">
                        {isLive || heroOpen
                          ? <span className="text-blue">{t("open")} {heroOpen ? "↗" : "→"}</span>
                          : <span className="text-muted">{r.external_url ? t("heroHint") : t("comingSoon")}</span>}
                      </p>
                    </div>
                  </>
                );
                const base = "group overflow-hidden rounded-2xl border bg-card shadow-card transition-colors duration-150";
                return isLive ? (
                  <div key={r.key} className="flex flex-col gap-1.5">
                    <Link href={r.route!} className={`${base} border-line hover:border-blue`}>{card}</Link>
                    {heroOpen && (
                      <a href={r.external_url!} target="_blank" rel="noopener noreferrer" className="self-end text-xs font-semibold text-indigo hover:underline">{t("alsoHero")} ↗</a>
                    )}
                  </div>
                ) : heroOpen ? (
                  <a key={r.key} href={r.external_url!} target="_blank" rel="noopener noreferrer" className={`${base} border-line hover:border-indigo`}>{card}</a>
                ) : (
                  <div key={r.key} className={`${base} border-dashed border-line`}>{card}</div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </AgentShell>
  );
}
