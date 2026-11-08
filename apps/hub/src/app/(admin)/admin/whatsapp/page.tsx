import { getTranslations, getLocale } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { Panel, StatCard } from "@/components/admin/panel";
import { whatsappConfigured } from "@/lib/whatsapp";
import { updateWaAccount, upsertWaTemplate, addWaOptOut } from "./actions";

/**
 * WhatsApp Cloud API (E12): the numbers, their mode, the template registry,
 * the opt-out list, the message log and the webhook deliveries. Secrets are
 * Worker variables; this page shows presence only.
 */
export const dynamic = "force-dynamic";

export default async function AdminWhatsappPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireCapability("platform.configure");
  const { notice } = await searchParams;
  const t = await getTranslations("adminWhatsapp");
  const locale = await getLocale();
  const supabase = await createClient();

  const [{ data: flags }, { data: accounts }, { data: templates }, { data: optOuts }, { data: messages }, { data: events }] = await Promise.all([
    supabase.from("feature_flags").select("key, enabled, targeted").in("key", ["whatsapp_cloud", "whatsapp_marketing"]),
    supabase.from("wa_accounts").select("*").order("country_code"),
    supabase.from("wa_templates").select("*, wa_accounts(country_code)").order("created_at", { ascending: false }),
    supabase.from("wa_opt_outs").select("phone, source, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("wa_messages").select("id, direction, kind, status, body, from_phone, to_phone, lead_id, error, pricing_category, created_at, wa_accounts(country_code)").order("created_at", { ascending: false }).limit(30),
    supabase.from("wa_webhook_events").select("id, signature_valid, messages, statuses, outcome, received_at").order("received_at", { ascending: false }).limit(20),
  ]);
  const cfg = whatsappConfigured();
  const flagOf = new Map((flags ?? []).map((f) => [f.key, f]));
  const base = (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const input = "rounded-lg border border-line bg-card px-3 py-2 text-sm";
  const btn = "min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold hover:border-crimson hover:text-crimson";
  const mask = (p: string) => p.replace(/^(\+\d{2,4})\d+(\d{3})$/, "$1•••$2");

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 max-w-3xl text-sm text-muted">{t("intro")}</p>

      {notice && (
        <p className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${["saved", "template_saved", "opt_out_added"].includes(notice) ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {t(`notice.${notice}` as never)}
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard value={flagOf.get("whatsapp_cloud")?.enabled ? (flagOf.get("whatsapp_cloud")?.targeted ? t("kpi.targeted") : t("kpi.on")) : t("kpi.off")} label={t("kpi.channel")} icon="◍" tone={flagOf.get("whatsapp_cloud")?.enabled ? "green" : "blue"} />
        <StatCard value={flagOf.get("whatsapp_marketing")?.enabled ? t("kpi.on") : t("kpi.off")} label={t("kpi.marketing")} icon="▤" tone={flagOf.get("whatsapp_marketing")?.enabled ? "red" : "blue"} />
        <StatCard value={[cfg.token, cfg.appSecret, cfg.verifyToken].filter(Boolean).length + " / 3"} label={t("kpi.secrets")} icon="⚿" tone={cfg.token && cfg.appSecret && cfg.verifyToken ? "green" : "orange"} />
        <StatCard value={(optOuts ?? []).length} label={t("kpi.optOuts")} icon="⊘" tone="blue" />
      </div>

      {/* Accounts ---------------------------------------------------------- */}
      <Panel title={t("accountsTitle")} hint={t("accountsHint", { url: `${base}/api/whatsapp/webhook` })} className="mb-6">
        <p className="mb-3 font-mono text-[11px] text-muted">WHATSAPP_ACCESS_TOKEN: {cfg.token ? t("present") : t("missing")} · WHATSAPP_APP_SECRET: {cfg.appSecret ? t("present") : t("missing")} · WHATSAPP_VERIFY_TOKEN: {cfg.verifyToken ? t("present") : t("missing")}</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {(accounts ?? []).map((a) => (
            <form key={a.id} action={updateWaAccount} className="rounded-xl border border-line p-4">
              <input type="hidden" name="id" value={a.id} />
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="font-semibold">{a.country_code}</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.mode === "live" ? "bg-danger/10 text-danger" : a.mode === "test" ? "bg-warning/10 text-warning" : "bg-surface text-muted"}`}>{t(`mode.${a.mode}` as never)}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-muted">{t("f.displayPhone")}<input name="display_phone" defaultValue={a.display_phone ?? ""} placeholder="+60 …" className={`${input} mt-1 w-full`} /></label>
                <label className="text-xs text-muted">{t("f.phoneNumberId")}<input name="phone_number_id" defaultValue={a.phone_number_id ?? ""} inputMode="numeric" className={`${input} mt-1 w-full font-mono`} /></label>
                <label className="text-xs text-muted">{t("f.wabaId")}<input name="waba_id" defaultValue={a.waba_id ?? ""} inputMode="numeric" className={`${input} mt-1 w-full font-mono`} /></label>
                <label className="text-xs text-muted">{t("f.mode")}
                  <select name="mode" defaultValue={a.mode} className={`${input} mt-1 w-full`}>
                    <option value="off">{t("mode.off")}</option>
                    <option value="test">{t("mode.test")}</option>
                    <option value="live">{t("mode.live")}</option>
                  </select>
                </label>
                <label className="text-xs text-muted sm:col-span-2">{t("f.testRecipients")}
                  <textarea name="test_recipients" defaultValue={(a.test_recipients ?? []).join("\n")} rows={2} placeholder="+60123456789" className={`${input} mt-1 w-full font-mono`} />
                  <span className="mt-1 block text-[11px]">{t("f.testRecipientsHint")}</span>
                </label>
                <label className="text-xs text-muted">{t("f.confirm")}<input name="confirm" placeholder="LIVE" className={`${input} mt-1 w-full`} /></label>
                <div className="flex items-end"><button type="submit" className={btn}>{t("save")}</button></div>
              </div>
            </form>
          ))}
        </div>
      </Panel>

      {/* Templates --------------------------------------------------------- */}
      <Panel title={t("templatesTitle")} hint={t("templatesHint")} className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-3 py-2">{t("cols.template")}</th><th className="px-3 py-2">{t("cols.category")}</th><th className="px-3 py-2">{t("cols.status")}</th><th className="px-3 py-2">{t("cols.body")}</th></tr>
            </thead>
            <tbody>
              {(templates ?? []).map((tp) => (
                <tr key={tp.id} className="border-t border-line align-top">
                  <td className="px-3 py-2"><span className="font-mono text-xs">{tp.name}</span><br /><span className="text-xs text-muted">{(tp.wa_accounts as unknown as { country_code: string } | null)?.country_code} · {tp.language} · {tp.variables} var</span></td>
                  <td className="px-3 py-2 text-xs">{t(`category.${tp.category}` as never)}</td>
                  <td className="px-3 py-2 text-xs"><span className={`rounded-full px-2 py-0.5 font-semibold ${tp.status === "approved" ? "bg-success/10 text-success" : tp.status === "rejected" ? "bg-danger/10 text-danger" : "bg-surface text-muted"}`}>{t(`status.${tp.status}` as never)}</span></td>
                  <td className="px-3 py-2 text-xs">{tp.body}</td>
                </tr>
              ))}
              {!(templates ?? []).length && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted">{t("noTemplates")}</td></tr>}
            </tbody>
          </table>
        </div>
        <form action={upsertWaTemplate} className="mt-4 grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-3">
          <input type="hidden" name="id" value="" />
          <label className="text-xs text-muted">{t("f.account")}
            <select name="account_id" className={`${input} mt-1 w-full`}>{(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.country_code}</option>)}</select>
          </label>
          <label className="text-xs text-muted">{t("f.name")}<input name="name" required pattern="[a-z0-9_]{3,60}" placeholder="viewing_reminder" className={`${input} mt-1 w-full font-mono`} /></label>
          <label className="text-xs text-muted">{t("f.language")}
            <select name="language" className={`${input} mt-1 w-full`}><option value="en">en</option><option value="ms">ms</option><option value="id">id</option></select>
          </label>
          <label className="text-xs text-muted">{t("f.category")}
            <select name="category" className={`${input} mt-1 w-full`}><option value="utility">{t("category.utility")}</option><option value="marketing">{t("category.marketing")}</option><option value="authentication">{t("category.authentication")}</option></select>
          </label>
          <label className="text-xs text-muted">{t("f.status")}
            <select name="status" defaultValue="draft" className={`${input} mt-1 w-full`}>{["draft", "pending", "approved", "rejected", "paused"].map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}</select>
          </label>
          <label className="text-xs text-muted">{t("f.metaId")}<input name="meta_template_id" className={`${input} mt-1 w-full font-mono`} /></label>
          <label className="text-xs text-muted sm:col-span-3">{t("f.body")}<textarea name="body" required rows={3} placeholder={t("f.bodyPlaceholder")} className={`${input} mt-1 w-full`} /></label>
          <label className="text-xs text-muted sm:col-span-2">{t("f.note")}<input name="note" className={`${input} mt-1 w-full`} /></label>
          <div className="flex items-end"><button type="submit" className={btn}>{t("addTemplate")}</button></div>
        </form>
      </Panel>

      {/* Opt-outs ---------------------------------------------------------- */}
      <Panel title={t("optOutsTitle")} hint={t("optOutsHint")} className="mb-6">
        <form action={addWaOptOut} className="mb-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">{t("f.phone")}<input name="phone" required placeholder="+60…" className={`${input} mt-1 block font-mono`} /></label>
          <label className="text-xs text-muted">{t("f.note")}<input name="note" className={`${input} mt-1 block`} /></label>
          <button type="submit" className={btn}>{t("addOptOut")}</button>
        </form>
        <ul className="grid gap-1 text-xs sm:grid-cols-3">
          {(optOuts ?? []).map((o) => <li key={o.phone} className="rounded-lg bg-surface px-3 py-1.5 font-mono">{mask(o.phone)} <span className="text-muted">· {o.source} · {new Date(o.created_at).toLocaleDateString(locale)}</span></li>)}
          {!(optOuts ?? []).length && <li className="text-muted">{t("noOptOuts")}</li>}
        </ul>
      </Panel>

      {/* Messages + deliveries ---------------------------------------------- */}
      <Panel title={t("messagesTitle")} hint={t("messagesHint")} className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <tbody>
              {(messages ?? []).map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="px-3 py-2 text-xs text-muted">{new Date(m.created_at).toLocaleString(locale)}</td>
                  <td className="px-3 py-2 text-xs">{(m.wa_accounts as unknown as { country_code: string } | null)?.country_code} {m.direction === "in" ? "←" : "→"} {m.kind}</td>
                  <td className="px-3 py-2 font-mono text-xs">{mask(m.direction === "in" ? m.from_phone : m.to_phone)}</td>
                  <td className="px-3 py-2 text-xs">{m.body ? m.body.slice(0, 80) : "—"}</td>
                  <td className="px-3 py-2 text-xs font-semibold">{m.status}{m.pricing_category ? ` · ${m.pricing_category}` : ""}</td>
                  <td className="px-3 py-2 text-xs text-muted">{m.lead_id ? "" : t("unmatched")}{m.error ? ` ${m.error}` : ""}</td>
                </tr>
              ))}
              {!(messages ?? []).length && <tr><td className="px-3 py-6 text-center text-muted">{t("noMessages")}</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title={t("eventsTitle")} hint={t("eventsHint")}>
        <ul className="divide-y divide-line text-xs">
          {(events ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="text-muted">{new Date(e.received_at).toLocaleString(locale)}</span>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${e.signature_valid ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{e.signature_valid ? t("sig.ok") : t("sig.bad")}</span>
              <span>{e.messages} msg · {e.statuses} status</span>
              <span className="font-mono text-muted">{e.outcome}</span>
            </li>
          ))}
          {!(events ?? []).length && <li className="py-4 text-center text-muted">{t("noEvents")}</li>}
        </ul>
      </Panel>
    </>
  );
}
