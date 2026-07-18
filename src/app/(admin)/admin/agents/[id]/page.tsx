import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/authz";
import { reviewAgent, reviewSocialLink } from "../actions";

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
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { done, error } = await searchParams;
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

  const [licenceUrl, identityUrl, agencyUrl, cardFrontUrl, cardBackUrl] = await Promise.all([
    signedUrl(supabase, ap?.licence_document_path ?? null),
    signedUrl(supabase, ap?.identity_document_path ?? null),
    signedUrl(supabase, ap?.agency_document_path ?? null),
    signedUrl(supabase, ap?.name_card_front_path ?? null),
    signedUrl(supabase, ap?.name_card_back_path ?? null),
  ]);

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
          {t(`doneNotice.${done}`)}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t(`errors.${error === "notes_required" ? "notes_required" : "save_failed"}`)}
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

          <section className="rounded-xl border border-line p-6">
            <h2 className="mb-4 font-semibold">{t("detail.historyTitle")}</h2>
            {!history?.length ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {history.map((h, i) => (
                  <li key={i} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                    <span className="font-medium">{t(`history.${h.action}`)}</span>
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
        </aside>
      </div>
    </div>
  );
}
