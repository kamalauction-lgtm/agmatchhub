import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { planFor } from "@/config/plans";
import {
  ENTITLEMENT, entitlementInt, entitlementLines, priceCurrencyFor, planCatalogue, creditBalance, formatMoney,
} from "@/lib/entitlements";
import { startSubscriptionCheckout, startTopupCheckout } from "./actions";

/**
 * "My plan & credits" — what the agent holds, why, what the other plans cost
 * in THEIR currency, and their two credit balances.
 *
 * Checkout (E11) appears only when BOTH are true for this person: the
 * `payments` flag is on for them, and a gateway is switched on for their
 * currency (`payment_provider_for`). During FREE_LAUNCH neither is, so the
 * page is exactly what it was. The amount is never on the form — the
 * database prices the intent from the lists.
 */
export const dynamic = "force-dynamic";

const SHOW = [
  "listing.active_limit", "ai.monthly_usage", "ai.poster_exports_monthly", "boost.monthly_credits",
  "matchhub.enabled", "comarketing.enabled", "content_studio.level", "ai.roles", "support.level",
] as const;

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ pay?: string }> }) {
  const user = await requireUser();
  const { pay } = await searchParams;
  const t = await getTranslations("plan");
  const locale = await getLocale();
  const supabase = await createClient();

  const currency = await priceCurrencyFor(user.id);
  const [plan, catalogue, aiCredits, boostCredits, aiUsage, aiLines, { data: hero }, { data: defs }, { data: flagOn }, { data: providerRows }] = await Promise.all([
    planFor(user.id),
    planCatalogue(currency),
    creditBalance(user.id, "ai"),
    creditBalance(user.id, "boost"),
    entitlementInt(user.id, ENTITLEMENT.aiMonthlyUsage),
    entitlementLines(user.id, ENTITLEMENT.aiMonthlyUsage),
    supabase.from("hero_links").select("status").eq("user_id", user.id).maybeSingle(),
    supabase.from("entitlement_definitions").select("key, name, unit").in("key", [...SHOW]),
    supabase.rpc("is_feature_enabled", { p_key: "payments", p_user: user.id }),
    supabase.rpc("payment_provider_for", { p_user: user.id }),
  ]);
  const provider = ((providerRows ?? []) as { key: string; name: string; mode: string; methods: string[] }[])[0] ?? null;
  const canPay = flagOn === true && !!provider;

  const [{ data: packs }, { data: payments }, { data: currentSub }] = canPay
    ? await Promise.all([
        supabase.from("credit_packs").select("key, kind, credits, name, rank, credit_pack_prices(currency, price)").eq("is_active", true).order("rank"),
        supabase.from("payment_intents").select("id, human_readable_id, kind, status, amount, currency, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("subscriptions").select("plan_version_id, cadence, renews_at").eq("user_id", user.id).eq("family", "agent").in("status", ["trial", "active", "complimentary", "grace"]).maybeSingle(),
      ])
    : [{ data: null }, { data: null }, { data: null }];
  const pricedPacks = ((packs ?? []) as { key: string; kind: string; credits: number; name: string; credit_pack_prices: { currency: string; price: string }[] }[])
    .map((p) => ({ ...p, price: p.credit_pack_prices.find((x) => x.currency === currency)?.price ?? null }))
    .filter((p) => p.price !== null && Number(p.price) > 0);

  const defName = new Map((defs ?? []).map((d) => [d.key, d]));
  const free = plan.effectivePrice === 0;
  const value = (v: number | boolean | string | null | undefined) =>
    v === true ? "✓" : v === false || v == null ? "—" : String(v);
  const payBtn = "min-h-9 w-full cursor-pointer rounded-lg px-3 text-xs font-semibold transition-colors duration-200";

  return (
    <AgentShell wide>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {pay && (
        <p className="mb-6 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">{t(`pay.${pay}` as never)}</p>
      )}

      {/* Current plan ------------------------------------------------------ */}
      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-line bg-card p-6 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("current")}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <h2 className="text-2xl font-bold">{plan.productName ?? plan.name}</h2>
            <span className="text-sm text-muted">{plan.name}</span>
            {free && <span className="rounded-full bg-success/10 px-3 py-0.5 text-xs font-semibold text-success">{t("complimentary")}</span>}
          </div>
          <p className="mt-2 text-sm">
            {free
              ? t("youPay", { price: formatMoney(0, plan.currency, locale) })
              : t("youPay", { price: formatMoney(plan.effectivePrice, plan.currency, locale) })}
            {plan.sourceLabel ? <span className="text-muted"> · {t("because", { policy: plan.sourceLabel })}</span> : null}
          </p>
          {currentSub?.renews_at && (
            <p className="mt-1 text-xs text-muted">{t("renews", { date: new Date(currentSub.renews_at).toLocaleDateString(locale) })}</p>
          )}
          <dl className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-surface px-3 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t("listings")}</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums">{plan.maxListings}</dd>
            </div>
            <div className="rounded-lg bg-surface px-3 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t("aiTasks")}</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums">{aiUsage}</dd>
            </div>
            <div className="rounded-lg bg-surface px-3 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t("heroLink")}</dt>
              <dd className="mt-0.5 text-sm font-semibold">
                {hero?.status === "linked" ? t("heroLinked") : <Link href="/profile#hero" className="text-indigo hover:underline">{t("heroNotLinked")}</Link>}
              </dd>
            </div>
          </dl>
          {aiLines.length > 1 && (
            <details className="mt-3 text-xs text-muted">
              <summary className="cursor-pointer font-semibold">{t("whyAi")}</summary>
              <ul className="mt-1 space-y-0.5">
                {aiLines.map((l, i) => (
                  <li key={i}>{l.label ?? l.source}: <span className="font-mono">+{l.int_value ?? 0}</span>{l.expires_at ? ` · ${t("until", { date: new Date(l.expires_at).toLocaleDateString(locale) })}` : ""}</li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* Credits ---------------------------------------------------------- */}
        <div className="rounded-xl border border-line bg-card p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("creditsTitle")}</p>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
              <div>
                <p className="text-sm font-semibold">{t("aiCredits")}</p>
                <p className="text-xs text-muted">{t("aiCreditsHint")}</p>
              </div>
              <p className="text-2xl font-bold tabular-nums">{aiCredits}</p>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
              <div>
                <p className="text-sm font-semibold">{t("boostCredits")}</p>
                <p className="text-xs text-muted">{t("boostCreditsHint")}</p>
              </div>
              <p className="text-2xl font-bold tabular-nums">{boostCredits}</p>
            </div>
          </div>
          {canPay && pricedPacks.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("topUpTitle")}</p>
              <ul className="mt-2 space-y-2">
                {pricedPacks.map((p) => (
                  <li key={p.key}>
                    <form action={startTopupCheckout} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                      <input type="hidden" name="packKey" value={p.key} />
                      <input type="hidden" name="label" value={p.name} />
                      <span className="text-sm">{p.name}</span>
                      <button type="submit" className="min-h-8 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold tabular-nums hover:border-crimson hover:text-crimson">
                        {formatMoney(p.price, currency, locale)}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">{t("payVia", { provider: provider!.name })}{provider!.mode === "sandbox" ? ` · ${t("sandboxNote")}` : ""}</p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted">{t("topUpSoon")}</p>
          )}
        </div>
      </section>

      {/* Catalogue --------------------------------------------------------- */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("catalogueTitle")}</h2>
          <span className="text-xs text-muted">{t("pricesIn", { currency })}</span>
        </div>
        {free && <p className="mb-4 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">{t("launchNote")}</p>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {catalogue.map((p) => {
            const mine = p.plan_key === plan.key;
            // Not for the plan they already hold — complimentary or paid. A
            // renewal of a paid plan is a later feature, not a button here.
            const buyable = canPay && !mine && Number(p.monthly_price ?? 0) > 0;
            return (
              <article key={p.plan_key} className={`rounded-xl border p-5 ${mine ? "border-crimson bg-crimson-soft/20" : "border-line bg-card"}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{p.name}</p>
                <h3 className="text-xl font-bold">{p.product_name ?? p.name}</h3>
                <p className="mt-2 text-2xl font-bold tabular-nums">
                  {formatMoney(p.monthly_price ?? 0, p.currency, locale)}
                  <span className="ml-1 text-xs font-normal text-muted">{t("perMonth")}</span>
                </p>
                {p.annual_price && Number(p.annual_price) > 0 && (
                  <p className="text-xs text-muted">{t("perYear", { price: formatMoney(p.annual_price, p.currency, locale) })}</p>
                )}
                <ul className="mt-4 space-y-1 text-sm">
                  {SHOW.map((k) => (
                    <li key={k} className="flex justify-between gap-2">
                      <span className="text-muted">{defName.get(k)?.name ?? k}</span>
                      <span className="font-semibold tabular-nums">{value(p.entitlements[k])}</span>
                    </li>
                  ))}
                </ul>
                {mine && <p className="mt-4 text-xs font-semibold text-crimson">{t("yourPlan")}</p>}
                {buyable && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {(["monthly", "annual"] as const).map((cadence) => (
                      <form key={cadence} action={startSubscriptionCheckout}>
                        <input type="hidden" name="planVersionId" value={p.plan_version_id} />
                        <input type="hidden" name="cadence" value={cadence} />
                        <input type="hidden" name="label" value={p.product_name ?? p.name} />
                        <button type="submit" className={`${payBtn} ${cadence === "monthly" ? "bg-crimson text-white hover:bg-crimson/90" : "border border-line hover:border-crimson hover:text-crimson"}`}>
                          {t(`choose.${cadence}`)}
                        </button>
                      </form>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-muted">{t("footnote")}</p>
      </section>

      {/* Payment history ---------------------------------------------------- */}
      {canPay && (payments ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("historyTitle")}</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {(payments ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <Link href={`/plan/payment/${p.id}`} className="font-mono text-xs text-indigo hover:underline">{p.human_readable_id}</Link>
                <span className="text-muted">{t(`kind.${p.kind}` as never)}</span>
                <span className="tabular-nums">{formatMoney(p.amount, p.currency, locale)}</span>
                <span className="text-xs font-semibold">{t(`payment.status.${p.status}` as never)}</span>
                <span className="text-xs text-muted">{new Date(p.created_at).toLocaleDateString(locale)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AgentShell>
  );
}
