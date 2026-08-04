import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { updateTrustProfile, addSocialLink, removeSocialLink } from "./actions";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";
const btnPri =
  "rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong";

const PLATFORMS = ["facebook", "instagram", "linkedin", "tiktok", "youtube",
  "whatsapp", "telegram", "website", "agency_profile", "other"] as const;
const KNOWN_ERRORS = ["invalid_fields", "invalid_file_type", "file_too_large",
  "upload_failed", "save_failed", "invalid_url"];

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const t = await getTranslations("trustProfile");

  const [{ data: profile }, { data: priv }, { data: ap }, { data: links }] =
    await Promise.all([
      supabase.from("profiles").select("display_name, avatar_url, agent_status").eq("id", user.id).single(),
      supabase.from("users_private").select("mobile_number, whatsapp_number, email").eq("user_id", user.id).maybeSingle(),
      supabase.from("agent_profiles").select("biography, agency_name, licence_type, licence_number, name_card_front_path, name_card_back_path").eq("user_id", user.id).maybeSingle(),
      supabase.from("agent_social_links").select("*").eq("user_id", user.id).order("created_at"),
    ]);

  const photoUrl = profile?.avatar_url
    ? supabase.storage.from("agent-profile-public").getPublicUrl(profile.avatar_url).data.publicUrl
    : null;

  return (
    <AgentShell>
      <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
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
        <div className="flex items-center gap-4">
          {photoUrl ? (
            <Image src={photoUrl} alt="" width={72} height={72} unoptimized
              className="h-18 w-18 rounded-full border border-line object-cover" />
          ) : (
            <div className="flex h-18 w-18 items-center justify-center rounded-full bg-surface text-2xl">
              👤
            </div>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("photo")}</span>
            <input type="file" name="photo" accept=".jpg,.jpeg,.png,.webp" className="block text-sm" />
            <span className="text-xs text-muted">{t("photoHint")}</span>
          </label>
        </div>

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
          <summary className="cursor-pointer text-sm font-semibold">{t("addLink")}</summary>
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
    </AgentShell>
  );
}
