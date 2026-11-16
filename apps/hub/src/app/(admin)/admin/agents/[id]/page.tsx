import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, requireCapabilityIn } from "@/lib/authz";
import { banAgent, restoreAgent, reviewAgent, reviewSocialLink, suspendAgent } from "../actions";
import { Agent360 } from "@/components/admin/agent-360";
import { GrantPanel } from "@/components/admin/grant-panel";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 outline-none focus:border-crimson";

async function signedUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null,
) {
  if (!path) return null;
  const { data } = await supabase.storage
    .from("agent-verification-private")
    .createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

export default async function AgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string; n?: string }>;
}) {
  await requireCapability("agent.verify");
  const { id } = await params;
  const { done, error, n } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("admin");
  const td = await getTranslations("dashboard");
  const tv = await getTranslations("verification");

  const [{ data: profile }, { data: ap }, { data: priv }, { data: history }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).single(),
      supabase.from("agent_profiles").select("*").eq("user_id", id).maybeSingle(),
      supabase.from("users_private").select("email, mobile_number").eq("user_id", id).maybeSingle(),
      supabase
        .from("agent_verifications")
        .select("action, notes, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
  if (!profile) notFound();
  // Before any signed document URL is minted: a country admin sees only
  // agents in their own country.
  await requireCapabilityIn("agent.verify", profile.country_code, "/admin/agents");

  const [licenceUrl, identityUrl, agencyUrl, cardFrontUrl, cardBackUrl] = await Promise.all([
    signedUrl(supabase, ap?.licence_document_path ?? null),
    signedUrl(supabase, ap?.identity_document_path ?? null),
    signedUrl(supabase, ap?.agency_document_path ?? null),
    signedUrl(supabase, ap?.name_card_front_path ?? null),
    signedUrl(supabase, ap?.name_card_back_path ?? null),
  ]);

  // Agent 360 (P1-d-1): consent, portfolio and the open suspension, RLS-scoped.
  const [{ data: consents }, { data: portfolio }, { data: openSuspension }] = await Promise.all([
    supabase.from("consent_records")
      .select("id, created_at, status, country_code, declaration_versions(version_number, locale, declarations(key))")
      .eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("listings").select("status").eq("agent_id", id).limit(2000),
    supabase.from("agent_suspensions").select("reason, suspended_at, paused_listing_ids").eq("agent_id", id).is("restored_at", null).maybeSingle(),
  ]);
  const byStatus = new Map<string, number>();
  for (const l of portfolio ?? []) byStatus.set(l.status, (byStatus.get(l.status) ?? 0) + 1);
  const suspended = profile.agent_status === "suspended";
  const banned = profile.agent_status === "banned";

  const { data: socialLinks } = await supabase
    .from("agent_social_links")
    .select("id, platform, url, display_label, verification_status, visibility")
    .eq("user_id", id)
    .order("created_at");

  const fields: [string, string | null | undefined][] = [
    [t("detail.fullLegalName"), ap?.full_legal_name],
    [t("detail.email"), priv?.email],
    [tv("agencyName"), ap?.agency_name],
    [tv("agencyRegistrationNumber"), ap?.agency_registration_number],
    [tv("licenceType"), ap?.licence_type],
    [tv("licenceNumber"), ap?.licence_number],
    [tv("licenceExpiry"), ap?.licence_expiry],
    [tv("country"), ap?.country_code],
    [tv("stateRegion"), ap?.state_region],
    [tv("city"), ap?.city],
    [tv("categories"), ap?.property_categories?.join(", ")],
  ];

  return (
    <div>
      <Link href="/admin/agents" className="text-sm text-muted hover:text-foreground">
        ← {t("agentsTitle")}
      </Link>
      <div className="mt-2 mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{profile.display_name}</h1>
        <span className="rounded-full bg-surface px-3 py-1 text-sm font-medium">
          {td(`status.${profile.agent_status}`)}
        </span>
      </div>

      {done && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {done === "suspended" || done === "restored" || done === "banned" ? t(`doneNotice.${done}`, { n: Number(n) || 0 }) : t(`doneNotice.${done}`)}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t(`errors.${["notes_required", "self_invited", "reason_required", "already_suspended", "not_suspended", "self", "already_banned"].includes(error) ? error : "save_failed"}`)}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <section className="rounded-xl border border-line p-6">
            <h2 className="mb-4 font-semibold">{t("detail.profileTitle")}</h2>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {fields.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted uppercase">{label}</dt>
                  <dd className="text-sm font-medium">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-line p-6">
            <h2 className="mb-4 font-semibold">{t("detail.documentsTitle")}</h2>
            <ul className="space-y-2 text-sm">
              {[
                [tv("licenceDocument"), licenceUrl],
                [tv("identityDocument"), identityUrl],
                [tv("agencyDocument"), agencyUrl],
              ].map(([label, url]) => (
                <li key={label as string} className="flex items-center justify-between rounded-lg bg-surface px-4 py-3">
                  <span>{label}</span>
                  {url ? (
                    <a href={url as string} target="_blank" rel="noreferrer" className="font-medium text-crimson hover:underline">
                      {t("detail.view")}
                    </a>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-line p-6">
            <h2 className="mb-4 font-semibold">{t("detail.socialLinksTitle")}</h2>
            {!socialLinks?.length ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {socialLinks.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-4 py-2.5">
                    <span>
                      <span className="font-medium">{l.platform}</span>
                      <a href={l.url} target="_blank" rel="noreferrer nofollow"
                        className="ml-2 text-xs break-all text-crimson hover:underline">{l.url}</a>
                      <span className="ml-2 text-xs text-muted">({l.verification_status} · {l.visibility})</span>
                    </span>
                    <span className="flex gap-2">
                      {(["verified", "rejected", "hidden"] as const).map((decision) => (
                        <form key={decision} action={reviewSocialLink}>
                          <input type="hidden" name="linkId" value={l.id} />
                          <input type="hidden" name="userId" value={id} />
                          <input type="hidden" name="decision" value={decision} />
                          <button type="submit"
                            className={`rounded px-2 py-1 text-xs font-semibold ${
                              decision === "verified"
                                ? "bg-success/10 text-success hover:bg-success/20"
                                : "border border-line text-muted hover:text-foreground"
                            }`}>
                            {t(`detail.link_${decision}`)}
                          </button>
                        </form>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(cardFrontUrl || cardBackUrl) && (
              <p className="mt-3 text-sm">
                {t("detail.nameCards")}:{" "}
                {cardFrontUrl && <a href={cardFrontUrl} target="_blank" rel="noreferrer" className="font-medium text-crimson hover:underline">{t("detail.front")}</a>}
                {cardFrontUrl && cardBackUrl && " · "}
                {cardBackUrl && <a href={cardBackUrl} target="_blank" rel="noreferrer" className="font-medium text-crimson hover:underline">{t("detail.back")}</a>}
              </p>
            )}
          </section>

          {/* Commercial, entitlements and referral — the operational half of
              this screen. Verification answers "may they work"; this answers
              "what may they do, why, and what have they brought in". */}
          <section className="rounded-xl border border-line p-6" data-panel="portfolio">
            <h2 className="mb-4 font-semibold">{t("a360.portfolioTitle")}</h2>
            {!(portfolio ?? []).length ? (
              <p className="text-sm text-muted">{t("a360.noListings")}</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[...byStatus.entries()].sort((a, b) => b[1] - a[1]).map(([st, c]) => (
                  <div key={st} className="rounded-lg bg-surface px-3 py-2" data-portfolio={st}>
                    <dt className="text-xs text-muted">{t.has(`a360.listingStatus.${st}` as never) ? t(`a360.listingStatus.${st}` as never) : st}</dt>
                    <dd className="text-lg font-semibold">{c}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className="rounded-xl border border-line p-6" data-panel="consent">
            <h2 className="mb-4 font-semibold">{t("a360.consentTitle")}</h2>
            {!(consents ?? []).length ? (
              <p className="text-sm text-muted">{t("a360.noConsent")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(consents ?? []).map((c) => {
                  const dv = (Array.isArray(c.declaration_versions) ? c.declaration_versions[0] : c.declaration_versions) as { version_number?: number; locale?: string; declarations?: { key?: string } | { key?: string }[] } | null;
                  const dk = Array.isArray(dv?.declarations) ? dv?.declarations[0]?.key : dv?.declarations?.key;
                  return (
                    <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-surface px-4 py-2" data-consent={dk ?? ""}>
                      <span><span className="font-medium">{dk ?? "—"}</span> <span className="text-xs text-muted">v{dv?.version_number ?? "?"} · {dv?.locale ?? ""} · {c.country_code ?? ""}</span></span>
                      <span className="text-xs text-muted">{c.status} · {new Date(c.created_at).toISOString().slice(0, 10)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <Agent360 userId={id} />
          <GrantPanel userId={id} />

          <section className="rounded-xl border border-line p-6">
            <h2 className="mb-4 font-semibold">{t("detail.historyTitle")}</h2>
            {!history?.length ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {history.map((h, i) => (
                  <li key={i} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                    <span className="min-w-0 flex-1"><span className="font-medium">{t(`history.${h.action}`)}</span>{h.notes && <span className="block break-words text-xs text-muted">{h.notes}</span>}</span>
                    <span className="text-xs text-muted">
                      {new Date(h.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="h-fit rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 font-semibold">{t("decision.title")}</h2>
          <form action={reviewAgent} className="space-y-4">
            <input type="hidden" name="userId" value={id} />
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("decision.notes")}</span>
              <textarea name="notes" rows={4} className={inputCls} placeholder={t("decision.notesHint")} />
            </label>
            <div className="space-y-2">
              <button name="decision" value="approve" type="submit"
                className="w-full rounded-lg bg-success px-4 py-2.5 font-semibold text-white hover:opacity-90">
                {t("decision.approve")}
              </button>
              <button name="decision" value="request_info" type="submit"
                className="w-full rounded-lg border border-warning px-4 py-2.5 font-semibold text-warning hover:bg-warning/10">
                {t("decision.requestInfo")}
              </button>
              <button name="decision" value="reject" type="submit"
                className="w-full rounded-lg border border-danger px-4 py-2.5 font-semibold text-danger hover:bg-danger/10">
                {t("decision.reject")}
              </button>
            </div>
          </form>

          <div className="mt-8 border-t border-line pt-6" data-panel="account">
            <h2 className="mb-2 font-semibold">{t("a360.accountTitle")}</h2>
            {banned ? (
              <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger" data-banned="1">{t("a360.bannedNotice")}</p>
            ) : suspended ? (
              <>
                <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" data-suspended="1">
                  {t("a360.suspendedSince", { date: openSuspension?.suspended_at ? new Date(openSuspension.suspended_at).toISOString().slice(0, 10) : "—" })}
                  {openSuspension?.reason && <span className="mt-1 block break-words text-xs text-foreground">{openSuspension.reason}</span>}
                </p>
                <form action={restoreAgent} className="space-y-3">
                  <input type="hidden" name="userId" value={id} />
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">{t("a360.restoreNote")}</span>
                    <textarea name="note" rows={2} maxLength={2000} className={inputCls} />
                  </label>
                  <p className="text-xs text-muted">{t("a360.restoreHint", { n: openSuspension?.paused_listing_ids?.length ?? 0 })}</p>
                  <button type="submit" className="w-full rounded-lg bg-success px-4 py-2.5 font-semibold text-white hover:opacity-90">{t("a360.restore")}</button>
                </form>
              </>
            ) : (
              <form action={suspendAgent} className="space-y-3">
                <input type="hidden" name="userId" value={id} />
                <p className="text-xs text-muted">{t("a360.suspendHint", { n: byStatus.get("published") ?? 0 })}</p>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">{t("a360.suspendReason")}</span>
                  <textarea name="reason" required minLength={3} maxLength={2000} rows={3} className={inputCls} />
                </label>
                <button type="submit" className="w-full rounded-lg border border-danger px-4 py-2.5 font-semibold text-danger hover:bg-danger/10">{t("a360.suspend")}</button>
              </form>
            )}
            {!banned && (
              <details className="mt-4 rounded-lg border border-danger/40 p-3" data-ban="1">
                <summary className="cursor-pointer text-sm font-semibold text-danger">{t("a360.banTitle")}</summary>
                <form action={banAgent} className="mt-3 space-y-3">
                  <input type="hidden" name="userId" value={id} />
                  <p className="text-xs text-muted">{t("a360.banHint")}</p>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">{t("a360.suspendReason")}</span>
                    <textarea name="reason" required minLength={3} maxLength={2000} rows={2} className={inputCls} />
                  </label>
                  <button type="submit" className="w-full rounded-lg bg-danger px-4 py-2.5 font-semibold text-white hover:opacity-90">{t("a360.ban")}</button>
                </form>
              </details>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
