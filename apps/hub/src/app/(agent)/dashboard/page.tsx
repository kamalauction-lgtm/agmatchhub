import Link from "next/link";
import { isPartnerIdentityPublic } from "@/lib/platform-identity";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { getDashboard } from "@/lib/dashboard/brief";
import { planFor } from "@/config/plans";

/**
 * The agent OS home (§20). MatchHub and Co-Marketing are module cards among
 * peers here — the platform is the operating system, not a co-broke tool with
 * extras (Kamal, 4 Aug 2026).
 *
 * Structure synthesised from the benchmark
 * (docs/benchmark-agent-dashboards.md): an identity + plan block and a listing
 * pipeline in the shape Rumah123 uses, a flat module grid as PropertyGuru's
 * rail does, PropMall's prominent upgrade path, and the Brief Harian from
 * docs/module-ai-agent-dashboard.md §3 — rules-only, which needs no model and
 * is the part that actually changes what the agent does next.
 */

const STATUS_KEYS = [
  "draft", "email_verification_pending", "mobile_verification_pending",
  "documents_pending", "under_review", "additional_information_required",
  "verified", "rejected", "suspended", "temporarily_restricted", "banned",
  "expired_licence", "archived",
] as const;

export default async function DashboardPage() {
  const partnerIdentityPublic = await isPartnerIdentityPublic();
  const marketplaceUrl =
    process.env.NEXT_PUBLIC_MARKETPLACE_URL ?? "https://www.propertiguru.id";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: isAdmin }, { data: agentProfile }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url, agent_status, public_slug").eq("id", user.id).single(),
    supabase.rpc("is_platform_admin"),
    supabase.from("agent_profiles").select("agency_name, city").eq("user_id", user.id).maybeSingle(),
  ]);

  const t = await getTranslations("dashboard");
  const tp = await getTranslations("plans");

  const status = (STATUS_KEYS as readonly string[]).includes(profile?.agent_status ?? "")
    ? (profile!.agent_status as (typeof STATUS_KEYS)[number])
    : "draft";
  const isVerified = status === "verified";
  const plan = planFor(profile?.agent_status);

  // Unverified agents have no inventory and no leads; skip twelve queries.
  const data = isVerified ? await getDashboard() : null;
  const counts = data?.counts;
  const brief = data?.brief;

  const quotaPct = counts
    ? Math.min(100, Math.round((counts.listingsActive / plan.maxListings) * 100))
    : 0;

  return (
    <AgentShell wide>
      {/* Identity + plan ------------------------------------------------ */}
      <section className="mb-6 grid gap-4 sm:grid-cols-[1fr_20rem]">
        <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-5">
          {profile?.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt=""
              width={56}
              height={56}
              unoptimized
              className="h-14 w-14 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-crimson text-xl font-bold text-white"
            >
              {(profile?.display_name ?? "?").charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">
              {profile?.display_name ?? user.email}
            </h1>
            <p className="truncate text-sm text-muted">
              {agentProfile?.agency_name ?? t("independentAgent")}
              {agentProfile?.city ? ` · ${agentProfile.city}` : ""}
            </p>
            <span
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                isVerified ? "bg-success/10 text-success" : "bg-crimson-soft text-crimson"
              }`}
            >
              {t(`status.${status}`)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("planLabel")}
          </p>
          <p className="mt-1 text-lg font-bold">{tp(plan.nameKey as never)}</p>
          {plan.key === "iqi_premium" && (
            <p className="text-xs text-success">{tp(partnerIdentityPublic ? "complimentary" : "complimentaryNeutral")}</p>
          )}

          {isVerified && counts && (
            <>
              <div className="mt-3 flex items-center justify-between text-xs text-muted">
                <span>{t("quotaLabel")}</span>
                <span className="font-semibold text-foreground">
                  {counts.listingsActive}/{plan.maxListings}
                </span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-valuenow={counts.listingsActive}
                aria-valuemin={0}
                aria-valuemax={plan.maxListings}
                aria-label={t("quotaLabel")}
              >
                <div
                  className={`h-full rounded-full ${quotaPct >= 90 ? "bg-danger" : "bg-crimson"}`}
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
            </>
          )}

          {plan.canUpgrade && (
            <Link
              href="/verification"
              className="mt-4 block rounded-lg bg-success px-4 py-2.5 text-center text-sm font-semibold text-white hover:opacity-90"
            >
              {tp("upgradeCta")}
            </Link>
          )}
        </div>
      </section>

      {/* Verification gate ---------------------------------------------- */}
      {!isVerified && (
        <section className="mb-8 rounded-xl border border-crimson/30 bg-crimson-soft p-6">
          <h2 className="font-semibold">{t("statusLabel")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{t("statusNote")}</p>
          <Link
            href="/verification"
            className="mt-4 inline-block rounded-lg bg-crimson px-5 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
          >
            {t("startVerification")}
          </Link>
        </section>
      )}

      {isVerified && counts && brief && (
        <>
          {/* Brief harian ------------------------------------------------ */}
          <section className="mb-8 rounded-xl border border-line p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {t("brief.title")}
            </h2>
            <p className="mt-2 text-lg font-semibold">
              {t(`brief.greeting.${brief.greetingKey}`, {
                name: (profile?.display_name ?? "").split(" ")[0],
              })}
            </p>

            {brief.allClear ? (
              <p className="mt-2 text-sm text-success">{t("brief.allClear")}</p>
            ) : (
              <ol className="mt-4 space-y-2">
                {brief.actions.map((a, i) => (
                  <li key={a.key}>
                    <Link
                      href={a.href}
                      className={`flex items-center gap-3 rounded-lg border p-3 transition hover:border-crimson ${
                        a.tone === "danger"
                          ? "border-danger/40 bg-danger/5"
                          : a.tone === "warning"
                            ? "border-warning/40 bg-warning/5"
                            : "border-line"
                      }`}
                    >
                      <span
                        aria-hidden
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface text-xs font-bold"
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium">
                        {t(`brief.actions.${a.key}`, { count: a.count })}
                      </span>
                      <span aria-hidden className="ml-auto text-muted">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Listing pipeline (Rumah123's shape) ------------------------- */}
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            {t("pipeline.label")}
          </h2>
          <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["draft", counts.listingsDraft],
              ["inReview", counts.listingsInReview],
              ["live", counts.listingsPublished],
              ["expiring", counts.listingsExpiring],
              ["closed", counts.listingsClosed],
            ].map(([key, value]) => (
              <Link
                key={key as string}
                href="/listings"
                className="rounded-xl border border-line p-4 transition hover:border-crimson"
              >
                <p className="text-2xl font-bold">{value as number}</p>
                <p className="mt-1 text-xs font-medium text-muted">
                  {t(`pipeline.${key as string}`)}
                </p>
              </Link>
            ))}
          </section>

          {/* Modules ----------------------------------------------------- */}
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            {t("modules.label")}
          </h2>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ModuleCard
              href="/leads"
              icon="📥"
              title={t("modules.leads")}
              desc={t("modules.leadsDesc")}
              badge={counts.leadsUnanswered || undefined}
            />
            <ModuleCard
              href="/listings"
              icon="🏠"
              title={t("modules.listings")}
              desc={t("modules.listingsDesc", { inReview: counts.listingsInReview })}
              meta={`${counts.listingsActive}/${plan.maxListings}`}
            />
            <ModuleCard
              href="/requests"
              icon="🤝"
              title={t("modules.matchhub")}
              desc={t("modules.matchhubDesc")}
              meta={t("modules.matchhubCounts", {
                requests: counts.mhRequests,
                submissions: counts.mhSubmissions,
              })}
            />
            <ModuleCard
              href="/profile"
              icon="👤"
              title={t("modules.profile")}
              desc={t("modules.profileDesc")}
            />
            <ModuleCard
              href="/collab/pool"
              icon="🔁"
              title={t("modules.coMarketing")}
              desc={t("modules.coMarketingDesc")}
            />
            {/* Opens the agent's public page on the marketplace — a different
                origin, so a plain anchor rather than <Link>. */}
            {profile?.public_slug ? (
              <a
                href={`${marketplaceUrl}/agent/${profile.public_slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-line p-5 transition hover:border-crimson"
              >
                <span aria-hidden className="text-2xl">🌐</span>
                <h3 className="mt-3 font-semibold">{t("modules.landingPage")}</h3>
                <p className="mt-1 text-sm text-muted">{t("modules.landingPageDesc")}</p>
                <p className="mt-2 truncate text-xs text-crimson">
                  /agent/{profile.public_slug}
                </p>
              </a>
            ) : (
              <SoonCard icon="🌐" title={t("modules.landingPage")} desc={t("modules.landingPageDesc")} />
            )}
            <SoonCard icon="💳" title={t("modules.digitalCard")} desc={t("modules.digitalCardDesc")} />
            <SoonCard icon="✨" title={t("modules.contentStudio")} desc={t("modules.contentStudioDesc")} />
            <SoonCard icon="🎓" title={t("modules.training")} desc={t("modules.trainingDesc")} />
          </section>
        </>
      )}

      {isAdmin && (
        <Link
          href="/admin"
          className="mt-8 inline-block rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:border-crimson hover:text-crimson"
        >
          {t("adminConsole")}
        </Link>
      )}
    </AgentShell>
  );
}

function ModuleCard({
  href,
  icon,
  title,
  desc,
  badge,
  meta,
}: {
  href: string;
  icon: string;
  title: string;
  desc: string;
  badge?: number;
  meta?: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-line p-5 transition hover:border-crimson"
    >
      <div className="flex items-start justify-between gap-2">
        <span aria-hidden className="text-2xl">
          {icon}
        </span>
        {badge ? (
          <span className="rounded-full bg-crimson px-2 py-0.5 text-xs font-bold text-white">
            {badge}
          </span>
        ) : meta ? (
          <span className="text-xs font-medium text-muted">{meta}</span>
        ) : null}
      </div>
      <h3 className="mt-3 font-semibold group-hover:text-crimson">{title}</h3>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </Link>
  );
}

/** Announced but unbuilt — agents should see where the platform is going. */
function SoonCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-5 opacity-70">
      <span aria-hidden className="text-2xl">
        {icon}
      </span>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </div>
  );
}
