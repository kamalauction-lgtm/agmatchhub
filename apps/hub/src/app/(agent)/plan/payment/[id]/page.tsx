import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { formatMoney } from "@/lib/entitlements";
import { cancelPayment } from "../../actions";

/**
 * Where the gateway sends the agent back. It shows what the DATABASE knows —
 * the webhook may land a few seconds after the redirect, so "still pending"
 * is an honest state with a refresh link, not a failure. RLS limits the row
 * to its owner.
 */
export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const t = await getTranslations("plan.payment");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("payment_intents")
    .select("id, human_readable_id, kind, status, amount, currency, mode, provider_key, checkout_url, failure_reason, paid_at, created_at, cadence, pack_key, plan_versions(plans(product_name, name)), credit_packs(name, credits, kind)")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const plan = (p.plan_versions as unknown as { plans: { product_name: string | null; name: string } } | null)?.plans;
  const pack = p.credit_packs as unknown as { name: string; credits: number; kind: string } | null;
  const what = p.kind === "subscription" ? `${plan?.product_name ?? plan?.name ?? "—"} · ${t(`cadence.${p.cadence}` as never)}` : pack?.name ?? "—";
  const tone = p.status === "paid" ? "bg-success/10 text-success" : ["failed", "expired", "cancelled"].includes(p.status) ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning";
  const open = p.status === "created" || p.status === "pending";

  return (
    <AgentShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{p.human_readable_id}{p.mode === "sandbox" ? ` · ${t("sandbox")}` : ""}</p>

      <section className="rounded-xl border border-line bg-card p-6">
        <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${tone}`}>{t(`status.${p.status}` as never)}</span>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><dt className="text-xs uppercase tracking-wide text-muted">{t("what")}</dt><dd className="font-medium">{what}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-muted">{t("amount")}</dt><dd className="font-medium tabular-nums">{formatMoney(p.amount, p.currency, locale)}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-muted">{t("provider")}</dt><dd className="font-medium capitalize">{p.provider_key}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-muted">{t("when")}</dt><dd className="font-medium">{new Date(p.paid_at ?? p.created_at).toLocaleString(locale)}</dd></div>
        </dl>
        {p.status === "pending" && <p className="mt-4 text-sm text-muted">{t("pendingHint")}</p>}
        {p.status === "paid" && <p className="mt-4 text-sm">{p.kind === "subscription" ? t("paidPlan") : t("paidCredits", { n: pack?.credits ?? 0 })}</p>}
        {p.failure_reason && !open && p.status !== "paid" && <p className="mt-4 text-xs text-muted">{t("reason")}: {p.failure_reason}</p>}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/plan" className="min-h-10 rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-crimson hover:text-crimson">{t("backToPlan")}</Link>
          {open && p.checkout_url && (
            <a href={p.checkout_url} className="min-h-10 rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white">{t("continuePayment")}</a>
          )}
          {p.status === "pending" && (
            <Link href={`/plan/payment/${p.id}`} className="min-h-10 rounded-lg border border-line px-4 py-2 text-sm font-semibold">{t("refresh")}</Link>
          )}
          {open && (
            <form action={cancelPayment}>
              <input type="hidden" name="intentId" value={p.id} />
              <button type="submit" className="min-h-10 cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-muted hover:text-danger">{t("cancel")}</button>
            </form>
          )}
        </div>
      </section>
    </AgentShell>
  );
}
