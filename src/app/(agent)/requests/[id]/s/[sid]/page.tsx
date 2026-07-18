import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { CollabPanels } from "@/components/collab/collab-panels";
import { reviewSubmission } from "../actions";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

const REJECT_REASONS = [
  "over_budget", "below_required_size", "wrong_location", "wrong_property_type",
  "insufficient_information", "property_not_available", "no_appointment",
  "client_not_interested", "duplicate_submission", "other",
] as const;

const RISK_STYLE: Record<string, string> = {
  verified_direct: "bg-success/10 text-success",
  direct_document_pending: "bg-warning/10 text-warning",
  indirect_verified_source: "bg-success/10 text-success",
  indirect_limited_verification: "bg-warning/10 text-warning",
  open_market_confirmation_required: "bg-warning/10 text-warning",
  high_risk: "bg-danger/10 text-danger",
};

export default async function SubmissionReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; sid: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { id, sid } = await params;
  const { done, error } = await searchParams;
  await requireUser();
  const supabase = await createClient();
  const t = await getTranslations("review");
  const ts = await getTranslations("submissionStatus");
  const tsub = await getTranslations("submit");

  const [{ data: s }, { data: media }, { data: history }] = await Promise.all([
    supabase.from("property_submissions").select("*, profiles(display_name)").eq("id", sid).maybeSingle(),
    supabase.from("property_submission_media").select("storage_path, is_cover, position").eq("submission_id", sid).order("position"),
    supabase.from("submission_status_history").select("previous_status, new_status, actor_role, reason, created_at").eq("submission_id", sid).order("created_at", { ascending: false }).limit(10),
  ]);
  if (!s || s.request_id !== id) notFound();
  const sa = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
  const { data: reqRow } = await supabase
    .from("property_requests").select("transaction_type").eq("id", id).single();
  const offerType = reqRow?.transaction_type === "rent" ? "rental" : "purchase";

  const urls = await Promise.all(
    (media ?? []).map(async (m) => {
      const { data } = await supabase.storage
        .from("property-original-private")
        .createSignedUrl(m.storage_path, 60 * 10);
      return { url: data?.signedUrl ?? null, cover: m.is_cover };
    }),
  );

  const money = (n: unknown, cur = s.currency) =>
    n == null ? null : `${cur} ${Number(n).toLocaleString()}`;

  const commission =
    s.commission_type === "percentage" ? `${Number(s.commission_percentage)}%`
    : s.commission_type === "fixed" ? money(s.commission_amount, s.commission_currency ?? s.currency)
    : s.commission_type === "rental_months" ? `${Number(s.commission_months)} ${t("months")}`
    : null;

  const facts: [string, string | null][] = [
    [t("supplyAgent"), sa?.display_name ?? null],
    [tsub("f.category"), tsub(`categories.${s.property_category}`)],
    [tsub("f.propertyType"), s.property_type],
    [tsub("f.city"), [s.district, s.city, s.state_region].filter(Boolean).join(", ")],
    [tsub("f.buildingName"), s.building_name],
    [tsub("f.askingPrice"), money(s.asking_price)],
    [tsub("f.monthlyRental"), money(s.monthly_rental)],
    [tsub("f.negotiable"), s.negotiable === "yes" ? tsub("f.negYes") : s.negotiable === "no" ? tsub("f.negNo") : tsub("f.negSubject")],
    [tsub("f.builtUp"), s.built_up ? `${Number(s.built_up).toLocaleString()} ${s.measurement_unit}` : null],
    [tsub("f.bedrooms"), s.bedrooms?.toString() ?? null],
    [tsub("f.bathrooms"), s.bathrooms?.toString() ?? null],
    [tsub("f.carParks"), s.car_parks?.toString() ?? null],
    [tsub("f.furnishing"), s.furnishing ? tsub(`furn.${s.furnishing}`) : null],
    [tsub("f.tenure"), s.tenure],
    [tsub("f.completionYear"), s.completion_year?.toString() ?? null],
    [tsub("f.facilities"), s.facilities?.length ? s.facilities.join(", ") : null],
    [t("commission"), commission],
    [tsub("f.commissionConditions"), s.commission_conditions],
  ];

  const reviewable = !["withdrawn", "no_longer_available", "frozen", "archived", "closed"].includes(s.status);

  return (
    <AgentShell wide>
      <Link href={`/requests/${id}`} className="text-sm text-muted hover:text-foreground">
        ← {t("backToRequest")}
      </Link>
      <div className="mt-2 mb-1 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{s.title}</h1>
        <span className="rounded-full bg-surface px-3 py-1 text-sm font-medium whitespace-nowrap">
          {ts(s.status)}
        </span>
      </div>
      <div className="mb-6 flex items-center gap-3">
        <span className="font-mono text-xs text-muted">{s.human_readable_id}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RISK_STYLE[s.risk_indicator] ?? "bg-surface"}`}>
          {t(`risk.${s.risk_indicator}`)}
        </span>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs">
          {tsub(`sources.${s.source_type}`)}
        </span>
      </div>

      {done && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t(`doneNotice.${done}`)}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t(`errors.${error === "reason_required" ? "reason_required" : "save_failed"}`)}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          {urls.length > 0 && (
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {urls.map((u, i) =>
                u.url ? (
                  <div key={i} className={`relative overflow-hidden rounded-xl border border-line ${u.cover ? "col-span-2 row-span-2 sm:col-span-2" : ""}`}>
                    <Image src={u.url} alt="" width={u.cover ? 640 : 320} height={u.cover ? 480 : 240}
                      className="h-full w-full object-cover" unoptimized />
                  </div>
                ) : null,
              )}
            </section>
          )}

          <section className="rounded-xl border border-line p-6">
            <h2 className="mb-4 font-semibold">{t("detailsTitle")}</h2>
            {s.description && <p className="mb-4 text-sm leading-6">{s.description}</p>}
            {s.key_selling_points && (
              <p className="mb-4 rounded-lg bg-surface p-3 text-sm">{s.key_selling_points}</p>
            )}
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {facts.filter(([, v]) => v).map(([label, v]) => (
                <div key={label}>
                  <dt className="text-xs text-muted uppercase">{label}</dt>
                  <dd className="text-sm font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-line p-6">
            <h2 className="mb-4 font-semibold">{t("historyTitle")}</h2>
            <ul className="space-y-2 text-sm">
              {(history ?? []).map((h, i) => (
                <li key={i} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                  <span>
                    <span className="font-medium">{ts(h.new_status)}</span>
                    {h.reason && <span className="text-muted"> — {h.reason}</span>}
                  </span>
                  <span className="text-xs text-muted">{new Date(h.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="h-fit space-y-4">
          {reviewable && (
            <div className="rounded-xl border border-line bg-surface p-6">
              <h2 className="mb-4 font-semibold">{t("decisionTitle")}</h2>
              <form action={reviewSubmission} className="space-y-4">
                <input type="hidden" name="requestId" value={id} />
                <input type="hidden" name="submissionId" value={sid} />
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">{t("rejectReason")}</span>
                  <select name="reason" defaultValue="" className={inputCls}>
                    <option value="">—</option>
                    {REJECT_REASONS.map((r) => (
                      <option key={r} value={t(`rejectReasons.${r}`)}>{t(`rejectReasons.${r}`)}</option>
                    ))}
                  </select>
                </label>
                <div className="space-y-2">
                  <button name="decision" value="shortlisted" type="submit"
                    className="w-full rounded-lg bg-success px-4 py-2.5 font-semibold text-white hover:opacity-90">
                    {t("shortlist")}
                  </button>
                  <button name="decision" value="more_information_required" type="submit"
                    className="w-full rounded-lg border border-warning px-4 py-2.5 font-semibold text-warning hover:bg-warning/10">
                    {t("requestInfo")}
                  </button>
                  <button name="decision" value="rejected" type="submit"
                    className="w-full rounded-lg border border-danger px-4 py-2.5 font-semibold text-danger hover:bg-danger/10">
                    {t("reject")}
                  </button>
                </div>
              </form>
            </div>
          )}
        </aside>
      </div>

      <div className="mt-10">
        <CollabPanels
          submissionId={sid}
          role="ra"
          currency={s.currency}
          offerType={offerType}
        />
      </div>
    </AgentShell>
  );
}
