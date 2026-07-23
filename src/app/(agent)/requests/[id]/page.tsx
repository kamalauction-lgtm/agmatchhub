import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { ClearFormDraft } from "@/components/forms/draft-guard";

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { id } = await params;
  const { submitted } = await searchParams;
  await requireUser();
  const supabase = await createClient();
  const t = await getTranslations("requests");

  const [{ data: r }, { data: link }, { data: submissions }, { data: presentation }] = await Promise.all([
    supabase.from("property_requests").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("request_links")
      .select("id, token, password, active, expires_at, access_count")
      .eq("request_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("property_submissions")
      .select("id, human_readable_id, title, city, asking_price, monthly_rental, currency, status, risk_indicator, created_at")
      .eq("request_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("client_presentations")
      .select("id, human_readable_id, token, password, active, expires_at, view_count")
      .eq("request_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!r) notFound();

  const { data: feedback } = presentation
    ? await supabase
        .from("client_feedback")
        .select("kind, rank_value, message, offer_amount, preferred_date, created_at, client_presentation_properties(submission_id)")
        .eq("presentation_id", presentation.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: null };
  const tp = await getTranslations("presentation");
  const ts = await getTranslations("submissionStatus");
  const trv = await getTranslations("review");

  const editable = !["cancelled", "archived", "frozen", "successfully_closed"].includes(r.status);
  const { data: editLog } = await supabase
    .from("request_edit_log")
    .select("changes, created_at, profiles(display_name)")
    .eq("request_id", id)
    .order("created_at", { ascending: false })
    .limit(10);
  const base = process.env.REQUEST_LINK_BASE_URL ?? "";
  const shareUrl = link ? `${base}/${link.token}` : null;
  const qr = shareUrl ? await QRCode.toDataURL(shareUrl, { width: 220, margin: 1 }) : null;

  const money = (n: unknown) =>
    n == null ? null : `${r.currency} ${Number(n).toLocaleString()}`;

  const facts: [string, string | null][] = [
    [t("form.transactionType"), t(`transaction.${r.transaction_type}`)],
    [t("form.propertyCategory"), t(`form.categories.${r.property_category}`)],
    [t("form.city"), [r.district, r.city, r.state_region].filter(Boolean).join(", ")],
    [t("form.preferredAreas"), r.preferred_areas?.length ? r.preferred_areas.join(", ") : null],
    [t("form.budgetMin"), money(r.budget_min)],
    [t("form.budgetMax"), money(r.budget_max)],
    [t("form.maxRent"), r.max_monthly_rent == null ? null
      : `${money(r.max_monthly_rent)} / ${t(`form.periods.${r.rent_period ?? "monthly"}`)}`],
    [t("form.propertyType"), r.property_type],
    [t("form.bedroomsMin"), r.bedrooms_min?.toString() ?? null],
    [t("form.minBuiltUp"), r.min_built_up ? `${Number(r.min_built_up).toLocaleString()} ${r.measurement_unit}` : null],
    [t("form.submissionDeadline"), r.submission_deadline],
    [t("form.expiryDate"), r.expiry_date],
  ];

  return (
    <AgentShell wide>
      <ClearFormDraft storageKeys={["draft:req:new", `draft:req:${id}`]} />
      <Link href="/requests" className="text-sm text-muted hover:text-foreground">
        ← {t("title")}
      </Link>
      <div className="mt-2 mb-1 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{r.title}</h1>
        <span className="rounded-full bg-surface px-3 py-1 text-sm font-medium whitespace-nowrap">
          {t(`status.${r.status}`)}
        </span>
      </div>
      <p className="mb-6 font-mono text-xs text-muted">{r.human_readable_id}</p>

      {submitted && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t("submittedNotice")}
        </p>
      )}
      {r.status === "amendment_required" && r.amendment_reason && (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <span className="font-semibold">{t("amendmentRequired")}: </span>
          {r.amendment_reason}
        </div>
      )}

      {(submissions?.length ?? 0) > 0 && (
        <section className="mb-8 rounded-xl border border-line p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">
              {t("submissionsTitle")} ({submissions!.length})
            </h2>
            {submissions!.some((s) => ["shortlisted", "suitable", "approved_for_client"].includes(s.status)) && (
              <Link href={`/requests/${id}/presentation`}
                className="rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong">
                {tp("createCta")}
              </Link>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted uppercase">
                <tr>
                  <th className="py-2 pr-4">ID</th>
                  <th className="py-2 pr-4">{t("cols.title")}</th>
                  <th className="py-2 pr-4">{t("form.askingPrice")}</th>
                  <th className="py-2 pr-4">{trv("riskLabel")}</th>
                  <th className="py-2 pr-4">{t("cols.status")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {submissions!.map((s) => {
                  const price = s.asking_price ?? s.monthly_rental;
                  return (
                    <tr key={s.id} className="border-t border-line">
                      <td className="py-2.5 pr-4 font-mono text-xs">{s.human_readable_id}</td>
                      <td className="py-2.5 pr-4 font-medium">{s.title}</td>
                      <td className="py-2.5 pr-4">
                        {price != null ? `${s.currency} ${Number(price).toLocaleString()}` : "—"}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded-full bg-surface px-2 py-0.5 text-xs">
                          {trv(`risk.${s.risk_indicator}`)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium">
                          {ts(s.status)}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <Link href={`/requests/${id}/s/${s.id}`} className="font-medium text-crimson hover:underline">
                          {trv("open")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-line p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">{t("detailTitle")}</h2>
            {editable && (
              <Link href={`/requests/${id}/edit`} className="text-sm font-medium text-crimson hover:underline">
                {t("edit")}
              </Link>
            )}
          </div>
          {r.description && <p className="mb-4 text-sm text-muted">{r.description}</p>}
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {facts.filter(([, val]) => val).map(([label, val]) => (
              <div key={label}>
                <dt className="text-xs text-muted uppercase">{label}</dt>
                <dd className="text-sm font-medium">{val}</dd>
              </div>
            ))}
          </dl>
          {r.client_profile_anonymised && (
            <div className="mt-4 rounded-lg bg-surface p-4 text-sm">
              <span className="font-medium">{t("form.clientProfile")}: </span>
              {r.client_profile_anonymised}
            </div>
          )}

          {!!editLog?.length && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-muted">
                {t("editLog.title")} ({editLog.length})
              </summary>
              <ul className="mt-3 space-y-3">
                {editLog.map((e, i) => {
                  const who = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles;
                  const entries = Object.entries(
                    (e.changes ?? {}) as Record<string, { from: string; to: string }>,
                  );
                  return (
                    <li key={i} className="rounded-lg bg-surface p-3 text-xs">
                      <p className="mb-1.5 font-medium">
                        {who?.display_name} · {new Date(e.created_at).toLocaleString()}
                      </p>
                      <ul className="space-y-1">
                        {entries.map(([fieldName, c]) => (
                          <li key={fieldName} className="text-muted">
                            <span className="font-medium text-foreground capitalize">
                              {fieldName.replaceAll("_", " ")}
                            </span>
                            : <s>{c.from || "—"}</s> → {c.to || "—"}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </section>

        <aside className="h-fit space-y-4">
          {link && shareUrl ? (
            <div className="rounded-xl border border-line bg-surface p-6">
              <h2 className="mb-3 font-semibold">{t("link.title")}</h2>
              <p className="mb-1 text-xs text-muted uppercase">{t("link.url")}</p>
              <p className="mb-3 rounded-lg bg-background p-2 font-mono text-xs break-all select-all">
                {shareUrl}
              </p>
              <p className="mb-1 text-xs text-muted uppercase">{t("link.password")}</p>
              <p className="mb-3 rounded-lg bg-background p-2 text-center font-mono text-lg font-bold tracking-widest select-all">
                {link.password}
              </p>
              {qr && (
                <div className="mb-3 flex justify-center rounded-lg bg-white p-3">
                  <Image src={qr} alt="QR code" width={180} height={180} unoptimized />
                </div>
              )}
              <p className="text-xs text-muted">
                {t("link.expires")}: {new Date(link.expires_at).toLocaleDateString()} ·{" "}
                {t("link.visits")}: {link.access_count}
                {!link.active && <span className="ml-1 font-semibold text-danger">({t("link.disabled")})</span>}
              </p>
              <p className="mt-3 text-xs leading-5 text-muted">{t("link.shareHint")}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">
              {t("link.pending")}
            </div>
          )}

          {presentation && (
            <div className="rounded-xl border border-crimson/30 bg-crimson-soft/30 p-6">
              <h2 className="mb-1 font-semibold">{tp("panel.title")}</h2>
              <p className="mb-3 font-mono text-xs text-muted">{presentation.human_readable_id}</p>
              <p className="mb-1 text-xs text-muted uppercase">{tp("panel.url")}</p>
              <p className="mb-3 rounded-lg bg-background p-2 font-mono text-xs break-all select-all">
                {`${process.env.CLIENT_PRESENTATION_BASE_URL ?? ""}/${presentation.token}`}
              </p>
              <p className="mb-1 text-xs text-muted uppercase">{tp("panel.code")}</p>
              <p className="mb-3 rounded-lg bg-background p-2 text-center font-mono text-lg font-bold tracking-widest select-all">
                {presentation.password}
              </p>
              <p className="text-xs text-muted">
                {tp("panel.expires")}: {new Date(presentation.expires_at).toLocaleDateString()} ·{" "}
                {tp("panel.views")}: {presentation.view_count}
              </p>
            </div>
          )}

          {(feedback?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-line bg-surface p-6">
              <h2 className="mb-3 font-semibold">{tp("feedback.title")} ({feedback!.length})</h2>
              <ul className="space-y-2 text-sm">
                {feedback!.map((f, i) => (
                  <li key={i} className="rounded-lg bg-background px-3 py-2">
                    <span className="font-medium">{tp(`feedback.kinds.${f.kind}`)}</span>
                    {f.rank_value && <span> · {tp(`feedback.ranks.${f.rank_value}`)}</span>}
                    {f.offer_amount != null && (
                      <span> · {r.currency} {Number(f.offer_amount).toLocaleString()}</span>
                    )}
                    {f.preferred_date && <span> · {f.preferred_date}</span>}
                    {f.message && <p className="mt-1 text-xs text-muted">{f.message}</p>}
                    <p className="mt-1 text-[10px] text-muted">
                      {new Date(f.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </AgentShell>
  );
}
