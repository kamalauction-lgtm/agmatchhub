import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { CommandHeader } from "@/components/ui/command-header";
import { StatCluster } from "@/components/ui/stat-cluster";
import { EnvironmentBadge } from "@/components/ui/environment-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";

/**
 * The supply agent's own submissions (MatchHub 2.0 list). Same query, same
 * rows and the same `supply_agent_id` scope as before; the table becomes
 * cards and the band shows three counts from those rows. Status wording is
 * the existing submissionStatus vocabulary; the groups below are display
 * only and never change a status.
 */

const SHORTLIST = ["shortlisted", "suitable", "approved_for_client"];
const WITH_CLIENT = [
  "shared_with_client", "client_viewed", "client_interested", "client_not_interested",
  "viewing_requested", "viewing_proposed", "viewing_confirmed", "viewing_completed",
  "negotiation", "offer_submitted", "counter_offer", "offer_accepted", "offer_rejected",
  "transaction_in_progress",
];
const ENDED = ["rejected", "withdrawn", "no_longer_available", "expired", "frozen", "archived", "closed"];

function toneFor(status: string): BadgeTone {
  if (status === "closed" || status === "offer_accepted") return "success";
  if (SHORTLIST.includes(status) || WITH_CLIENT.includes(status)) return "info";
  if (status === "more_information_required" || status === "declaration_pending" || status === "verification_pending") return "warning";
  if (ENDED.includes(status)) return "neutral";
  return "neutral";
}

export default async function MySubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const user = await requireUser();
  const { submitted } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("submissions");
  const ts = await getTranslations("submissionStatus");
  const tc = await getTranslations("common");

  const { data: rows } = await supabase
    .from("property_submissions")
    .select("id, human_readable_id, title, city, status, asking_price, monthly_rental, currency, created_at, property_requests(human_readable_id, title)")
    .eq("supply_agent_id", user.id)
    .order("created_at", { ascending: false });

  const all = rows ?? [];
  const count = (keys: string[]) => all.filter((s) => keys.includes(s.status)).length;

  return (
    <AgentShell wide>
      <CommandHeader className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="command-muted mt-1 text-sm">{t("intro")}</p>
        </div>
        <StatCluster
          items={[
            { value: all.length, label: t("band.submitted") },
            { value: count(SHORTLIST), label: t("band.shortlisted") },
            { value: count(WITH_CLIENT), label: t("band.withClient") },
          ]}
        />
      </CommandHeader>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <EnvironmentBadge label={tc("environment.staging")} />
        <Link href="/wanted" className={`${buttonClass("secondary", "min-h-10")} ml-auto`}>
          {t("openWanted")}
        </Link>
      </div>

      {submitted && (
        <p className="mb-6 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success-ink">
          {t("submittedNotice", { id: submitted })}
        </p>
      )}

      {!all.length ? (
        <EmptyState
          icon="✦"
          title={t("empty")}
          action={<Link href="/wanted" className={buttonClass("primary")}>{t("openWanted")}</Link>}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {all.map((s) => {
            const req = Array.isArray(s.property_requests) ? s.property_requests[0] : s.property_requests;
            const price = s.asking_price ?? s.monthly_rental;
            return (
              <li key={s.id} className="min-w-0">
                <Link
                  href={`/submissions/${s.id}`}
                  className="block rounded-2xl border border-line bg-card p-4 shadow-card transition-colors duration-150 hover:border-blue sm:p-5"
                >
                  <div className="flex items-end justify-between gap-3 rounded-xl bg-gradient-to-br from-blue-soft via-surface to-indigo-soft p-4">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] text-muted">
                        {s.human_readable_id}
                        {req?.human_readable_id ? ` → ${req.human_readable_id}` : ""}
                      </p>
                      <p className="mt-1 text-lg font-bold tracking-tight text-foreground">
                        {price != null ? `${s.currency} ${Number(price).toLocaleString()}` : "—"}
                      </p>
                    </div>
                    <Badge tone={toneFor(s.status)} className="shrink-0">{ts(s.status as never)}</Badge>
                  </div>
                  <h3 className="mt-3 font-semibold leading-snug">{s.title}</h3>
                  <p className="mt-0.5 text-sm text-muted">
                    {s.city}
                    {req?.title ? ` · ${t("forRequest")} ${req.title}` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AgentShell>
  );
}
