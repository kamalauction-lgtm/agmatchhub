import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";

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

  const [{ data: r }, { data: link }] = await Promise.all([
    supabase.from("property_requests").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("request_links")
      .select("id, token, password, active, expires_at, access_count")
      .eq("request_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!r) notFound();

  const editable = ["draft", "amendment_required"].includes(r.status);
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
    [t("form.maxMonthlyRent"), money(r.max_monthly_rent)],
    [t("form.propertyType"), r.property_type],
    [t("form.bedroomsMin"), r.bedrooms_min?.toString() ?? null],
    [t("form.minBuiltUp"), r.min_built_up ? `${Number(r.min_built_up).toLocaleString()} ${r.measurement_unit}` : null],
    [t("form.submissionDeadline"), r.submission_deadline],
    [t("form.expiryDate"), r.expiry_date],
  ];

  return (
    <AgentShell wide>
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
        </aside>
      </div>
    </AgentShell>
  );
}
