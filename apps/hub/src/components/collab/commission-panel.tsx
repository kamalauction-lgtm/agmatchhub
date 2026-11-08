import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { proposeCommission, acceptCommission } from "@/app/(agent)/collab/commission-actions";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";
const btnPri =
  "rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong";

/**
 * Commission & co-broke agreement panel (§72–78, §84). Agent-to-agent only —
 * this component must never be rendered on any client-facing route.
 */
export async function CommissionPanel({
  submissionId,
  role,
  currency,
}: {
  submissionId: string;
  role: "ra" | "sa";
  currency: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const t = await getTranslations("commission");

  const { data: agreement } = await supabase
    .from("commission_agreements")
    .select(
      `*, commission_agreement_versions (
         id, version_number, sharing_method, listing_side_percentage,
         buyer_side_percentage, listing_side_amount, buyer_side_amount,
         currency, custom_terms, amendment_reason, proposed_by, created_at,
         profiles ( display_name )
       ),
       commission_acceptances ( version_id, user_id, side, created_at )`,
    )
    .eq("submission_id", submissionId)
    .maybeSingle();

  type VersionRow = {
    id: string; version_number: number; sharing_method: string;
    listing_side_percentage: number | null; buyer_side_percentage: number | null;
    listing_side_amount: number | null; buyer_side_amount: number | null;
    currency: string | null; custom_terms: string | null;
    amendment_reason: string | null; created_at: string;
    profiles: { display_name: string } | { display_name: string }[] | null;
  };
  type AcceptRow = { version_id: string; user_id: string; side: string; created_at: string };

  const versions = ((agreement?.commission_agreement_versions ?? []) as VersionRow[]).sort(
    (a, b) => b.version_number - a.version_number,
  );
  const current = versions.find((v) => v.id === agreement?.current_version_id) ?? versions[0];
  const acceptances = (agreement?.commission_acceptances ?? []) as AcceptRow[];
  const currentAcceptances = current
    ? acceptances.filter((a) => a.version_id === current.id)
    : [];
  const iAccepted = currentAcceptances.some((a) => a.user_id === user.id);
  const isLocked = agreement?.status === "accepted";

  const money = (n: unknown, cur: string | null = currency) =>
    n == null ? null : `${cur ?? currency} ${Number(n).toLocaleString()}`;

  const splitLabel = (v: VersionRow) => {
    if (v.sharing_method === "custom_fixed") {
      return `${t("listingSide")} ${money(v.listing_side_amount, v.currency)} · ${t("buyerSide")} ${money(v.buyer_side_amount, v.currency)}`;
    }
    return `${t("listingSide")} ${Number(v.listing_side_percentage)}% · ${t("buyerSide")} ${Number(v.buyer_side_percentage)}%`;
  };

  return (
    <section className="rounded-xl border border-crimson/30 p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold">{t("title")}</h2>
        {agreement && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isLocked ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
          }`}>
            {t(`status.${agreement.status}`)}
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-muted">{t("privacyNote")}</p>

      {agreement && (
        <div className="mb-4 grid gap-x-6 gap-y-2 rounded-lg bg-surface p-4 text-sm sm:grid-cols-2">
          <div>
            <span className="text-xs text-muted uppercase">{t("totalDeclared")}: </span>
            <span className="font-medium">
              {agreement.total_commission_type === "percentage" && agreement.total_percentage != null
                ? `${Number(agreement.total_percentage)}%`
                : agreement.total_commission_type === "fixed"
                  ? money(agreement.total_amount, agreement.currency)
                  : t("toBeConfirmed")}
            </span>
          </div>
          {agreement.payer_type && (
            <div>
              <span className="text-xs text-muted uppercase">{t("payer")}: </span>
              <span className="font-medium">{t(`payers.${agreement.payer_type}`)}</span>
            </div>
          )}
          {agreement.calculation_basis && (
            <div>
              <span className="text-xs text-muted uppercase">{t("basis")}: </span>
              <span className="font-medium">{t(`bases.${agreement.calculation_basis}`)}</span>
            </div>
          )}
          <div>
            <span className="text-xs text-muted uppercase">ID: </span>
            <span className="font-mono text-xs">{agreement.human_readable_id}</span>
          </div>
        </div>
      )}

      {current && (
        <div className={`mb-4 rounded-lg border p-4 text-sm ${
          isLocked ? "border-success/40 bg-success/5" : "border-line"
        }`}>
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold">
              {t("currentVersion", { n: current.version_number })} — {t(`methods.${current.sharing_method}`)}
            </span>
          </div>
          <p className="font-medium">{splitLabel(current)}</p>
          {current.custom_terms && <p className="mt-1 text-xs text-muted">{current.custom_terms}</p>}
          {current.amendment_reason && (
            <p className="mt-1 text-xs text-warning">{t("amendmentReason")}: {current.amendment_reason}</p>
          )}
          <p className="mt-2 text-xs text-muted">
            {t("acceptedBy")}: {currentAcceptances.length
              ? currentAcceptances.map((a) => t(`sides.${a.side}`)).join(", ")
              : "—"} ({currentAcceptances.length}/2)
          </p>

          {!isLocked && !iAccepted && (
            <form action={acceptCommission} className="mt-3">
              <input type="hidden" name="submissionId" value={submissionId} />
              <input type="hidden" name="versionId" value={current.id} />
              <button type="submit" className={btnPri}>{t("agreeButton")}</button>
              <p className="mt-1 text-[11px] text-muted">{t("agreeHint")}</p>
            </form>
          )}
          {isLocked && <p className="mt-2 text-xs font-semibold text-success">{t("lockedNote")}</p>}
        </div>
      )}

      {versions.length > 1 && (
        <details className="mb-4 text-sm">
          <summary className="cursor-pointer font-medium text-muted">{t("history")}</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {versions.map((v) => {
              const p = Array.isArray(v.profiles) ? v.profiles[0] : v.profiles;
              return (
                <li key={v.id} className="rounded bg-surface px-3 py-2">
                  v{v.version_number} · {t(`methods.${v.sharing_method}`)} · {splitLabel(v)} ·{" "}
                  {t("proposedBy")} {p?.display_name} · {new Date(v.created_at).toLocaleString()}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <details className="rounded-lg border border-line p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          {agreement ? (isLocked ? t("proposeAmendment") : t("proposeCounter")) : t("proposeFirst")}
        </summary>
        <form action={proposeCommission} className="mt-3 space-y-3">
          <input type="hidden" name="submissionId" value={submissionId} />
          {!agreement && role === "sa" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{t("totalTypeLabel")}</span>
                <select name="totalType" defaultValue="percentage" className={inputCls}>
                  <option value="percentage">{t("totalTypes.percentage")}</option>
                  <option value="fixed">{t("totalTypes.fixed")}</option>
                  <option value="to_be_confirmed">{t("totalTypes.to_be_confirmed")}</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{t("totalValueLabel")}</span>
                <input type="number" name="totalPercentage" min="0" max="100" step="0.01"
                  placeholder="%" className={inputCls} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{t("payer")}</span>
                <select name="payerType" defaultValue="owner" className={inputCls}>
                  {["seller", "owner", "landlord", "developer", "listing_agency", "supply_agent", "other"].map((p) => (
                    <option key={p} value={p}>{t(`payers.${p}`)}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{t("basis")}</span>
                <select name="calculationBasis" defaultValue="final_sale_price" className={inputCls}>
                  {["final_sale_price", "asking_price", "accepted_offer_price",
                    "monthly_rental", "annual_rental", "other"].map((b) => (
                    <option key={b} value={b}>{t(`bases.${b}`)}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("methodLabel")}</span>
            <select name="method" defaultValue="fifty_fifty" className={inputCls}>
              <option value="fifty_fifty">{t("methods.fifty_fifty")}</option>
              <option value="custom_percentage">{t("methods.custom_percentage")}</option>
              <option value="custom_fixed">{t("methods.custom_fixed")}</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("listingPctLabel")}</span>
              <input type="number" name="listingPct" min="0" max="100" step="0.01" className={inputCls} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("buyerPctLabel")}</span>
              <input type="number" name="buyerPct" min="0" max="100" step="0.01" className={inputCls} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("listingAmtLabel", { currency })}</span>
              <input type="number" name="listingAmt" min="0" step="0.01" className={inputCls} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("buyerAmtLabel", { currency })}</span>
              <input type="number" name="buyerAmt" min="0" step="0.01" className={inputCls} />
            </label>
          </div>
          <p className="text-xs text-muted">{t("methodHint")}</p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("customTerms")}</span>
            <input name="customTerms" maxLength={2000} className={inputCls} />
          </label>
          {isLocked && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-warning">{t("amendmentReasonLabel")}</span>
              <input name="amendmentReason" required maxLength={500} className={inputCls}
                placeholder={t("amendmentReasonHint")} />
            </label>
          )}
          <button type="submit" className={btnPri}>{t("proposeSubmit")}</button>
        </form>
      </details>
    </section>
  );
}
