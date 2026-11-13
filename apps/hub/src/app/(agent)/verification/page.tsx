import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { submitVerification } from "./actions";
import { CountryLicenceFields } from "@/components/forms/country-licence-fields";
import { licenceTypesFor } from "@/lib/countries/licence";

const CATEGORIES = ["residential", "commercial", "industrial", "land"] as const;
const KNOWN_ERRORS = [
  "invalid_fields", "missing_documents", "invalid_file_type", "file_too_large",
  "upload_failed", "save_failed", "not_allowed",
];

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 outline-none focus:border-crimson";

export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; submitted?: string }>;
}) {
  const { error, submitted } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: profile }, { data: ap }, { data: countries }] = await Promise.all([
    supabase.from("profiles").select("agent_status, country_code").eq("id", user.id).single(),
    supabase.from("agent_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("countries").select("code, name, terminology").eq("active", true).order("name"),
  ]);
  if (!profile) redirect("/login");

  const t = await getTranslations("verification");
  const td = await getTranslations("dashboard");

  const status = profile.agent_status;
  // Licence labels: a type without a translation shows its code rather than
  // breaking the page, so a new country's list works before it is translated.
  const licenceLabel = (v: string) => (t.has(`licenceTypes.${v}`) ? t(`licenceTypes.${v}` as never) : v);
  const countryOptions = (countries ?? []).map((c) => ({
    code: c.code,
    name: c.name,
    licences: licenceTypesFor(c.terminology).map((v) => ({ value: v, label: licenceLabel(v) })),
  }));
  const fixedCountry = profile.country_code ?? null;
  const defaultCountry = fixedCountry ?? ap?.country_code ?? countryOptions[0]?.code ?? "";
  const editable = [
    "draft", "email_verification_pending", "documents_pending",
    "additional_information_required", "rejected",
  ].includes(status);

  return (
    <AgentShell>
      <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
        <p className="mb-6 text-sm text-muted">{t("intro")}</p>

        {submitted && (
          <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
            {t("submittedNotice")}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
            {t(`errors.${KNOWN_ERRORS.includes(error) ? error : "save_failed"}`)}
          </p>
        )}
        {ap?.review_notes && ["additional_information_required", "rejected"].includes(status) && (
          <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
            <span className="font-semibold">{t("adminNotes")}: </span>{ap.review_notes}
          </div>
        )}

        {!editable ? (
          <div className="rounded-xl border border-line bg-surface p-6">
            <p className="text-sm">
              {t("currentStatus")}:{" "}
              <span className="font-semibold">{td(`status.${status}`)}</span>
            </p>
            <p className="mt-2 text-sm text-muted">{t("lockedNotice")}</p>
          </div>
        ) : (
          <form action={submitVerification} className="space-y-5">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t("fullLegalName")}</span>
              <input name="fullLegalName" required minLength={3} defaultValue={ap?.full_legal_name ?? ""} className={inputCls} />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t("agencyName")}</span>
                <input name="agencyName" required minLength={2} defaultValue={ap?.agency_name ?? ""} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t("agencyRegistrationNumber")}</span>
                <input name="agencyRegistrationNumber" defaultValue={ap?.agency_registration_number ?? ""} className={inputCls} />
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <CountryLicenceFields
                countries={countryOptions}
                fixedCountry={fixedCountry}
                defaultCountry={defaultCountry}
                defaultLicence={ap?.licence_type ?? null}
                labels={{ country: t("country"), licenceType: t("licenceType"), fixedHint: t("countryFixedHint") }}
                className={inputCls}
              />
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t("licenceNumber")}</span>
                <input name="licenceNumber" required minLength={2} defaultValue={ap?.licence_number ?? ""} className={inputCls} />
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t("licenceExpiry")}</span>
                <input type="date" name="licenceExpiry" defaultValue={ap?.licence_expiry ?? ""} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t("stateRegion")}</span>
                <input name="stateRegion" required minLength={2} defaultValue={ap?.state_region ?? ""} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t("city")}</span>
                <input name="city" required minLength={2} defaultValue={ap?.city ?? ""} className={inputCls} />
              </label>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t("categories")}</legend>
              <div className="flex flex-wrap gap-4">
                {CATEGORIES.map((c) => (
                  <label key={c} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="categories"
                      value={c}
                      defaultChecked={ap?.property_categories?.includes(c) ?? c === "residential"}
                      className="h-4 w-4 accent-crimson"
                    />
                    {t(`categoryNames.${c}`)}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
              <p className="text-sm font-medium">{t("documentsTitle")}</p>
              <p className="text-xs text-muted">{t("documentsHint")}</p>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">
                  {t("licenceDocument")} {ap?.licence_document_path && <em className="font-normal text-muted">({t("alreadyUploaded")})</em>}
                </span>
                <input type="file" name="licenceDocument" accept=".jpg,.jpeg,.png,.webp,.pdf" className="block w-full text-sm" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">
                  {t("identityDocument")} {ap?.identity_document_path && <em className="font-normal text-muted">({t("alreadyUploaded")})</em>}
                </span>
                <input type="file" name="identityDocument" accept=".jpg,.jpeg,.png,.webp,.pdf" className="block w-full text-sm" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{t("agencyDocument")}</span>
                <input type="file" name="agencyDocument" accept=".jpg,.jpeg,.png,.webp,.pdf" className="block w-full text-sm" />
              </label>
            </div>

            <button type="submit" className="w-full rounded-lg bg-crimson px-4 py-2.5 font-semibold text-white hover:bg-crimson-strong">
              {t("submit")}
            </button>
          </form>
        )}
    </AgentShell>
  );
}
