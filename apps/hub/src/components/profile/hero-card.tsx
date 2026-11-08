import { getTranslations, getFormatter } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { heroConfigured } from "@/lib/hero/client";
import { linkHero, unlinkHero } from "@/app/(agent)/profile/hero-actions";

/**
 * "My AG Hero account" on the profile page: link status, what the link gives
 * you, and the deep links into Hero's own modules once linked.
 */
export async function HeroCard({ userId, notice }: { userId: string; notice?: string }) {
  const t = await getTranslations("hero");
  const format = await getFormatter();
  const supabase = await createClient();

  const [{ data: link }, { data: grants }, { data: benefits }] = await Promise.all([
    supabase.from("hero_links").select("status, method, linked_at, last_checked_at, last_result, hero_country, hero_membership_status").eq("user_id", userId).maybeSingle(),
    supabase
      .from("entitlement_grants")
      .select("entitlement_key, int_value, bool_value, tier_value, effective_until")
      .eq("user_id", userId)
      .eq("source", "hero_benefit")
      .is("revoked_at", null)
      .gt("effective_until", new Date().toISOString()),
    supabase.from("hero_benefits").select("enabled, expires_at").limit(1).maybeSingle(),
  ]);

  const linked = link?.status === "linked";
  const configured = heroConfigured();
  const btn = "rounded-lg px-4 py-2.5 text-sm font-semibold";

  const value = (g: { int_value: number | null; bool_value: boolean | null; tier_value: string | null }) =>
    g.int_value != null ? `+${g.int_value}` : g.bool_value != null ? (g.bool_value ? "✓" : "—") : (g.tier_value ?? "");

  return (
    <section id="hero" className="rounded-xl border border-line p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("title")}</h2>
          <p className="mt-1 max-w-xl text-xs text-muted">{t("intro")}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${linked ? "bg-success/10 text-success" : link?.status === "stale" ? "bg-warning/10 text-warning" : "bg-surface text-muted"}`}>
          {t(`status.${link?.status ?? "none"}` as never)}
        </span>
      </div>

      {notice && (
        <p className={`mt-4 rounded-lg px-4 py-3 text-sm font-medium ${notice === "linked" || notice === "unlinked" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {t(`notice.${notice}` as never)}
        </p>
      )}

      {link && (
        <p className="mt-3 text-xs text-muted">
          {t("checked", { when: format.relativeTime(new Date(link.last_checked_at)) })}
          {linked && link.linked_at ? ` · ${t("linkedSince", { date: format.dateTime(new Date(link.linked_at), { day: "numeric", month: "short", year: "numeric" }) })}` : ""}
          {link.hero_country ? ` · ${link.hero_country}` : ""}
        </p>
      )}

      {linked && grants && grants.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("benefitsTitle")}</p>
          <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
            {grants.map((g) => (
              <li key={g.entitlement_key} className="flex justify-between gap-3 rounded-lg bg-surface px-3 py-2">
                <span>{t(`benefit.${g.entitlement_key.replace(/\./g, "_")}` as never)}</span>
                <span className="font-semibold tabular-nums">{value(g)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            {t("until", { date: format.dateTime(new Date(grants[0].effective_until), { day: "numeric", month: "long", year: "numeric" }) })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              ["coach", "https://hero.iqiaggroup.com/coach-ai"],
              ["lab", "https://hero.iqiaggroup.com/lab"],
              ["hub", "https://hero.iqiaggroup.com/hub"],
            ].map(([k, href]) => (
              <a key={k} href={href} target="_blank" rel="noopener noreferrer" className={`${btn} border border-line hover:border-indigo hover:text-indigo`}>
                {t(`open.${k}` as never)} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!configured ? (
          <p className="text-sm text-muted">{t("notConfigured")}</p>
        ) : (
          <>
            <form action={linkHero}>
              <button type="submit" className={`${btn} bg-crimson text-white hover:bg-crimson-strong`}>
                {linked ? t("recheck") : t("link")}
              </button>
            </form>
            {link && link.status !== "unlinked" && (
              <form action={unlinkHero}>
                <button type="submit" className={`${btn} border border-line text-muted hover:border-danger hover:text-danger`}>{t("unlink")}</button>
              </form>
            )}
          </>
        )}
        {benefits && !benefits.enabled && <span className="text-xs text-muted">{t("promoOff")}</span>}
      </div>
      <p className="mt-3 text-xs text-muted">{t("howItWorks")}</p>
    </section>
  );
}
