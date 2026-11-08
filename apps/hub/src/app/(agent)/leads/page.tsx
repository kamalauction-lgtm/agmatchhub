import Link from "next/link";
import { getTranslations, getFormatter } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { markLeadResponded, updateLeadStatus } from "./actions";
import { draftLeadReply, sendLeadEmail, qualifyLead, findLeadMatches, type LeadIntel } from "./ai-actions";
import { ReplyPanel, type PlatformWhatsapp } from "@/components/leads/reply-panel";
import { sendLeadWhatsapp, sendLeadWhatsappTemplate } from "./whatsapp-actions";
import { IntelPanel } from "@/components/leads/intel-panel";
import { aiQuotaFor } from "@/lib/ai/engine";
import { getCompanions } from "@/lib/ai/cast";

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
  searchParams: Promise<{ updated?: string; error?: string; sort?: string }>;
}) {
  const user = await requireUser();
  const { updated, error, sort } = await searchParams;
  const t = await getTranslations("leads");
  const tsec = await getTranslations("leads.secretary");
  const quota = await aiQuotaFor(user.id);
  const cast = await getCompanions(["reply_drafter", "email_composer", "lead_qualifier", "alternative_finder"]);
  const REASONS = ["quota", "daily_cap", "platform_cap", "circuit_open", "disabled", "feature_off", "unverified", "no_provider", "failed"];
  const replyLabels = {
    draftWhatsapp: tsec("draftWhatsapp"),
    draftEmail: tsec("draftEmail"),
    working: tsec("working"),
    sourceAi: tsec.raw("sourceAi") as string,
    sourceRules: tsec("sourceRules"),
    reasons: Object.fromEntries(REASONS.map((r) => [r, tsec(`reason.${r}` as never)])),
    nextStep: tsec("nextStep"),
    questions: tsec("questions"),
    openWhatsapp: tsec("openWhatsapp"),
    sendEmail: tsec("sendEmail"),
    subject: tsec("subject"),
    noEmail: tsec("noEmail"),
    copy: tsec("copy"),
    copied: tsec("copied"),
    quota: tsec.raw("quota") as string,
    platform: {
      send: tsec("platform.send"), testMode: tsec("platform.testMode"), windowClosed: tsec("platform.windowClosed"),
      useTemplate: tsec("platform.useTemplate"), sendTemplate: tsec("platform.sendTemplate"), variable: tsec.raw("platform.variable") as string,
      reasons: Object.fromEntries(["opted_out", "no_phone", "not_test_recipient", "no_account", "feature_off"].map((r) => [r, tsec(`platform.reason.${r}` as never)])),
    },
  };
  const ti = await getTranslations("leads.intel");
  const intelLabels = {
    qualify: ti("qualify"), requalify: ti("requalify"), working: ti("working"), intent: ti("intent"),
    sourceAi: ti.raw("sourceAi") as string, sourceRules: ti("sourceRules"),
    reasons: Object.fromEntries(REASONS.map((r) => [r, tsec(`reason.${r}` as never)])),
    action: ti("action"), findMatches: ti("findMatches"), finding: ti("finding"), matchesTitle: ti("matchesTitle"),
    noMatches: ti("noMatches"), own: ti("own"), pool: ti("pool"), openListing: ti("openListing"),
    why: Object.fromEntries(["same_area", "same_type", "same_category", "similar_price", "cheaper", "pricier", "similar_size"].map((k) => [k, ti(`why.${k}` as never)])),
  };
  const marketplaceUrl = process.env.NEXT_PUBLIC_MARKETPLACE_URL ?? "https://www.propertiguru.id";
  const ts = await getTranslations("leadStatus");
  const format = await getFormatter();

  const rowsRaw = await getLeads();
  const supabase = await createClient();
  const [{ data: intelRows }, { data: radarRows }] = await Promise.all([
    supabase.from("lead_intelligence").select("lead_id, intent, reason, signals, suggested_action, source, model"),
    supabase.rpc("lead_radar"),
  ]);
  const intelOf = new Map(
    ((intelRows ?? []) as { lead_id: string; intent: number; reason: string; signals: string[]; suggested_action: string | null; source: "ai" | "rules"; model: string | null }[])
      .map((r) => [r.lead_id, { intent: r.intent, reason: r.reason, signals: r.signals ?? [], suggestedAction: r.suggested_action, source: r.source, model: r.model } as LeadIntel]),
  );
  const radarOf = new Map(((radarRows ?? []) as { lead_id: string; duplicate_count: number; hours_silent: number; is_cold: boolean }[]).map((r) => [r.lead_id, r]));

  /* The platform WhatsApp number (E12): one flag read, then one rule check per
   * open lead — the same wa_send_check() the send action runs, so the door the
   * panel shows is the door that will open. Off = no extra queries at all. */
  const platformOf = new Map<string, PlatformWhatsapp>();
  const { data: waOn } = await supabase.rpc("is_feature_enabled", { p_key: "whatsapp_cloud", p_user: user.id });
  if (waOn === true) {
    const [{ data: me }, { data: templates }] = await Promise.all([
      supabase.from("profiles").select("country_code").eq("id", user.id).maybeSingle(),
      supabase.from("wa_templates").select("id, name, language, body, variables, wa_accounts!inner(country_code, mode)").eq("status", "approved"),
    ]);
    const { data: acct } = me?.country_code
      ? await supabase.from("wa_accounts").select("mode").eq("country_code", me.country_code).neq("mode", "off").maybeSingle()
      : { data: null };
    if (acct) {
      const mine = ((templates ?? []) as unknown as { id: string; name: string; language: string; body: string; variables: number; wa_accounts: { country_code: string } }[])
        .filter((t) => t.wa_accounts.country_code === me!.country_code)
        .map(({ id, name, language, body, variables }) => ({ id, name, language, body, variables }));
      const openLeads = rowsRaw.filter((l) => !["closed_won", "closed_lost", "spam"].includes(l.status));
      const checks = await Promise.all(openLeads.map((l) => supabase.rpc("wa_send_check", { p_lead: l.id, p_kind: "session", p_template: null })));
      openLeads.forEach((l, i) => platformOf.set(l.id, { session: String(checks[i].data ?? "check_failed"), mode: acct.mode === "live" ? "live" : "test", templates: mine }));
    }
  }
  // Intent SORTS; it never filters. Default order stays newest-first.
  const rows = sort === "intent"
    ? [...rowsRaw].sort((a, b) => (intelOf.get(b.id)?.intent ?? 0) - (intelOf.get(a.id)?.intent ?? 0))
    : rowsRaw;
  const open = rows.filter((l) => !["closed_won", "closed_lost", "spam"].includes(l.status));
  const overdue = open.filter((l) => l.isOverdue);

  return (
    <AgentShell wide>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex items-center gap-3 text-sm text-muted">
          <p>{t("summary", { open: open.length, overdue: overdue.length })}</p>
          <nav className="flex rounded-lg bg-surface p-0.5 text-xs font-semibold" aria-label={ti("sortLabel")}>
            {[["newest", "/leads"], ["intent", "/leads?sort=intent"]].map(([k, href]) => (
              <a key={k} href={href} aria-current={(sort ?? "newest") === k ? "page" : undefined}
                 className={`min-h-7 rounded-md px-3 leading-7 ${(sort ?? "newest") === k ? "bg-card text-blue shadow-card" : "text-muted hover:text-foreground"}`}>
                {ti(`sort.${k}` as never)}
              </a>
            ))}
          </nav>
        </div>
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
                      {(radarOf.get(lead.id)?.duplicate_count ?? 0) > 0 && (
                        <span className="rounded-full bg-indigo-soft px-2 py-0.5 text-xs font-semibold text-indigo" title={ti("duplicateHint")}>
                          {ti("duplicate", { count: radarOf.get(lead.id)!.duplicate_count })}
                        </span>
                      )}
                      {radarOf.get(lead.id)?.is_cold && (
                        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted" title={ti("coldHint")}>
                          {ti("cold", { days: Math.floor((radarOf.get(lead.id)!.hours_silent ?? 0) / 24) })}
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

                    {/* Qualifier + matcher: a reasoned score, and alternatives. */}
                    <IntelPanel
                      leadId={lead.id}
                      initial={intelOf.get(lead.id) ?? null}
                      qualifyAction={qualifyLead}
                      matchAction={findLeadMatches}
                      marketplaceUrl={marketplaceUrl}
                      companion={cast.lead_qualifier}
                      matchCompanion={cast.alternative_finder}
                      labels={intelLabels}
                    />

                    {/* The Secretary: draft → edit → the agent sends. */}
                    <ReplyPanel
                      leadId={lead.id}
                      phone={lead.contacts?.phone ?? null}
                      email={lead.contacts?.email ?? null}
                      defaultSubject={tsec("defaultSubject", { listing: lead.listings?.title ?? "" })}
                      draftAction={draftLeadReply}
                      sendEmailAction={sendLeadEmail}
                      sendWhatsappAction={sendLeadWhatsapp}
                      sendTemplateAction={sendLeadWhatsappTemplate}
                      platform={platformOf.get(lead.id) ?? null}
                      companions={{ whatsapp: cast.reply_drafter, email: cast.email_composer }}
                      quota={quota ? { remaining: quota.remaining, total: quota.monthly_allowance } : null}
                      labels={replyLabels}
                    />
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

                    <Link
                      href={`/tasks?lead=${lead.id}`}
                      className="rounded-lg border border-line px-4 py-2.5 text-center text-sm font-semibold hover:bg-surface"
                    >
                      ✦ {ti("tasksLink")}
                    </Link>

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
