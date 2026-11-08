import QRCode from "qrcode";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { SharePanel } from "@/components/listings/share-panel";

/**
 * My Growth — the agent's side of the referral loop.
 *
 * The loop only turns if an agent can see three things at a glance: their
 * link, what they have earned, and what the next rung costs. A page that shows
 * only a total earns nothing, because nobody knows they are two referrals away
 * from something.
 *
 * Everything here is earned capability, never money. The numbers come from
 * `my_growth_summary()`, which counts only grants sourced from referrals and
 * campaigns — the plan allowance is deliberately excluded, because "you earned
 * +35 slots" must not quietly include the 300 that came with the plan.
 */

export const dynamic = "force-dynamic";

type Summary = {
  code: string | null;
  activated: number;
  pending: number;
  network_listings: number;
  bonus_listing_slots: number;
  boost_credits: number;
  featured_vouchers: number;
  points: number;
};

type NextReward = { threshold: number; remaining: number; label: string };

export default async function GrowthPage() {
  await requireUser();
  const t = await getTranslations("growth");
  const supabase = await createClient();

  // Issue the code on first visit. Idempotent, and only ever for the caller.
  await supabase.rpc("ensure_referral_code");

  const [{ data: summaryRows }, { data: nextRows }, { data: rewardRows }] = await Promise.all([
    supabase.rpc("my_growth_summary"),
    supabase.rpc("my_next_reward"),
    supabase
      .from("referral_rewards")
      .select("id, status, entitlement_key, int_value, recognition, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const s = ((summaryRows ?? []) as Summary[])[0];
  const next = ((nextRows ?? []) as NextReward[])[0] ?? null;
  const rewards = rewardRows ?? [];

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://hub.propertiguru.id";
  const link = s?.code ? `${base}/join?ref=${s.code}` : null;

  // Generated server-side; a referral link is handed over in person as often
  // as it is pasted into a chat.
  const qr = link
    ? await QRCode.toDataURL(link, { width: 320, margin: 1, color: { dark: "#14181f", light: "#ffffff" } })
        .catch(() => null)
    : null;

  const stat = (value: number, label: string, accent = false) => (
    <div className="rounded-xl border border-line p-4">
      <p className={`text-2xl font-extrabold leading-none ${accent ? "text-crimson" : ""}`}>
        {value}
      </p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
    </div>
  );

  return (
    <AgentShell wide>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {/* What they have earned ------------------------------------------- */}
      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stat(s?.activated ?? 0, t("activeReferrals"), true)}
        {stat(s?.pending ?? 0, t("pendingReferrals"))}
        {stat(s?.bonus_listing_slots ?? 0, t("bonusSlots"))}
        {stat(s?.boost_credits ?? 0, t("boostCredits"))}
        {stat(s?.featured_vouchers ?? 0, t("featuredVouchers"))}
        {stat(s?.network_listings ?? 0, t("networkListings"))}
      </section>

      {/* The next rung ---------------------------------------------------- */}
      {next && (
        <section className="mb-8 rounded-xl border border-crimson/30 bg-crimson-soft/40 p-5">
          <p className="text-sm font-semibold">
            {t("nextReward", { count: next.remaining, label: next.label })}
          </p>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface"
            role="progressbar"
            aria-valuenow={s?.activated ?? 0}
            aria-valuemin={0}
            aria-valuemax={next.threshold}
          >
            <div
              className="h-full rounded-full bg-crimson transition-all"
              style={{
                width: `${Math.min(100, Math.round(((s?.activated ?? 0) / next.threshold) * 100))}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {s?.activated ?? 0} / {next.threshold}
          </p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* How it works + history ---------------------------------------- */}
        <div>
          <section className="rounded-xl border border-line p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {t("howTitle")}
            </h2>
            {/* Stated plainly, because the strictness is the point: an invite
                that never activates is worth nothing, and an agent should know
                that before they spam a group chat. */}
            <ol className="mt-3 space-y-2 text-sm">
              {["howStep1", "howStep2", "howStep3"].map((k, i) => (
                <li key={k} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface text-xs font-bold">
                    {i + 1}
                  </span>
                  <span>{t(k as never)}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              {t("historyTitle")}
            </h2>
            {rewards.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
                {t("historyEmpty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {rewards.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{r.reason}</p>
                      <p className="text-xs text-muted">
                        {r.entitlement_key
                          // Entitlement keys carry dots (`listing.active_limit`), which
                          // next-intl reads as nesting; the message keys use underscores.
                          ? `+${r.int_value} ${t(`entitlement.${r.entitlement_key.replace(/\./g, "_")}` as never)}`
                          : t(`recognition.${r.recognition}` as never)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        r.status === "GRANTED"
                          ? "bg-success/10 text-success"
                          : r.status === "REVERSED"
                            ? "bg-danger/10 text-danger"
                            : "bg-surface text-muted"
                      }`}
                    >
                      {t(`status.${r.status}` as never)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* The link ------------------------------------------------------- */}
        <aside>
          <div className="rounded-xl border border-line p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {t("linkTitle")}
            </h2>
            {link ? (
              <>
                <p className="mt-2 break-all rounded-lg bg-surface px-3 py-2 font-mono text-xs">
                  {link}
                </p>
                <div className="mt-4">
                  <SharePanel
                    url={link}
                    caption={t("shareCaption", { link })}
                    labels={{
                      share: t("shareTitle"),
                      whatsapp: t("shareWhatsapp"),
                      telegram: t("shareTelegram"),
                      facebook: t("shareFacebook"),
                      copy: t("copyLink"),
                      copied: t("copied"),
                      caption: t("shareCaptionLabel"),
                    }}
                  />
                </div>
                {qr && (
                  <div className="mt-5 flex flex-col items-center border-t border-line pt-5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt="" aria-hidden width={128} height={128}
                         className="h-32 w-32 rounded-lg bg-white p-1" />
                    <p className="mt-2 text-xs text-muted">{t("scanToJoin")}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">{t("noCode")}</p>
            )}
          </div>
        </aside>
      </div>
    </AgentShell>
  );
}
