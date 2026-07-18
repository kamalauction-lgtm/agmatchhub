import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/authz";
import { reviewRequest } from "../actions";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

export default async function AdminRequestDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { done, error } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("adminRequests");
  const tr = await getTranslations("requests");

  const [{ data: r }, { data: link }, { data: priv }] = await Promise.all([
    supabase
      .from("property_requests")
      .select("*, profiles(display_name)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("request_links")
      .select("token, password, active, expires_at, access_count")
      .eq("request_id", id)
      .maybeSingle(),
    supabase
      .from("property_request_private")
      .select("internal_notes, admin_notes")
      .eq("request_id", id)
      .maybeSingle(),
  ]);
  if (!r) notFound();
  const ra = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;

  const reviewable = ["pending_admin_approval", "resubmitted", "under_admin_review"].includes(r.status);
  const money = (n: unknown) => (n == null ? null : `${r.currency} ${Number(n).toLocaleString()}`);

  const facts: [string, string | null][] = [
    [t("cols.agent"), ra?.display_name ?? null],
    [tr("form.transactionType"), tr(`transaction.${r.transaction_type}`)],
    [tr("form.propertyCategory"), tr(`form.categories.${r.property_category}`)],
    [tr("form.priority"), tr(`form.priorities.${r.priority}`)],
    [tr("form.city"), [r.district, r.city, r.state_region, r.country_code].filter(Boolean).join(", ")],
    [tr("form.preferredAreas"), r.preferred_areas?.length ? r.preferred_areas.join(", ") : null],
    [tr("form.budgetMin"), money(r.budget_min)],
    [tr("form.budgetMax"), money(r.budget_max)],
    [tr("form.maxMonthlyRent"), money(r.max_monthly_rent)],
    [tr("form.propertyType"), r.property_type],
    [tr("form.minBuiltUp"), r.min_built_up ? `${Number(r.min_built_up).toLocaleString()} ${r.measurement_unit}` : null],
    [tr("form.submissionDeadline"), r.submission_deadline],
    [tr("form.expiryDate"), r.expiry_date],
    [tr("form.clientProfile"), r.client_profile_anonymised],
    [tr("form.internalNotes"), priv?.internal_notes ?? null],
  ];

  return (
    <div>
      <Link href="/admin/requests" className="text-sm text-muted hover:text-foreground">
        ← {t("title")}
      </Link>
      <div className="mt-2 mb-1 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{r.title}</h1>
        <span className="rounded-full bg-surface px-3 py-1 text-sm font-medium whitespace-nowrap">
          {tr(`status.${r.status}`)}
        </span>
      </div>
      <p className="mb-6 font-mono text-xs text-muted">{r.human_readable_id}</p>

      {done && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t(`doneNotice.${done}`)}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t(`errors.${["notes_required", "wrong_status"].includes(error) ? error : "save_failed"}`)}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-line p-6">
          <h2 className="mb-4 font-semibold">{t("detailTitle")}</h2>
          {r.description && <p className="mb-4 text-sm text-muted">{r.description}</p>}
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {facts.filter(([, v]) => v).map(([label, v]) => (
              <div key={label}>
                <dt className="text-xs text-muted uppercase">{label}</dt>
                <dd className="text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <aside className="h-fit space-y-4">
          {reviewable ? (
            <div className="rounded-xl border border-line bg-surface p-6">
              <h2 className="mb-4 font-semibold">{t("decision.title")}</h2>
              <form action={reviewRequest} className="space-y-4">
                <input type="hidden" name="requestId" value={id} />
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">{t("decision.notes")}</span>
                  <textarea name="notes" rows={3} className={inputCls} placeholder={t("decision.notesHint")} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">{t("decision.expiryDays")}</span>
                  <input type="number" name="expiryDays" min={1} max={365} defaultValue={30} className={inputCls} />
                </label>
                <div className="space-y-2">
                  <button name="decision" value="approve" type="submit"
                    className="w-full rounded-lg bg-success px-4 py-2.5 font-semibold text-white hover:opacity-90">
                    {t("decision.approve")}
                  </button>
                  <button name="decision" value="amendment" type="submit"
                    className="w-full rounded-lg border border-warning px-4 py-2.5 font-semibold text-warning hover:bg-warning/10">
                    {t("decision.amendment")}
                  </button>
                  <button name="decision" value="cancel" type="submit"
                    className="w-full rounded-lg border border-danger px-4 py-2.5 font-semibold text-danger hover:bg-danger/10">
                    {t("decision.cancel")}
                  </button>
                </div>
              </form>
            </div>
          ) : link ? (
            <div className="rounded-xl border border-line bg-surface p-6 text-sm">
              <h2 className="mb-3 font-semibold">{tr("link.title")}</h2>
              <p className="mb-2 font-mono text-xs break-all">{(process.env.REQUEST_LINK_BASE_URL ?? "") + "/" + link.token}</p>
              <p className="mb-2">{tr("link.password")}: <span className="font-mono font-bold">{link.password}</span></p>
              <p className="text-xs text-muted">
                {tr("link.expires")}: {new Date(link.expires_at).toLocaleDateString()} ·{" "}
                {tr("link.visits")}: {link.access_count}
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
