import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { grantEntitlement, revokeGrant, grantCredits } from "@/app/(admin)/admin/commercial/actions";

/**
 * Give an agent capacity, and take it back.
 *
 * The operation that was SQL-only: "add twenty listing slots for this person
 * because their import failed" had no form, no reason field and no audit line.
 *
 * A reason is REQUIRED rather than optional. A grant without one is
 * indistinguishable from a mistake six months later, and this table is exactly
 * where somebody will eventually go looking to explain a discrepancy.
 *
 * Only integer entitlements are offered. Booleans and tiers belong to a plan
 * or a policy — handing one out per-agent would create capability that no
 * subscription explains, which is the kind of drift the engine exists to stop.
 */

export async function GrantPanel({ userId }: { userId: string }) {
  const t = await getTranslations("grants");
  const supabase = await createClient();

  const [{ data: definitions }, { data: existing }, { data: wallets }, { data: creditTx }] = await Promise.all([
    supabase
      .from("entitlement_definitions")
      .select("key, name, unit, value_type")
      .in("value_type", ["int", "credit"])
      .order("key"),
    supabase
      .from("entitlement_grants")
      .select("id, entitlement_key, int_value, source, reason, effective_until, created_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("credit_wallets").select("kind, balance, lifetime_granted, lifetime_spent").eq("agent_id", userId),
    supabase
      .from("credit_transactions")
      .select("id, kind, delta, balance_after, reason, note, created_at")
      .eq("agent_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const balance = (kind: string) => wallets?.find((w) => w.kind === kind)?.balance ?? 0;

  const input =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson";

  return (
    <section className="mt-6 rounded-xl border border-line p-6">
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="mb-4 mt-1 text-sm text-muted">{t("hint")}</p>

      <form action={grantEntitlement} className="grid gap-3 sm:grid-cols-4">
        <input type="hidden" name="userId" value={userId} />

        <label className="block text-xs font-semibold sm:col-span-1">
          {t("entitlement")}
          <select name="entitlementKey" required className={input}>
            {(definitions ?? []).map((d) => (
              <option key={d.key} value={d.key}>{d.name}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold">
          {t("amount")}
          <input name="value" type="number" min={1} max={100000} required defaultValue={10} className={input} />
        </label>

        <label className="block text-xs font-semibold">
          {t("days")}
          <input name="days" type="number" min={1} max={3650} placeholder={t("permanent")} className={input} />
          <span className="mt-1 block text-xs font-normal text-muted">{t("daysHint")}</span>
        </label>

        <label className="block text-xs font-semibold">
          {t("reason")}
          <input name="reason" required maxLength={300} className={input} />
        </label>

        <div className="sm:col-span-4">
          <button
            type="submit"
            className="min-h-11 cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-crimson-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
          >
            {t("grant")}
          </button>
        </div>
      </form>

      {/* Credits (00090): two balances, one ledger. The RPC audits itself. */}
      <div className="mt-6 border-t border-line pt-6">
        <h3 className="font-semibold">{t("creditsTitle")}</h3>
        <p className="mb-3 mt-1 text-sm text-muted">{t("creditsHint")}</p>
        <dl className="mb-4 grid grid-cols-2 gap-3 sm:max-w-sm">
          {(["ai", "boost"] as const).map((k) => (
            <div key={k} className="rounded-lg bg-surface px-3 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t(`kind.${k}`)}</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums">{balance(k)}</dd>
            </div>
          ))}
        </dl>
        <form action={grantCredits} className="grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="userId" value={userId} />
          <label className="block text-xs font-semibold">
            {t("kindLabel")}
            <select name="kind" className={input}>
              <option value="ai">{t("kind.ai")}</option>
              <option value="boost">{t("kind.boost")}</option>
            </select>
          </label>
          <label className="block text-xs font-semibold">
            {t("amount")}
            <input name="amount" type="number" min={1} max={100000} required defaultValue={50} className={input} />
          </label>
          <label className="block text-xs font-semibold">
            {t("creditReason")}
            <select name="reason" className={input}>
              {(["grant", "promotion", "hero_welcome", "refund", "adjustment"] as const).map((r) => (
                <option key={r} value={r}>{t(`creditReasons.${r}`)}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold">
            {t("reason")}
            <input name="note" required maxLength={300} className={input} />
          </label>
          <div className="sm:col-span-4">
            <button type="submit" className="min-h-10 cursor-pointer rounded-lg border border-line px-4 text-sm font-semibold transition-colors duration-200 hover:border-crimson hover:text-crimson">
              {t("addCredits")}
            </button>
          </div>
        </form>
        {(creditTx ?? []).length > 0 && (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-xs">
            {(creditTx ?? []).map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span><span className={`font-mono font-semibold ${x.delta < 0 ? "text-danger" : "text-success"}`}>{x.delta > 0 ? "+" : ""}{x.delta}</span> <span className="text-muted">{t(`kind.${x.kind}` as never)} · {x.reason}{x.note ? ` · ${x.note}` : ""}</span></span>
                <span className="text-muted">{new Date(x.created_at).toLocaleDateString("en-GB")} · {t("balanceAfter", { n: x.balance_after })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(existing ?? []).length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {t("activeGrants")}
          </h3>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {(existing ?? []).map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-mono">+{g.int_value}</span>{" "}
                    <span className="text-muted">{g.entitlement_key}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {t(`source.${g.source}` as never)} · {g.reason}
                    {g.effective_until &&
                      ` · ${t("until", { date: new Date(g.effective_until).toLocaleDateString("en-GB") })}`}
                  </p>
                </div>
                {/* Referral rewards are revoked from the growth screen, where
                    the reward ledger is updated alongside. Revoking one here
                    would strip the capability and leave the reward showing as
                    GRANTED. */}
                {g.source === "admin_grant" ? (
                  <form action={revokeGrant} className="shrink-0">
                    <input type="hidden" name="grantId" value={g.id} />
                    <input type="hidden" name="userId" value={userId} />
                    <input type="hidden" name="reason" value="revoked by admin" />
                    <button
                      type="submit"
                      className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold text-muted transition-colors duration-200 hover:border-danger hover:text-danger"
                    >
                      {t("revoke")}
                    </button>
                  </form>
                ) : (
                  <span className="shrink-0 text-xs text-muted">{t("manageInGrowth")}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
