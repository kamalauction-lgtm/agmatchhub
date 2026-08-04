import { getTranslations, getFormatter } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { markLeadResponded, updateLeadStatus } from "./actions";

/**
 * The agent's lead inbox — marketplace inquiries land here (§28 steps 11–16).
 *
 * RLS does the scoping: leads are readable only by the assigned agent, and the
 * buyer's contact row is reachable only through such a lead. This page adds no
 * filtering of its own beyond ordering.
 */

const STATUSES = [
  "new",
  "contact_attempted",
  "contacted",
  "qualified",
  "property_matched",
  "viewing_proposed",
  "viewing_confirmed",
  "viewed",
  "negotiating",
  "booking",
  "financing",
  "closed_won",
  "closed_lost",
  "nurture",
  "spam",
] as const;

/**
 * Data layer, outside the component: the React Compiler (rightly) refuses
 * impure calls like Date.now() during render, and SLA state is a fact about
 * the data, not about presentation. Each row is annotated once per request.
 */
async function getLeads(): Promise<LeadRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select(
      `id, human_readable_id, status, message, inquiry_type, locale,
       first_response_due, first_responded_at, created_at,
       contacts (full_name, phone, email),
       listings (title, slug)`
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const now = Date.now();
  return ((data ?? []) as unknown as Omit<LeadRow, "isOverdue">[]).map((l) => ({
    ...l,
    isOverdue:
      !l.first_responded_at &&
      !!l.first_response_due &&
      Date.parse(l.first_response_due) < now,
  }));
}

type LeadRow = {
  isOverdue: boolean;
  id: string;
  human_readable_id: string;
  status: string;
  message: string | null;
  inquiry_type: string;
  locale: string;
  first_response_due: string | null;
  first_responded_at: string | null;
  created_at: string;
  contacts: {
    full_name: string;
    phone: string;
    email: string | null;
  } | null;
  listings: {
    title: string;
    slug: string;
  } | null;
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; error?: string }>;
}) {
  await requireUser();
  const { updated, error } = await searchParams;
  const t = await getTranslations("leads");
  const ts = await getTranslations("leadStatus");
  const format = await getFormatter();

  const rows = await getLeads();
  const open = rows.filter((l) => !["closed_won", "closed_lost", "spam"].includes(l.status));
  const overdue = open.filter((l) => l.isOverdue);

  return (
    <AgentShell wide>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted">
          {t("summary", { open: open.length, overdue: overdue.length })}
        </p>
      </div>

      {updated && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t("updated")}
        </p>
      )}
      {error && (
        <p className="mb-6 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {t(`errors.${error}` as never)}
        </p>
      )}

      {!rows.length ? (
        <p className="rounded-xl border border-line bg-surface p-10 text-center text-sm text-muted">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((lead) => {
            const isOverdue = lead.isOverdue;
            const waPhone = lead.contacts?.phone.replace(/^\+/, "");
            const waText = encodeURIComponent(
              t("waGreeting", {
                name: lead.contacts?.full_name ?? "",
                listing: lead.listings?.title ?? "",
              })
            );

            return (
              <article
                key={lead.id}
                className={`rounded-xl border bg-background p-4 sm:p-5 ${
                  isOverdue ? "border-danger/50" : "border-line"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted">
                        {lead.human_readable_id}
                      </span>
                      <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium">
                        {ts(lead.status as never)}
                      </span>
                      {isOverdue && (
                        <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                          {t("slaOverdue")}
                        </span>
                      )}
                      {!lead.first_responded_at && !isOverdue && (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                          {t("slaWaiting")}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-base font-semibold">
                      {lead.contacts?.full_name ?? "—"}
                      <span className="ml-2 font-normal text-muted">{lead.contacts?.phone}</span>
                    </p>

                    <p className="mt-0.5 text-sm text-muted">
                      {t(`types.${lead.inquiry_type}` as never)} ·{" "}
                      {lead.listings?.title ?? "—"} ·{" "}
                      {format.relativeTime(new Date(lead.created_at))}
                    </p>

                    {lead.message && (
                      <blockquote className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm">
                        {lead.message}
                      </blockquote>
                    )}
                  </div>

                  <div className="flex w-full shrink-0 flex-col gap-2 sm:w-56">
                    {/* WhatsApp only, never SMS — house rule. */}
                    {waPhone && (
                      <a
                        href={`https://wa.me/${waPhone}?text=${waText}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-success px-4 py-2.5 text-center text-sm font-semibold text-white hover:opacity-90"
                      >
                        {t("openWhatsApp")}
                      </a>
                    )}

                    {!lead.first_responded_at && (
                      <form action={markLeadResponded}>
                        <input type="hidden" name="leadId" value={lead.id} />
                        <button
                          type="submit"
                          className="w-full rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface"
                        >
                          {t("markResponded")}
                        </button>
                      </form>
                    )}

                    <form action={updateLeadStatus} className="flex gap-2">
                      <input type="hidden" name="leadId" value={lead.id} />
                      <select
                        name="status"
                        defaultValue={lead.status}
                        aria-label={t("statusLabel")}
                        className="min-w-0 flex-1 rounded-lg border border-line bg-background px-2 py-2 text-sm"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {ts(s as never)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface"
                      >
                        {t("setStatus")}
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AgentShell>
  );
}
