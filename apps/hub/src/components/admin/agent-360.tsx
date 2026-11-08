import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

/**
 * The commercial, entitlement and referral picture for one agent.
 *
 * Bolted onto the existing verification screen rather than made a new page:
 * an admin looking at an agent is already here, and a second "agent detail"
 * route would split the answer to one question across two URLs.
 *
 * The entitlement block is the point of the whole thing. When an agent asks
 * "why can I only publish 300?" or an admin asks "why is this account free?",
 * the answer is generated from the same resolver the platform enforces with —
 * `entitlement_lines()` and `resolve_price()` — never composed by hand here.
 * A hand-written explanation drifts from the enforcement and becomes a lie
 * nobody notices.
 */

type Line = {
  source: string;
  label: string | null;
  int_value: number | null;
  bool_value: boolean | null;
  tier_value: string | null;
  expires_at: string | null;
};

type Price = {
  plan_key: string;
  plan_name: string;
  currency: string;
  base_price: string;
  policy_name: string | null;
  treatment: string | null;
  effective_price: string;
  billing_mode: string;
};

const money = (amount: string | number, currency: string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 })
    .format(Number(amount));

export async function Agent360({ userId }: { userId: string }) {
  const t = await getTranslations("agent360");
  const supabase = await createClient();

  const [
    { data: priceRows },
    { data: slotLines },
    { data: subscription },
    { data: referredBy },
    { data: referrals },
    { data: rewards },
    { data: listingCounts },
  ] = await Promise.all([
    supabase.rpc("resolve_price", { p_user: userId }),
    supabase.rpc("entitlement_lines", { p_user: userId, p_key: "listing.active_limit" }),
    supabase
      .from("subscriptions")
      .select("status, cadence, started_at, source_label, plan_versions(plans(name))")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("referrals")
      .select("stage, created_at, referrer:referrer_id(id, display_name)")
      .eq("referred_id", userId)
      .maybeSingle(),
    supabase
      .from("referrals")
      .select("id, stage, invalidated_at, referred:referred_id(display_name)")
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("referral_rewards")
      .select("id, status, entitlement_key, int_value, recognition, reason")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("listings")
      .select("status")
      .eq("agent_id", userId),
  ]);

  const price = ((priceRows ?? []) as Price[])[0];
  const lines = (slotLines ?? []) as Line[];
  const totalSlots = lines.reduce((n, l) => n + (l.int_value ?? 0), 0);

  const listings = listingCounts ?? [];
  const published = listings.filter((l) => l.status === "published").length;
  const drafts = listings.filter((l) => l.status === "draft").length;
  const inReview = listings.filter((l) => l.status === "pending_review").length;

  const activeReferrals = (referrals ?? []).filter(
    (r) => !r.invalidated_at && r.stage === "ACTIVATED",
  ).length;

  const nameOf = (v: unknown) => (v as { display_name?: string } | null)?.display_name ?? "—";

  return (
    <>
      {/* Commercial ------------------------------------------------------- */}
      <section className="rounded-xl border border-line p-6">
        <h2 className="mb-4 font-semibold">{t("commercialTitle")}</h2>
        {price ? (
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">{t("plan")}</dt>
              <dd className="mt-0.5 font-semibold">{price.plan_name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">{t("status")}</dt>
              <dd className="mt-0.5">
                {subscription?.status
                  ? t(`subStatus.${subscription.status}` as never)
                  : t("noSubscription")}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">{t("basePrice")}</dt>
              <dd className="mt-0.5 font-mono tabular-nums">
                {money(price.base_price, price.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">{t("effectivePrice")}</dt>
              <dd className="mt-0.5 font-mono text-lg font-bold tabular-nums text-crimson">
                {money(price.effective_price, price.currency)}
              </dd>
            </div>
            {/* The sentence that answers "why is this account free?" */}
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted">{t("whyThisPrice")}</dt>
              <dd className="mt-0.5 text-sm">
                {price.policy_name
                  ? t("priceBecause", {
                      policy: price.policy_name,
                      treatment: t(`treatment.${price.treatment}` as never),
                    })
                  : t("priceIsBase")}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted">{t("noCommercial")}</p>
        )}
      </section>

      {/* Entitlements — the itemised answer -------------------------------- */}
      <section className="mt-6 rounded-xl border border-line p-6">
        <h2 className="font-semibold">{t("entitlementTitle")}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">{t("entitlementHint")}</p>

        <table className="w-full text-left text-sm">
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-2">
                  <span className="font-medium">{l.label ?? l.source}</span>
                  <span className="ml-2 rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-muted">
                    {t(`source.${l.source}` as never)}
                  </span>
                  {l.expires_at && (
                    <span className="ml-2 text-xs text-warning">
                      {t("expires", { date: new Date(l.expires_at).toLocaleDateString("en-GB") })}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right font-mono tabular-nums">
                  {l.int_value !== null ? `+${l.int_value}` : "—"}
                </td>
              </tr>
            ))}
            <tr>
              <td className="pt-3 font-semibold">{t("effectiveCapacity")}</td>
              <td className="pt-3 text-right font-mono text-lg font-bold tabular-nums">
                {totalSlots}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Marketplace activity --------------------------------------------- */}
      <section className="mt-6 rounded-xl border border-line p-6">
        <h2 className="mb-4 font-semibold">{t("activityTitle")}</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            [published, t("published")],
            [inReview, t("inReview")],
            [drafts, t("drafts")],
          ].map(([n, label]) => (
            <div key={String(label)} className="rounded-lg border border-line p-3">
              <p className="text-xl font-bold">{n as number}</p>
              <p className="mt-0.5 text-xs text-muted">{label as string}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm">
          {t("capacityUsed", { used: published + inReview + drafts, total: totalSlots })}
        </p>
      </section>

      {/* Referral --------------------------------------------------------- */}
      <section className="mt-6 rounded-xl border border-line p-6">
        <h2 className="mb-4 font-semibold">{t("referralTitle")}</h2>

        <dl className="mb-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">{t("referredBy")}</dt>
            <dd className="mt-0.5">
              {referredBy?.referrer ? (
                <Link
                  href={`/admin/agents/${(referredBy.referrer as unknown as { id: string }).id}`}
                  className="font-medium text-crimson hover:underline"
                >
                  {nameOf(referredBy.referrer)}
                </Link>
              ) : (
                <span className="text-muted">{t("notReferred")}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">{t("activatedReferrals")}</dt>
            <dd className="mt-0.5 font-mono text-lg font-bold tabular-nums">{activeReferrals}</dd>
          </div>
        </dl>

        {(referrals ?? []).length > 0 && (
          <ul className="mb-4 divide-y divide-line rounded-lg border border-line">
            {(referrals ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>{nameOf(r.referred)}</span>
                <span className={r.invalidated_at ? "text-xs text-danger" : "text-xs text-muted"}>
                  {r.invalidated_at ? t("invalidated") : t(`stage.${r.stage}` as never)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {(rewards ?? []).length > 0 && (
          <>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {t("rewardsEarned")}
            </h3>
            <ul className="space-y-1.5">
              {(rewards ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{r.reason}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      r.status === "GRANTED"
                        ? "bg-success/10 text-success"
                        : r.status === "REVERSED"
                          ? "bg-danger/10 text-danger"
                          : "bg-surface text-muted"
                    }`}
                  >
                    {r.entitlement_key ? `+${r.int_value}` : r.recognition} · {r.status}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
