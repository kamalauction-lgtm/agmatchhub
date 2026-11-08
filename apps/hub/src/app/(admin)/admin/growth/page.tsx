import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { reverseReward, invalidateReferral } from "./actions";
import { createCampaign, setCampaignStatus, addRewardRule, toggleRewardRule } from "./campaign-actions";

/**
 * Referral admin.
 *
 * Four questions an operator actually asks, in the order they ask them:
 * is the programme working, who is driving it, what needs a decision, and who
 * is gaming it.
 *
 * The funnel is shown as counts at each stage rather than a single conversion
 * percentage, because the useful information is WHERE people stop. A campaign
 * losing everyone between "verified" and "first listing" needs a different fix
 * from one losing them at registration, and one number cannot say which.
 */

export const dynamic = "force-dynamic";

type Signal = {
  referrer_id: string;
  display_name: string | null;
  total: number;
  activated: number;
  same_day: number;
  never_published: number;
};

type TopReferrer = {
  referrer_id: string;
  display_name: string | null;
  activated: number;
  network_listings: number;
  rewards: number;
};

const STAGES = [
  "REGISTERED", "VERIFIED", "FIRST_PUBLISHED_LISTING", "ACTIVATED",
] as const;

export default async function AdminGrowthPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireCapability("growth.manage");
  const { notice } = await searchParams;
  const t = await getTranslations("adminGrowth");
  const supabase = await createClient();

  const [{ data: campaigns }, { data: referrals }, { data: rewards }, { data: top }, { data: signals }] =
    await Promise.all([
      supabase
        .from("growth_campaigns")
        .select("id, key, name, status, starts_at, ends_at, require_verified, require_published_listing")
        .order("starts_at", { ascending: false }),
      supabase
        .from("referrals")
        .select("id, stage, invalidated_at, created_at, referrer:referrer_id(display_name), referred:referred_id(display_name)")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("referral_rewards")
        .select("id, status, entitlement_key, int_value, recognition, reason, created_at, profiles:user_id(display_name)")
        .in("status", ["QUALIFIED", "PENDING", "GRANTED"])
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.rpc("admin_top_referrers", { p_limit: 10 }),
      supabase.rpc("admin_referral_signals"),
    ]);

  const { data: rules } = await supabase
    .from("referral_reward_rules")
    .select("id, campaign_id, metric, threshold, recipient, entitlement_key, int_value, recognition, label, is_active")
    .order("metric")
    .order("threshold");

  const { data: entitlementDefs } = await supabase
    .from("entitlement_definitions").select("key, name").in("value_type", ["int", "credit"]).order("key");

  const input =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson";

  const live = (referrals ?? []).filter((r) => !r.invalidated_at);

  // Cumulative: everyone who reached ACTIVATED also passed VERIFIED, so the
  // funnel reads as a funnel rather than as disconnected buckets.
  const order = new Map(STAGES.map((s, i) => [s, i]));
  const funnel = STAGES.map((stage) => ({
    stage,
    count: live.filter((r) => (order.get(r.stage) ?? -1) >= (order.get(stage) ?? 0)).length,
  }));
  const widest = Math.max(1, funnel[0]?.count ?? 1);

  const name = (v: unknown) => (v as { display_name?: string } | null)?.display_name ?? "—";

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {notice && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t(`notice.${notice}` as never)}
        </p>
      )}

      {/* Campaigns -------------------------------------------------------- */}
      <section className="mb-9">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("campaigns")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(campaigns ?? []).map((c) => (
            <div key={c.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{c.name}</p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    c.status === "active" ? "bg-success/10 text-success" : "bg-surface text-muted"
                  }`}
                >
                  {t(`status.${c.status}` as never)}
                </span>
              </div>
              {/* The activation rule, stated — it is the single most important
                  setting in the programme and it should not be buried. */}
              <p className="mt-2 text-xs text-muted">
                {t("activationRule", {
                  verified: c.require_verified ? t("yes") : t("no"),
                  listing: c.require_published_listing ? t("yes") : t("no"),
                })}
              </p>
              <p className="mt-1 font-mono text-xs text-muted">{c.key}</p>

              {/* Pausing stops future payouts only. Rewards already granted
                  keep their capability. */}
              <div className="mt-3 flex flex-wrap gap-2">
                {(["active", "paused", "ended"] as const)
                  .filter((st) => st !== c.status)
                  .map((st) => (
                    <form key={st} action={setCampaignStatus}>
                      <input type="hidden" name="campaignId" value={c.id} />
                      <input type="hidden" name="status" value={st} />
                      <button
                        type="submit"
                        className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold transition-colors duration-200 hover:border-crimson hover:text-crimson"
                      >
                        {t(st === "active" ? "activate" : st === "paused" ? "pause" : "end")}
                      </button>
                    </form>
                  ))}
              </div>
            </div>
          ))}
          {!(campaigns ?? []).length && (
            <p className="text-sm text-muted">{t("noCampaigns")}</p>
          )}
        </div>
      </section>

      {/* New campaign ----------------------------------------------------- */}
      <section className="mb-9 rounded-xl border border-line p-6">
        <h2 className="font-semibold">{t("newCampaignTitle")}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">{t("newCampaignHint")}</p>
        <form action={createCampaign} className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-semibold">
            {t("keyLabel")}
            <input name="key" required placeholder="jakarta_growth" className={input} />
          </label>
          <label className="block text-xs font-semibold sm:col-span-2">
            {t("nameLabel")}
            <input name="name" required maxLength={120} className={input} />
          </label>
          <label className="block text-xs font-semibold sm:col-span-2">
            {t("descLabel")}
            <input name="description" maxLength={500} className={input} />
          </label>
          <label className="block text-xs font-semibold">
            {t("countryLabel")}
            <input name="countryCode" maxLength={2} placeholder="ID" className={input} />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" name="requireVerified" defaultChecked className="h-4 w-4 accent-crimson" />
            {t("requireVerified")}
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" name="requirePublished" defaultChecked className="h-4 w-4 accent-crimson" />
            {t("requirePublished")}
          </label>
          <label className="block text-xs font-semibold">
            {t("minListings")}
            <input name="minListings" type="number" min={1} max={50} defaultValue={1} className={input} />
          </label>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="min-h-11 cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-crimson-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
            >
              {t("createCampaign")}
            </button>
          </div>
        </form>
      </section>

      {/* Reward ladder ---------------------------------------------------- */}
      <section className="mb-9">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("ladderTitle")}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">{t("metricLabel")}</th>
                <th className="px-4 py-3 text-right">{t("thresholdLabel")}</th>
                <th className="px-4 py-3">{t("recipientLabel")}</th>
                <th className="px-4 py-3">{t("reward")}</th>
                <th className="px-4 py-3 text-right">{t("action")}</th>
              </tr>
            </thead>
            <tbody>
              {(rules ?? []).map((r) => (
                <tr key={r.id} className={`border-t border-line ${r.is_active ? "" : "opacity-50"}`}>
                  <td className="px-4 py-2.5">{t(`metric.${r.metric}` as never)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.threshold}</td>
                  <td className="px-4 py-2.5 text-xs">{t(`recipient.${r.recipient}` as never)}</td>
                  <td className="px-4 py-2.5">
                    <span className="block text-xs">{r.label}</span>
                    <span className="font-mono text-xs text-muted">
                      {r.entitlement_key ? `+${r.int_value} ${r.entitlement_key}` : r.recognition}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {/* Deactivated, never deleted: reward rows reference the
                        rule, and the ledger is the record of what was given. */}
                    <form action={toggleRewardRule} className="inline">
                      <input type="hidden" name="ruleId" value={r.id} />
                      <input type="hidden" name="active" value={r.is_active ? "false" : "true"} />
                      <button
                        type="submit"
                        className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold text-muted transition-colors duration-200 hover:border-crimson hover:text-crimson"
                      >
                        {r.is_active ? t("disable") : t("enable")}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {!(rules ?? []).length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">{t("noRules")}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <details className="mt-3 rounded-xl border border-line p-4">
          <summary className="cursor-pointer text-sm font-semibold">{t("addRuleTitle")}</summary>
          <form action={addRewardRule} className="mt-3 grid gap-3 sm:grid-cols-4">
            <label className="block text-xs font-semibold">
              {t("campaigns")}
              <select name="campaignId" required className={input}>
                {(campaigns ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold">
              {t("metricLabel")}
              <select name="metric" className={input}>
                <option value="activated_referrals">{t("metric.activated_referrals")}</option>
                <option value="network_published_listings">{t("metric.network_published_listings")}</option>
                <option value="first_activation">{t("metric.first_activation")}</option>
              </select>
            </label>
            <label className="block text-xs font-semibold">
              {t("thresholdLabel")}
              <input name="threshold" type="number" min={1} required defaultValue={1} className={input} />
            </label>
            <label className="block text-xs font-semibold">
              {t("recipientLabel")}
              <select name="recipient" className={input}>
                <option value="referrer">{t("recipient.referrer")}</option>
                <option value="referred">{t("recipient.referred")}</option>
              </select>
            </label>
            <label className="block text-xs font-semibold">
              {t("entitlementLabel")}
              <select name="entitlementKey" className={input}>
                <option value="">-</option>
                {(entitlementDefs ?? []).map((d) => (
                  <option key={d.key} value={d.key}>{d.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold">
              {t("valueLabel")}
              <input name="value" type="number" min={1} className={input} />
            </label>
            <label className="block text-xs font-semibold">
              {t("recognitionLabel")}
              <input name="recognition" maxLength={60} placeholder="homepage_spotlight" className={input} />
            </label>
            <label className="block text-xs font-semibold">
              {t("labelLabel")}
              <input name="label" required maxLength={160} className={input} />
            </label>
            <div className="sm:col-span-4">
              <button
                type="submit"
                className="min-h-11 cursor-pointer rounded-lg border border-line px-5 text-sm font-semibold transition-colors duration-200 hover:border-crimson hover:text-crimson"
              >
                {t("addRule")}
              </button>
            </div>
          </form>
        </details>
      </section>

      {/* Funnel ----------------------------------------------------------- */}
      <section className="mb-9">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("funnel")}
        </h2>
        <div className="space-y-2 rounded-xl border border-line p-5">
          {funnel.map((f) => (
            <div key={f.stage} className="flex items-center gap-3">
              <span className="w-56 shrink-0 text-sm">{t(`stage.${f.stage}` as never)}</span>
              <div className="h-6 flex-1 overflow-hidden rounded bg-surface">
                <div
                  className="h-full rounded bg-crimson/80"
                  style={{ width: `${Math.round((f.count / widest) * 100)}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums">
                {f.count}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Top partners ----------------------------------------------------- */}
      <section className="mb-9">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("topPartners")}
        </h2>
        <p className="mb-3 text-xs text-muted">{t("topPartnersHint")}</p>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">{t("agent")}</th>
                <th className="px-4 py-3 text-right">{t("activated")}</th>
                <th className="px-4 py-3 text-right">{t("networkListings")}</th>
                <th className="px-4 py-3 text-right">{t("rewards")}</th>
              </tr>
            </thead>
            <tbody>
              {((top ?? []) as TopReferrer[]).map((r) => (
                <tr key={r.referrer_id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/agents/${r.referrer_id}`} className="text-crimson hover:underline">
                      {r.display_name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{r.activated}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{r.network_listings}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{r.rewards}</td>
                </tr>
              ))}
              {!((top ?? []) as TopReferrer[]).length && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">{t("noReferrals")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Abuse signals ---------------------------------------------------- */}
      {((signals ?? []) as Signal[]).length > 0 && (
        <section className="mb-9">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-warning">
            {t("signals")}
          </h2>
          {/* Flagged, never auto-banned (§45): a heuristic decides who to look
              at, a person decides what to do. */}
          <p className="mb-3 text-xs text-muted">{t("signalsHint")}</p>
          <div className="overflow-x-auto rounded-xl border border-warning/40">
            <table className="w-full text-left text-sm">
              <thead className="bg-warning/5 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">{t("agent")}</th>
                  <th className="px-4 py-3 text-right">{t("total")}</th>
                  <th className="px-4 py-3 text-right">{t("activated")}</th>
                  <th className="px-4 py-3 text-right">{t("sameDay")}</th>
                  <th className="px-4 py-3 text-right">{t("neverPublished")}</th>
                </tr>
              </thead>
              <tbody>
                {((signals ?? []) as Signal[]).map((s) => (
                  <tr key={s.referrer_id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/admin/agents/${s.referrer_id}`} className="text-crimson hover:underline">
                        {s.display_name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{s.total}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{s.activated}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{s.same_day}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{s.never_published}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Reward queue ----------------------------------------------------- */}
      <section className="mb-9">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("rewardQueue")}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">{t("agent")}</th>
                <th className="px-4 py-3">{t("reward")}</th>
                <th className="px-4 py-3">{t("statusCol")}</th>
                <th className="px-4 py-3 text-right">{t("action")}</th>
              </tr>
            </thead>
            <tbody>
              {(rewards ?? []).map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{name(r.profiles)}</td>
                  <td className="px-4 py-3">
                    <span className="block">{r.reason}</span>
                    <span className="text-xs text-muted">
                      {r.entitlement_key ? `+${r.int_value} ${r.entitlement_key}` : r.recognition}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        r.status === "GRANTED" ? "bg-success/10 text-success" : "bg-surface text-muted"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === "GRANTED" && (
                      <form action={reverseReward} className="inline">
                        <input type="hidden" name="rewardId" value={r.id} />
                        <input type="hidden" name="reason" value="admin review" />
                        <button
                          type="submit"
                          className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold text-muted transition-colors duration-200 hover:border-danger hover:text-danger"
                        >
                          {t("reverse")}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {!(rewards ?? []).length && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">{t("noRewards")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent referrals ------------------------------------------------- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("recentReferrals")}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">{t("referrer")}</th>
                <th className="px-4 py-3">{t("referred")}</th>
                <th className="px-4 py-3">{t("stageCol")}</th>
                <th className="px-4 py-3 text-right">{t("action")}</th>
              </tr>
            </thead>
            <tbody>
              {(referrals ?? []).map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3">{name(r.referrer)}</td>
                  <td className="px-4 py-3">{name(r.referred)}</td>
                  <td className="px-4 py-3">
                    {r.invalidated_at ? (
                      <span className="text-xs font-semibold text-danger">{t("invalidated")}</span>
                    ) : (
                      <span className="text-xs">{t(`stage.${r.stage}` as never)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!r.invalidated_at && (
                      <form action={invalidateReferral} className="inline">
                        <input type="hidden" name="referralId" value={r.id} />
                        <input type="hidden" name="reason" value="admin review" />
                        <button
                          type="submit"
                          className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold text-muted transition-colors duration-200 hover:border-danger hover:text-danger"
                        >
                          {t("invalidate")}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {!(referrals ?? []).length && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">{t("noReferrals")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
