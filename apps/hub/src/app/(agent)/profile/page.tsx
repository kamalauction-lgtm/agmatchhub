import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { HeroCard } from "@/components/profile/hero-card";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { updateTrustProfile, addSocialLink, removeSocialLink, setMyAgency, addMyAgency, submitCertificate } from "./actions";
import { GuideLink } from "@/components/help/guide-link";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";
const btnPri =
  "rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong";

const PLATFORMS = ["facebook", "instagram", "linkedin", "tiktok", "youtube",
  "whatsapp", "telegram", "website", "agency_profile", "other"] as const;
const KNOWN_ERRORS = ["invalid_fields", "invalid_file_type", "file_too_large",
  "upload_failed", "save_failed", "invalid_url", "photo_paused"];

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; hero?: string; company?: string; company_saved?: string; company_error?: string; cert_saved?: string; cert_error?: string }>;
}) {
  const { saved, error, hero: heroNotice, company: companyQuery, company_saved: companySaved, company_error: companyError, cert_saved: certSaved, cert_error: certError } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const t = await getTranslations("trustProfile");

  const [{ data: profile }, { data: priv }, { data: ap }, { data: links }] =
    await Promise.all([
      supabase.from("profiles").select("display_name, avatar_url, agent_status, country_code").eq("id", user.id).single(),
      supabase.from("users_private").select("mobile_number, whatsapp_number, email").eq("user_id", user.id).maybeSingle(),
      supabase.from("agent_profiles").select("biography, agency_id, agency_name, licence_type, licence_number, name_card_front_path, name_card_back_path").eq("user_id", user.id).maybeSingle(),
      supabase.from("agent_social_links").select("*").eq("user_id", user.id).order("created_at"),
    ]);

  // My company (00130): the directory in the agent's own country, searched by
  // name; pattern characters are stripped before use.
  const cq = (companyQuery ?? "").replace(/[%_,()*\\]/g, " ").trim().slice(0, 80);
  const country = profile?.country_code ?? null;
  const [{ data: myAgency }, { data: matches }, { data: heroPartner }, { data: heroLink }] = await Promise.all([
    ap?.agency_id
      ? supabase.from("agencies").select("id, name, status").eq("id", ap.agency_id).maybeSingle()
      : Promise.resolve({ data: null }),
    country && cq
      ? supabase.from("agencies").select("id, name, status").eq("country_code", country).ilike("name", `%${cq}%`).order("status", { ascending: false }).order("name").limit(10)
      : Promise.resolve({ data: [] as { id: string; name: string; status: string }[] }),
    supabase.rpc("agency_is_hero_partner"),
    supabase.from("hero_links").select("status").eq("user_id", user.id).maybeSingle(),
  ]);
  // Certificate (00131): offered only where the country has certificate types.
  const [{ data: countryRow }, { data: certs }] = await Promise.all([
    country ? supabase.from("countries").select("terminology").eq("code", country).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("agent_certificates").select("id, cert_type, cert_number, expires_on, status, review_note, created_at").eq("user_id", user.id).neq("status", "superseded").order("created_at", { ascending: false }).limit(5),
  ]);
  const certTypes = ((countryRow?.terminology as { certificate_types?: unknown } | null)?.certificate_types ?? []) as string[];
  const today = new Date().toISOString().slice(0, 10);
  const approvedCert = (certs ?? []).find((c) => c.status === "approved" && c.expires_on >= today) ?? null;
  const latestCert = (certs ?? [])[0] ?? null;
  const certLabel = (k: string) => (t.has(`certTypes.${k}`) ? t(`certTypes.${k}` as never) : k);

  // AG Hero only for agents of a partner agency, or anyone already linked.
  const heroEligible = heroPartner === true || (!!heroLink && heroLink.status !== "unlinked");

  const photoUrl = profile?.avatar_url
    ? supabase.storage.from("agent-profile-public").getPublicUrl(profile.avatar_url).data.publicUrl
    : null;

  return (
    <AgentShell>
      <h1 className="mb-2 text-2xl font-semibold">{t("title")} <GuideLink slug="profile-and-company" /></h1>
      <p className="mb-6 text-sm text-muted">{t("intro")}</p>

      {saved && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t("savedNotice")}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t(`errors.${KNOWN_ERRORS.includes(error) ? error : "save_failed"}`)}
        </p>
      )}

      <form action={updateTrustProfile} className="mb-8 space-y-5 rounded-xl border border-line p-6">
        <AvatarUpload
          currentPhotoUrl={photoUrl}
          labels={{
            photo: t("photo"),
            hint: t("photoHint"),
            choose: t("photoChoose"),
            change: t("photoChange"),
            modeHead: t("photoModeHead"),
            modeFull: t("photoModeFull"),
            nudge: t("photoNudge"),
            autoCropped: t("photoAutoCropped"),
            cropFailed: t("photoCropFailed"),
          }}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("displayName")}</span>
            <input name="displayName" required minLength={2} maxLength={80}
              defaultValue={profile?.display_name ?? ""} className={inputCls} />
          </label>
          <div className="text-sm">
            <span className="mb-1 block font-medium">{t("agency")}</span>
            <p className="rounded-lg bg-surface px-3 py-2.5">
              {ap?.agency_name ?? "—"}
              {ap?.licence_number && <span className="text-muted"> · {ap.licence_type} {ap.licence_number}</span>}
            </p>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">WhatsApp</span>
            <input name="whatsapp" maxLength={30} placeholder="+60 12 345 6789"
              defaultValue={priv?.whatsapp_number ?? ""} className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("mobile")}</span>
            <input name="mobile" maxLength={30} defaultValue={priv?.mobile_number ?? ""} className={inputCls} />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t("biography")}</span>
          <textarea name="biography" rows={3} maxLength={2000}
            defaultValue={ap?.biography ?? ""} placeholder={t("biographyHint")} className={inputCls} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              {t("nameCardFront")} {ap?.name_card_front_path && <em className="font-normal text-muted">({t("uploaded")})</em>}
            </span>
            <input type="file" name="nameCardFront" accept=".jpg,.jpeg,.png,.webp,.pdf" className="block text-sm" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              {t("nameCardBack")} {ap?.name_card_back_path && <em className="font-normal text-muted">({t("uploaded")})</em>}
            </span>
            <input type="file" name="nameCardBack" accept=".jpg,.jpeg,.png,.webp,.pdf" className="block text-sm" />
          </label>
        </div>
        <p className="text-xs text-muted">{t("nameCardHint")}</p>

        <button type="submit" className={btnPri}>{t("save")}</button>
      </form>

      <section className="rounded-xl border border-line p-6">
        <h2 className="mb-1 font-semibold">{t("linksTitle")}</h2>
        <p className="mb-4 text-xs text-muted">{t("linksIntro")}</p>

        <ul className="mb-5 space-y-2">
          {!links?.length && <li className="text-sm text-muted">{t("noLinks")}</li>}
          {links?.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-4 py-2.5 text-sm">
              <span>
                <span className="font-medium">{t(`platforms.${l.platform}`)}</span>
                {l.display_label && <span className="text-muted"> · {l.display_label}</span>}
                <span className="ml-2 block truncate text-xs text-muted sm:inline">{l.url}</span>
              </span>
              <span className="flex items-center gap-2 whitespace-nowrap">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  l.verification_status === "verified" ? "bg-success/10 text-success" : "bg-surface border border-line text-muted"
                }`}>
                  {t(`verifStatus.${l.verification_status}`)}
                </span>
                <form action={removeSocialLink}>
                  <input type="hidden" name="linkId" value={l.id} />
                  <button type="submit" className="text-xs text-danger hover:underline">{t("remove")}</button>
                </form>
              </span>
            </li>
          ))}
        </ul>

        <details className="rounded-lg border border-line p-4">
          <summary className="tap cursor-pointer text-sm font-semibold">{t("addLink")}</summary>
          <form action={addSocialLink} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("platform")}</span>
              <select name="platform" className={inputCls}>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{t(`platforms.${p}`)}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">URL</span>
              <input name="url" type="url" required placeholder="https://…" className={inputCls} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("label")}</span>
              <input name="label" maxLength={80} className={inputCls} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("visibility")}</span>
              <select name="visibility" defaultValue="collaborators" className={inputCls}>
                {["admin_only", "collaborators", "after_contact_release", "public_profile"].map((v) => (
                  <option key={v} value={v}>{t(`visibilities.${v}`)}</option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <p className="mb-2 text-xs text-muted">{t("verifyNote")}</p>
              <button type="submit" className={btnPri}>{t("addLinkSubmit")}</button>
            </div>
          </form>
        </details>
      </section>

      {/* My company (00130) ------------------------------------------------ */}
      <section id="company" className="mt-8 rounded-xl border border-line p-5" data-company="1">
        <h2 className="font-semibold">{t("companyTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("companyIntro")}</p>
        {companySaved && <p className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{t("companySaved")}</p>}
        {companyError && <p role="alert" className="mt-3 rounded-lg bg-crimson-soft px-3 py-2 text-sm text-crimson">{t(`companyErrors.${["other_country", "too_many", "invalid_name", "no_country", "not_allowed"].includes(companyError) ? companyError : "failed"}` as never)}</p>}
        <p className="mt-3 text-sm">
          <span className="text-muted">{t("companyCurrent")}: </span>
          <span className="font-semibold" data-current-agency={myAgency?.id ?? ""}>{myAgency?.name ?? ap?.agency_name ?? "—"}</span>
          {myAgency?.status === "unconfirmed" && <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">{t("companyUnconfirmed")}</span>}
        </p>
        {!country ? (
          <p className="mt-3 text-sm text-muted">{t("companyNeedsCountry")}</p>
        ) : (
          <>
            <form method="get" action="/profile#company" className="mt-4 flex flex-wrap items-end gap-2">
              <label className="block flex-1 text-sm">
                <span className="mb-1 block font-medium">{t("companySearch")}</span>
                <input name="company" defaultValue={cq} maxLength={80} className={inputCls} />
              </label>
              <button type="submit" className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-semibold hover:border-crimson hover:text-crimson">{t("companySearchCta")}</button>
            </form>
            {cq && (
              <ul className="mt-3 divide-y divide-line rounded-lg border border-line" data-company-results="1">
                {(matches ?? []).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span>
                      {a.name}
                      {a.status === "unconfirmed" && <span className="ml-2 text-xs text-muted">({t("companyUnconfirmed")})</span>}
                    </span>
                    <form action={setMyAgency}>
                      <input type="hidden" name="agencyId" value={a.id} />
                      <button type="submit" className="cursor-pointer text-xs font-semibold text-crimson hover:underline">{t("companyPick")}</button>
                    </form>
                  </li>
                ))}
                {!(matches ?? []).length && <li className="px-3 py-2 text-sm text-muted">{t("companyNone")}</li>}
              </ul>
            )}
            {cq && (
              <form action={addMyAgency} className="mt-3 flex flex-wrap items-end gap-2" data-company-add="1">
                <label className="block flex-1 text-sm">
                  <span className="mb-1 block font-medium">{t("companyAdd")}</span>
                  <input name="agencyName" required minLength={2} maxLength={160} defaultValue={cq} className={inputCls} />
                </label>
                <button type="submit" className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-semibold hover:border-crimson hover:text-crimson">{t("companyAddCta")}</button>
              </form>
            )}
          </>
        )}
      </section>

      {/* Certificate (00131) — optional; proof required; admin approves -------- */}
      {certTypes.length > 0 && (
        <section id="certificate" className="mt-8 rounded-xl border border-line p-5" data-certificate="1">
          <h2 className="font-semibold">{t("certTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("certIntro")}</p>
          {certSaved && <p className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{t("certSaved")}</p>}
          {certError && <p role="alert" className="mt-3 rounded-lg bg-crimson-soft px-3 py-2 text-sm text-crimson">{t(`certErrors.${["proof_required", "invalid_file_type", "file_too_large", "invalid_number", "invalid_expiry", "type_not_offered", "not_allowed", "no_country"].includes(certError) ? certError : "failed"}` as never)}</p>}
          {approvedCert && (
            <p className="mt-3 text-sm" data-cert-status="approved">
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">✓ {t("certCertified")}</span>
              <span className="ml-2">{certLabel(approvedCert.cert_type)} · {approvedCert.cert_number} · {t("certValidUntil", { date: approvedCert.expires_on })}</span>
            </p>
          )}
          {latestCert && latestCert.id !== approvedCert?.id && (
            <p className="mt-3 text-sm" data-cert-status={latestCert.status}>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${latestCert.status === "pending" ? "bg-warning-soft text-warning" : latestCert.status === "rejected" ? "bg-crimson-soft text-crimson" : "bg-surface text-muted"}`}>
                {t(`certStatus.${latestCert.status === "approved" ? "expired" : latestCert.status}` as never)}
              </span>
              <span className="ml-2">{latestCert.cert_number}</span>
              {latestCert.status === "rejected" && latestCert.review_note && <span className="mt-1 block text-xs text-muted">{latestCert.review_note}</span>}
            </p>
          )}
          <form action={submitCertificate} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("certType")}</span>
              <select name="certType" required className={inputCls} defaultValue={certTypes[0]}>
                {certTypes.map((k) => <option key={k} value={k}>{certLabel(k)}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("certNumber")}</span>
              <input name="certNumber" required minLength={3} maxLength={60} className={inputCls} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("certExpires")}</span>
              <input name="expiresOn" type="date" required min={today} className={inputCls} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("certProof")}</span>
              <input name="proof" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" className="block w-full text-sm" />
              <span className="mt-1 block text-xs text-muted">{t("certProofHint")}</span>
            </label>
            <div className="sm:col-span-2">
              <p className="mb-2 text-xs text-muted">{t("certPublicNote")}</p>
              <button type="submit" className={btnPri}>{approvedCert || latestCert ? t("certReplace") : t("certSubmit")}</button>
            </div>
          </form>
        </section>
      )}

      {/* AG Hero link + launch benefits (E8) — partner agencies only (00130). */}
      {heroEligible && <HeroCard userId={user.id} notice={heroNotice} />}
    </AgentShell>
  );
}
