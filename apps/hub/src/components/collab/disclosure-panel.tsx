import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveDeclaration } from "@/lib/consents";
import { addDisclosure, acknowledgeDisclosure } from "@/app/(agent)/collab/disclosure-actions";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";
const btnPri =
  "rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong";

const CATEGORIES = [
  "ownership_status", "authority_to_sell", "title_status", "tenure", "encumbrances",
  "caveats", "existing_tenancy", "vacant_possession", "outstanding_charges",
  "litigation", "auction_foreclosure", "developer_restrictions",
  "renovation_restrictions", "usage_restrictions", "zoning", "structural_defects",
  "known_material_defects", "flood_history", "foreign_purchaser_restrictions",
  "financing_limitations", "service_charges", "other",
] as const;

const ACK_ACTIONS = [
  "received", "reviewed", "clarification_required", "document_required",
  "legal_review_required", "ready_for_client", "not_applicable", "disputed",
] as const;

/** Legal & material disclosure register (§79–81). Agent-to-agent only. */
export async function DisclosurePanel({
  submissionId,
  role,
}: {
  submissionId: string;
  role: "ra" | "sa";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const t = await getTranslations("disclosures");
  const locale = await getLocale();

  const [{ data: disclosures }, declaration] = await Promise.all([
    supabase
      .from("legal_disclosures")
      .select(
        `id, category, description, information_source, mandatory_disclosure,
         client_shareable, requires_legal_verification, status, created_at,
         legal_disclosure_acknowledgements ( action, notes, client_safe_summary, created_at )`,
      )
      .eq("submission_id", submissionId)
      .order("created_at"),
    role === "sa" ? getActiveDeclaration("supply_agent_disclosure", locale) : null,
  ]);

  type AckRow = { action: string; notes: string | null; client_safe_summary: string | null; created_at: string };

  return (
    <section className="rounded-xl border border-line p-6">
      <h2 className="mb-1 font-semibold">{t("title")}</h2>
      <p className="mb-4 text-xs text-muted">{t("intro")}</p>

      <div className="mb-4 space-y-3">
        {!disclosures?.length && <p className="text-sm text-muted">{t("empty")}</p>}
        {disclosures?.map((d) => {
          const acks = ((d.legal_disclosure_acknowledgements ?? []) as AckRow[]).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          );
          const latestAck = acks[0];
          return (
            <div key={d.id} className="rounded-lg bg-surface p-4 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t(`categories.${d.category}`)}</span>
                {d.mandatory_disclosure && (
                  <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger uppercase">
                    {t("mandatory")}
                  </span>
                )}
                {d.requires_legal_verification && (
                  <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning uppercase">
                    {t("legalVerification")}
                  </span>
                )}
                <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-xs font-medium">
                  {t(`status.${d.status}`)}
                </span>
              </div>
              <p className="whitespace-pre-line">{d.description}</p>
              {d.information_source && (
                <p className="mt-1 text-xs text-muted">{t("source")}: {d.information_source}</p>
              )}

              {latestAck && (
                <p className="mt-2 rounded bg-background px-3 py-2 text-xs">
                  <span className="font-semibold">{t("raStatus")}: </span>
                  {t(`ackActions.${latestAck.action}`)}
                  {latestAck.notes && <span className="text-muted"> — {latestAck.notes}</span>}
                  {latestAck.client_safe_summary && (
                    <span className="mt-1 block text-muted">
                      {t("clientSummaryLabel")}: {latestAck.client_safe_summary}
                    </span>
                  )}
                </p>
              )}

              {role === "ra" && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer font-semibold text-crimson">
                    {t("acknowledge")}
                  </summary>
                  <form action={acknowledgeDisclosure} className="mt-2 space-y-2">
                    <input type="hidden" name="submissionId" value={submissionId} />
                    <input type="hidden" name="disclosureId" value={d.id} />
                    <select name="action" className={inputCls} defaultValue="reviewed">
                      {ACK_ACTIONS.map((a) => (
                        <option key={a} value={a}>{t(`ackActions.${a}`)}</option>
                      ))}
                    </select>
                    <input name="notes" placeholder={t("ackNotesHint")} maxLength={2000} className={inputCls} />
                    <textarea name="clientSafeSummary" rows={2} maxLength={2000}
                      placeholder={t("clientSummaryHint")} className={inputCls} />
                    <button type="submit" className={btnPri}>{t("ackSubmit")}</button>
                  </form>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {role === "sa" && declaration && (
        <details className="rounded-lg border border-line p-4">
          <summary className="cursor-pointer text-sm font-semibold">{t("addNew")}</summary>
          <form action={addDisclosure} className="mt-3 space-y-3 text-sm">
            <input type="hidden" name="submissionId" value={submissionId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block font-medium">{t("category")}</span>
                <select name="category" className={inputCls}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{t(`categories.${c}`)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block font-medium">{t("sourceLabel")}</span>
                <input name="informationSource" maxLength={300} placeholder={t("sourceHint")} className={inputCls} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block font-medium">{t("description")}</span>
              <textarea name="description" rows={3} required minLength={10} maxLength={4000} className={inputCls} />
            </label>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" name="mandatory" className="h-4 w-4 accent-crimson" />
                {t("mandatoryLabel")}
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" name="clientShareable" className="h-4 w-4 accent-crimson" />
                {t("clientShareableLabel")}
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" name="requiresLegal" className="h-4 w-4 accent-crimson" />
                {t("requiresLegalLabel")}
              </label>
            </div>
            <div className="rounded-lg border border-crimson/30 bg-crimson-soft/40 p-3">
              <p className="mb-2 text-xs whitespace-pre-line text-muted">{declaration.body}</p>
              <label className="flex items-start gap-2 text-xs font-medium">
                <input type="checkbox" name="declarationAccepted" required className="mt-0.5 h-4 w-4 accent-crimson" />
                {t("declarationAccept")}
              </label>
            </div>
            <button type="submit" className={btnPri}>{t("submit")}</button>
          </form>
        </details>
      )}
    </section>
  );
}
