import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { getActiveDeclaration } from "@/lib/consents";
import { createPresentation } from "./actions";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

const SELECTABLE = ["shortlisted", "suitable", "approved_for_client"];

export default async function PresentationBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const t = await getTranslations("presentation");
  const ts = await getTranslations("submissionStatus");

  const [{ data: request }, { data: subs }, declaration] = await Promise.all([
    supabase
      .from("property_requests")
      .select("id, title, human_readable_id, requesting_agent_id")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("property_submissions")
      .select("id, human_readable_id, title, city, asking_price, monthly_rental, currency, status")
      .eq("request_id", id)
      .in("status", SELECTABLE)
      .order("created_at"),
    getActiveDeclaration("requesting_agent_presentation", await getLocale()),
  ]);
  if (!request || request.requesting_agent_id !== user.id) notFound();
  if (!subs?.length) redirect(`/requests/${id}?noSelectable=1`);

  return (
    <AgentShell>
      <Link href={`/requests/${id}`} className="text-sm text-muted hover:text-foreground">
        ← {request.title}
      </Link>
      <h1 className="mt-2 mb-2 text-2xl font-semibold">{t("builderTitle")}</h1>
      <p className="mb-6 text-sm text-muted">{t("builderIntro")}</p>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t(`errors.${["declaration_required", "invalid_fields", "save_failed"].includes(error) ? error : "save_failed"}`)}
        </p>
      )}

      <form action={createPresentation} className="space-y-6">
        <input type="hidden" name="requestId" value={id} />

        <section className="space-y-4 rounded-xl border border-line p-5">
          <h2 className="font-semibold">{t("sectionDetails")}</h2>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("title")}</span>
            <input name="title" required minLength={3} defaultValue={request.title} className={inputCls} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("clientName")}</span>
              <input name="clientDisplayName" placeholder={t("clientNameHint")} className={inputCls} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("expiry")}</span>
              <select name="expiresInDays" defaultValue="30" className={inputCls}>
                {["7", "14", "30", "60"].map((v) => (
                  <option key={v} value={v}>{t("expiryDays", { days: v })}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("intro")}</span>
            <textarea name="introMessage" rows={3} placeholder={t("introHint")} className={inputCls} />
          </label>
        </section>

        <section className="space-y-3 rounded-xl border border-line p-5">
          <h2 className="font-semibold">{t("sectionProperties")}</h2>
          <p className="text-xs text-muted">{t("propertiesHint")}</p>
          {subs.map((s) => {
            const price = s.asking_price ?? s.monthly_rental;
            return (
              <div key={s.id} className="rounded-lg border border-line p-4">
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" name="submissionIds" value={s.id} defaultChecked
                    className="mt-0.5 h-4 w-4 accent-crimson" />
                  <span className="flex-1">
                    <span className="font-medium">{s.title}</span>
                    <span className="ml-2 text-xs text-muted">
                      {s.city} · {price != null ? `${s.currency} ${Number(price).toLocaleString()}` : "—"} · {ts(s.status)}
                    </span>
                  </span>
                </label>
                <input name={`note_${s.id}`} placeholder={t("noteHint")}
                  className={`${inputCls} mt-3`} maxLength={500} />
              </div>
            );
          })}
        </section>

        <section className="space-y-3 rounded-xl border border-crimson/30 bg-crimson-soft/40 p-5">
          <h2 className="font-semibold">{t("declarationTitle")}</h2>
          <p className="text-xs whitespace-pre-line text-muted">{declaration?.body}</p>
          <label className="flex items-start gap-3 text-sm font-medium">
            <input type="checkbox" name="declarationAccepted" required
              className="mt-0.5 h-4 w-4 accent-crimson" />
            {t("declarationAccept")}
          </label>
        </section>

        <button type="submit"
          className="w-full rounded-lg bg-crimson px-5 py-3 font-semibold text-white hover:bg-crimson-strong">
          {t("create")}
        </button>
      </form>
    </AgentShell>
  );
}
