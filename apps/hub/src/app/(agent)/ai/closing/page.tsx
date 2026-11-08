import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { ToolHeader } from "@/components/ai/tool-header";
import { createChecklist, toggleStep, setChecklistStatus } from "./actions";

/**
 * Closing Checklist — the documents and steps between accepted offer and
 * keys, per country and transaction (00098 `closing_steps`, seeded DRAFT and
 * verified by an admin), ticked per deal by the agent.
 */
type Step = { id: string; position: number; title: Record<string, string>; detail: Record<string, string>; owner_party: string; typical_days: number | null; status: string };
type Checklist = { id: string; label: string; country_code: string; transaction_type: "sale" | "rent"; lead_id: string | null; done_step_ids: string[]; notes: string | null; status: string; created_at: string };

export default async function ClosingPage({ searchParams }: { searchParams: Promise<{ c?: string; error?: string; show?: string }> }) {
  const user = await requireUser();
  const { c, error, show } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("aiTools.closing");
  const supabase = await createClient();

  const [{ data: profile }, { data: countries }, { data: lists }, { data: leads }] = await Promise.all([
    supabase.from("profiles").select("country_code").eq("id", user.id).maybeSingle(),
    supabase.from("countries").select("code, name").eq("active", true).order("name"),
    supabase.from("closing_checklists").select("*").eq("agent_id", user.id).neq("status", show === "archived" ? "none" : "archived").order("created_at", { ascending: false }).limit(40),
    supabase.from("leads").select("id, human_readable_id, contacts (full_name)").in("status", ["negotiating", "booking", "financing", "viewed", "viewing_confirmed", "qualified"]).order("created_at", { ascending: false }).limit(50),
  ]);
  const checklists = (lists ?? []) as Checklist[];
  const current = checklists.find((x) => x.id === c) ?? checklists.find((x) => x.status === "open") ?? null;
  const { data: stepRows } = current
    ? await supabase.from("closing_steps").select("id, position, title, detail, owner_party, typical_days, status").eq("country_code", current.country_code).eq("transaction_type", current.transaction_type).neq("status", "retired").order("position")
    : { data: [] as Step[] };
  const steps = (stepRows ?? []) as Step[];
  const done = new Set(current?.done_step_ids ?? []);
  const pick = (j: Record<string, string>) => j[locale] ?? j.en ?? Object.values(j)[0] ?? "";
  const anyDraft = steps.some((s) => s.status === "draft");
  const input = "rounded-lg border border-line bg-background px-3 py-2 text-sm";

  return (
    <AgentShell wide>
      <ToolHeader roleKey="closing_checklist" title={t("title")} intro={t("intro")} userId={user.id} />
      {error && <p className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{t(`errors.${error}` as never)}</p>}

      <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
        <aside className="space-y-4">
          <form action={createChecklist} className="space-y-3 rounded-xl border border-line bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("newTitle")}</p>
            <input name="label" required maxLength={120} placeholder={t("labelHint")} className={`${input} w-full`} />
            <div className="grid grid-cols-2 gap-2">
              <select name="countryCode" defaultValue={profile?.country_code ?? countries?.[0]?.code} className={input}>
                {(countries ?? []).map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
              </select>
              <select name="transactionType" defaultValue="sale" className={input}>
                <option value="sale">{t("sale")}</option><option value="rent">{t("rent")}</option>
              </select>
            </div>
            <select name="leadId" defaultValue="" className={`${input} w-full`}>
              <option value="">{t("noLead")}</option>
              {((leads ?? []) as unknown as { id: string; human_readable_id: string; contacts: { full_name: string } | { full_name: string }[] | null }[]).map((l) => {
                const ct = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts;
                return <option key={l.id} value={l.id}>{l.human_readable_id} · {ct?.full_name ?? ""}</option>;
              })}
            </select>
            <button type="submit" className="w-full rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong">{t("create")}</button>
          </form>

          <div className="rounded-xl border border-line bg-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{show === "archived" ? t("archived") : t("mine")}</p>
              <Link href={show === "archived" ? "/ai/closing" : "/ai/closing?show=archived"} className="text-[11px] font-semibold text-blue hover:underline">{show === "archived" ? t("showOpen") : t("showArchived")}</Link>
            </div>
            <ul className="divide-y divide-line">
              {!checklists.length && <li className="px-4 py-6 text-center text-sm text-muted">{t("empty")}</li>}
              {checklists.map((x) => (
                <li key={x.id}>
                  <Link href={`/ai/closing?c=${x.id}${show ? `&show=${show}` : ""}`} className={`block px-4 py-3 text-sm hover:bg-surface ${current?.id === x.id ? "bg-surface" : ""}`}>
                    <p className="truncate font-medium">{x.label}</p>
                    <p className="text-xs text-muted">{x.country_code} · {x.transaction_type === "rent" ? t("rent") : t("sale")} · {x.done_step_ids.length} ✓ · {t(`status.${x.status}` as never)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="rounded-xl border border-line bg-card">
          {!current ? (
            <p className="p-10 text-center text-sm text-muted">{t("pickOne")}</p>
          ) : (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                <div>
                  <h2 className="text-base font-semibold">{current.label}</h2>
                  <p className="text-xs text-muted">{current.country_code} · {current.transaction_type === "rent" ? t("rent") : t("sale")} · {done.size}/{steps.length}</p>
                </div>
                <div className="flex gap-2">
                  {current.status === "open" && (
                    <form action={setChecklistStatus}><input type="hidden" name="checklistId" value={current.id} /><input type="hidden" name="status" value="completed" />
                      <button type="submit" className="rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white">{t("markCompleted")}</button></form>
                  )}
                  {current.status !== "archived" && (
                    <form action={setChecklistStatus}><input type="hidden" name="checklistId" value={current.id} /><input type="hidden" name="status" value="archived" />
                      <button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface">{t("archive")}</button></form>
                  )}
                </div>
              </header>
              {anyDraft && <p className="mx-5 mt-4 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">{t("draftBanner")}</p>}
              <div className="mx-5 mt-3 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={done.size} aria-valuemin={0} aria-valuemax={steps.length}>
                <div className="h-full rounded-full bg-success" style={{ width: steps.length ? `${Math.round((done.size / steps.length) * 100)}%` : 0 }} />
              </div>
              <ol className="divide-y divide-line">
                {steps.map((s) => {
                  const isDone = done.has(s.id);
                  return (
                    <li key={s.id} className="flex items-start gap-3 px-5 py-3">
                      <form action={toggleStep}>
                        <input type="hidden" name="checklistId" value={current.id} /><input type="hidden" name="stepId" value={s.id} /><input type="hidden" name="done" value={isDone ? "0" : "1"} />
                        <button type="submit" aria-pressed={isDone} className={`mt-0.5 grid h-6 w-6 place-items-center rounded-full border text-xs font-bold ${isDone ? "border-success bg-success text-white" : "border-line text-muted hover:border-crimson"}`}>{isDone ? "✓" : ""}</button>
                      </form>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${isDone ? "text-muted line-through" : ""}`}>{pick(s.title)}</p>
                        {pick(s.detail) && <p className="mt-0.5 text-xs text-muted">{pick(s.detail)}</p>}
                        <p className="mt-1 text-[11px] text-muted">
                          {t(`party.${s.owner_party}` as never)}{s.typical_days ? ` · ${t("days", { count: s.typical_days })}` : ""}
                          {s.status === "draft" && <span className="ml-2 font-semibold text-warning">{t("draft")}</span>}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <form action={setChecklistStatus} className="border-t border-line px-5 py-4">
                <input type="hidden" name="checklistId" value={current.id} /><input type="hidden" name="status" value={current.status} />
                <label className="block text-xs font-semibold text-muted">{t("notes")}
                  <textarea name="notes" defaultValue={current.notes ?? ""} rows={3} maxLength={2000} className={`${input} mt-1 w-full`} />
                </label>
                <button type="submit" className="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface">{t("saveNotes")}</button>
              </form>
            </>
          )}
        </section>
      </div>
    </AgentShell>
  );
}
