import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { Panel, StatCard } from "@/components/admin/panel";
import { formatMoney } from "@/lib/entitlements";
import { PROVIDER_ENV, providerConfigured, webhookUrl, type ProviderKey } from "@/lib/payments";
import { setProviderMode, setPackPrice } from "./actions";

/**
 * Payments (Decision 8): the three gateways, their mode, whether the Worker
 * holds their secrets (presence only — never a value), the webhook URL each
 * dashboard must be given, credit-pack prices per currency, and the two logs.
 */
export const dynamic = "force-dynamic";

const CURRENCIES = ["MYR", "IDR", "USD"] as const;

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireCapability("commercial.manage");
  const { notice } = await searchParams;
  const t = await getTranslations("adminPayments");
  const locale = await getLocale();
  const supabase = await createClient();

  const [{ data: settings }, { data: providers }, { data: packs }, { data: intents }, { data: events }] = await Promise.all([
    supabase.from("commercial_settings").select("billing_mode").eq("id", true).maybeSingle(),
    supabase.from("payment_providers").select("key, name, currency, countries, methods, mode, is_active, updated_at").order("key"),
    supabase.from("credit_packs").select("key, kind, credits, name, rank, is_active, credit_pack_prices(currency, price)").order("rank"),
    supabase.from("payment_intents").select("id, human_readable_id, user_id, provider_key, mode, kind, status, amount, currency, created_at, paid_at, failure_reason, profiles:user_id(display_name)").order("created_at", { ascending: false }).limit(25),
    supabase.from("payment_events").select("id, provider_key, event_type, signature_valid, amount, currency, outcome, received_at, intent_id").order("received_at", { ascending: false }).limit(25),
  ]);

  const billing = settings?.billing_mode ?? "FREE_LAUNCH";
  const paid = (intents ?? []).filter((i) => i.status === "paid").length;
  const bad = (events ?? []).filter((e) => !e.signature_valid).length;
  const input = "rounded-lg border border-line bg-card px-3 py-2 text-sm";
  const btn = "min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold hover:border-crimson hover:text-crimson";

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 max-w-3xl text-sm text-muted">{t("intro")}</p>

      {notice && (
        <p className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${["mode_set", "priced"].includes(notice) ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {t(`notice.${notice}` as never)}
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard value={t(`billing.${billing}` as never)} label={t("kpi.billing")} icon="₪" tone={billing === "LIVE_BILLING" ? "red" : "blue"} />
        <StatCard value={paid} label={t("kpi.paid")} icon="✓" tone="green" />
        <StatCard value={bad} label={t("kpi.badSignatures")} icon="⚠" tone={bad ? "red" : "green"} invert />
      </div>

      {/* Providers --------------------------------------------------------- */}
      <Panel title={t("providersTitle")} hint={t("providersHint")} className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">{t("cols.provider")}</th>
                <th className="px-3 py-2">{t("cols.collects")}</th>
                <th className="px-3 py-2">{t("cols.secrets")}</th>
                <th className="px-3 py-2">{t("cols.webhook")}</th>
                <th className="px-3 py-2">{t("cols.mode")}</th>
              </tr>
            </thead>
            <tbody>
              {(providers ?? []).map((p) => {
                const key = p.key as ProviderKey;
                const sandboxOk = providerConfigured(key, "sandbox");
                const liveOk = providerConfigured(key, "live");
                return (
                  <tr key={p.key} className="border-t border-line align-top">
                    <td className="px-3 py-3">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted">{(p.methods ?? []).join(" · ") || "—"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-mono">{p.currency}</p>
                      <p className="text-xs text-muted">{(p.countries ?? []).join(", ") || t("anyCountry")}</p>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <p><span className={`inline-block h-2 w-2 rounded-full ${sandboxOk ? "bg-success" : "bg-line"}`} /> {t("secrets.sandbox")}: {sandboxOk ? t("secrets.present") : t("secrets.missing")}</p>
                      <p className="mt-1"><span className={`inline-block h-2 w-2 rounded-full ${liveOk ? "bg-success" : "bg-line"}`} /> {t("secrets.live")}: {liveOk ? t("secrets.present") : t("secrets.missing")}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted">{PROVIDER_ENV[key].join(" · ")}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-muted break-all">{webhookUrl(key)}</td>
                    <td className="px-3 py-3">
                      <form action={setProviderMode} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="key" value={p.key} />
                        <select name="mode" defaultValue={p.mode} className={input}>
                          <option value="off">{t("mode.off")}</option>
                          <option value="sandbox">{t("mode.sandbox")}</option>
                          <option value="live">{t("mode.live")}</option>
                        </select>
                        <input name="confirm" placeholder="LIVE" className={`${input} w-20`} aria-label={t("confirmLive")} />
                        <button type="submit" className={btn}>{t("save")}</button>
                      </form>
                      <p className="mt-1 text-[11px] text-muted">{t("liveNeeds")}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Credit packs ------------------------------------------------------ */}
      <Panel title={t("packsTitle")} hint={t("packsHint")} className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">{t("cols.pack")}</th>
                {CURRENCIES.map((c) => <th key={c} className="px-3 py-2">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {(packs ?? []).map((p) => {
                const prices = (p.credit_pack_prices ?? []) as unknown as { currency: string; price: string }[];
                return (
                  <tr key={p.key} className="border-t border-line">
                    <td className="px-3 py-3">
                      <p className="font-semibold">{p.name}</p>
                      <p className="font-mono text-xs text-muted">{p.key} · {p.credits} × {p.kind}</p>
                    </td>
                    {CURRENCIES.map((c) => {
                      const cur = prices.find((x) => x.currency === c);
                      return (
                        <td key={c} className="px-3 py-3">
                          <form action={setPackPrice} className="flex items-center gap-2">
                            <input type="hidden" name="packKey" value={p.key} />
                            <input type="hidden" name="currency" value={c} />
                            <input name="price" type="number" min={0} step={c === "IDR" ? "1000" : "1"} defaultValue={cur?.price ?? 0} className={`${input} w-32`} aria-label={`${p.key} ${c}`} />
                            <button type="submit" className={btn}>{t("save")}</button>
                          </form>
                          <p className="mt-1 text-[11px] text-muted">{cur ? formatMoney(cur.price, c, locale) : t("unpriced")}</p>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Intents ------------------------------------------------------------ */}
      <Panel title={t("intentsTitle")} hint={t("intentsHint")} className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <tbody>
              {(intents ?? []).map((i) => {
                const who = i.profiles as unknown as { display_name: string | null } | null;
                return (
                  <tr key={i.id} className="border-t border-line">
                    <td className="px-3 py-2 font-mono text-xs">{i.human_readable_id}</td>
                    <td className="px-3 py-2"><Link href={`/admin/agents/${i.user_id}`} className="text-crimson hover:underline">{who?.display_name ?? "—"}</Link></td>
                    <td className="px-3 py-2 text-xs">{i.provider_key} · {i.mode}</td>
                    <td className="px-3 py-2 text-xs">{t(`kind.${i.kind}` as never)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(i.amount, i.currency, locale)}</td>
                    <td className="px-3 py-2 text-xs font-semibold">{i.status}</td>
                    <td className="px-3 py-2 text-xs text-muted">{new Date(i.paid_at ?? i.created_at).toLocaleString(locale)}</td>
                    <td className="px-3 py-2 text-xs text-muted">{i.failure_reason ?? ""}</td>
                  </tr>
                );
              })}
              {!(intents ?? []).length && <tr><td className="px-3 py-6 text-center text-muted">{t("noIntents")}</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Events ------------------------------------------------------------- */}
      <Panel title={t("eventsTitle")} hint={t("eventsHint")}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <tbody>
              {(events ?? []).map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="px-3 py-2 text-xs text-muted">{new Date(e.received_at).toLocaleString(locale)}</td>
                  <td className="px-3 py-2 text-xs">{e.provider_key}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.event_type}</td>
                  <td className="px-3 py-2 text-xs"><span className={`rounded-full px-2 py-0.5 font-semibold ${e.signature_valid ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{e.signature_valid ? t("sig.ok") : t("sig.bad")}</span></td>
                  <td className="px-3 py-2 tabular-nums">{e.amount != null && e.currency ? formatMoney(e.amount, e.currency, locale) : "—"}</td>
                  <td className="px-3 py-2 text-xs">{e.outcome}</td>
                </tr>
              ))}
              {!(events ?? []).length && <tr><td className="px-3 py-6 text-center text-muted">{t("noEvents")}</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
