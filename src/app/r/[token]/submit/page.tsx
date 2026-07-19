import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyLinkSession, linkCookieName } from "@/lib/request-links";
import { getActiveDeclaration } from "@/lib/consents";
import { BrandLockup } from "@/components/layout/brand-lockup";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { submitProperty } from "./actions";
import { FormDraftGuard } from "@/components/forms/draft-guard";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

const SOURCE_TYPES = [
  "direct_written_appointment", "direct_appointment_pending",
  "direct_verbal_authorisation", "direct_no_appointment", "indirect_other_agent",
  "co_agent", "agency_shared", "developer", "landlord_referral", "open_market", "other",
] as const;

const KNOWN_ERRORS = [
  "invalid_fields", "declaration_required", "price_required", "cover_required",
  "invalid_file_type", "file_too_large", "upload_failed", "save_failed",
];

/** Collapsible form section — long form, app-style (owner request #2). */
function Section({
  title, open = false, children,
}: {
  title: string; open?: boolean; children: React.ReactNode;
}) {
  return (
    <details open={open} className="group rounded-xl border border-line bg-background">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold select-none [&::-webkit-details-marker]:hidden">
        {title}
        <span className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-4 px-5 pb-5">{children}</div>
    </details>
  );
}

export default async function SubmitPropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const service = createServiceClient();
  const { data: link } = await service
    .from("request_links")
    .select("id, request_id, active, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!link || !link.active || new Date(link.expires_at) < new Date()) {
    redirect(`/r/${encodeURIComponent(token)}`);
  }
  const unlocked = verifyLinkSession(
    (await cookies()).get(linkCookieName(link.id))?.value, link.id,
  );
  if (!unlocked) redirect(`/r/${encodeURIComponent(token)}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/r/${token}/submit`)}`);
  const { data: profile } = await supabase
    .from("profiles").select("agent_status").eq("id", user.id).single();
  if (profile?.agent_status !== "verified") redirect("/verification");

  const { data: request } = await service
    .from("property_requests")
    .select("human_readable_id, title, transaction_type, currency, country_code")
    .eq("id", link.request_id)
    .single();

  const locale = await getLocale();
  const declaration = await getActiveDeclaration("supply_agent_submission", locale);
  const t = await getTranslations("submit");
  const { data: currencies } = await supabase
    .from("currencies").select("code").eq("active", true).order("code");

  const { data: allCountries } = await service
    .from("countries").select("code, name").order("name");
  const requestCountry = allCountries?.find(
    (c) => c.code === (request as { country_code?: string } | null)?.country_code,
  );

  const field = (name: string, label: string, node: React.ReactNode) => (
    <label className="block text-sm" key={name}>
      <span className="mb-1 block font-medium">{label}</span>
      {node}
    </label>
  );

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between px-6 py-4">
        <BrandLockup size={28} />
        <LanguageSwitcher />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link href={`/r/${token}`} className="text-sm text-muted hover:text-foreground">
          ← {t("backToRequirement")}
        </Link>
        <h1 className="mt-2 mb-1 text-2xl font-semibold">{t("title")}</h1>
        <p className="mb-6 text-sm text-muted">
          {request?.human_readable_id} — {request?.title}
        </p>
        <p className="mb-6 rounded-lg bg-surface px-4 py-2.5 text-xs text-muted">{t("optionalHint")}</p>

        {error && (
          <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
            {t(`errors.${KNOWN_ERRORS.includes(error) ? error : "save_failed"}`)}
          </p>
        )}

        <form action={submitProperty} className="space-y-6">
          <input type="hidden" name="token" value={token} />
          <FormDraftGuard storageKey={`draft:sub:${token}`} />

          <Section title={t("sectionProperty")} open>
            {field("title", t("f.title"),
              <input name="title" required minLength={5} maxLength={200} className={inputCls} />)}
            <div className="grid gap-4 sm:grid-cols-3">
              {field("propertyCategory", t("f.category"),
                <select name="propertyCategory" defaultValue="residential" className={inputCls}>
                  {["residential", "commercial", "industrial", "land", "other"].map((c) => (
                    <option key={c} value={c}>{t(`categories.${c}`)}</option>
                  ))}
                </select>)}
              {field("propertyType", t("f.propertyType"),
                <input name="propertyType" className={inputCls} />)}
              {field("buildingName", t("f.buildingName"),
                <input name="buildingName" className={inputCls} />)}
            </div>
            {field("countrySearch", t("f.country"),
              <>
                <input name="countrySearch" list="country-list" placeholder={requestCountry?.name ?? ""} className={inputCls} />
                <datalist id="country-list">
                  {(allCountries ?? []).map((c) => <option key={c.code} value={c.name} />)}
                </datalist>
                <span className="mt-1 block text-xs text-muted">{t("f.countryHint")}</span>
              </>)}
            <div className="grid gap-4 sm:grid-cols-3">
              {field("city", t("f.city"),
                <input name="city" className={inputCls} />)}
              {field("district", t("f.district"),
                <input name="district" className={inputCls} />)}
              {field("stateRegion", t("f.stateRegion"),
                <input name="stateRegion" className={inputCls} />)}
            </div>
            {field("generalAddress", t("f.generalAddress"),
              <input name="generalAddress" placeholder={t("f.generalAddressHint")} className={inputCls} />)}
            <div className="grid gap-4 sm:grid-cols-2">
              {field("fullAddress", t("f.fullAddress"),
                <input name="fullAddress" placeholder={t("agentOnly")} className={inputCls} />)}
              {field("unitNumber", t("f.unitNumber"),
                <input name="unitNumber" placeholder={t("agentOnly")} className={inputCls} />)}
            </div>
          </Section>

          <Section title={t("sectionPricing")}>
            <div className="grid gap-4 sm:grid-cols-4">
              {field("currency", t("f.currency"),
                <select name="currency" defaultValue={request?.currency ?? "MYR"} className={inputCls}>
                  {(currencies ?? []).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>)}
              {field("askingPrice", t("f.askingPrice"),
                <input type="number" min="0" step="0.01" name="askingPrice" className={inputCls} />)}
              {field("monthlyRental", t("f.monthlyRental"),
                <input type="number" min="0" step="0.01" name="monthlyRental" className={inputCls} />)}
              {field("negotiable", t("f.negotiable"),
                <select name="negotiable" defaultValue="subject_to_offer" className={inputCls}>
                  <option value="yes">{t("f.negYes")}</option>
                  <option value="no">{t("f.negNo")}</option>
                  <option value="subject_to_offer">{t("f.negSubject")}</option>
                </select>)}
            </div>
            {field("minAcceptablePrice", t("f.minAcceptablePrice"),
              <input type="number" min="0" step="0.01" name="minAcceptablePrice"
                placeholder={t("f.minPriceHint")} className={inputCls} />)}
          </Section>

          <Section title={t("sectionSpecs")}>
            <div className="grid gap-4 sm:grid-cols-4">
              {field("builtUp", t("f.builtUp"),
                <input type="number" min="0" step="0.01" name="builtUp" className={inputCls} />)}
              {field("measurementUnit", t("f.unit"),
                <select name="measurementUnit" defaultValue="sqft" className={inputCls}>
                  <option value="sqft">sqft</option><option value="sqm">sqm</option>
                </select>)}
              {field("bedrooms", t("f.bedrooms"),
                <input type="number" min="0" step="1" name="bedrooms" className={inputCls} />)}
              {field("bathrooms", t("f.bathrooms"),
                <input type="number" min="0" step="1" name="bathrooms" className={inputCls} />)}
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              {field("carParks", t("f.carParks"),
                <input type="number" min="0" step="1" name="carParks" className={inputCls} />)}
              {field("floorLevel", t("f.floorLevel"),
                <input name="floorLevel" className={inputCls} />)}
              {field("furnishing", t("f.furnishing"),
                <select name="furnishing" defaultValue="" className={inputCls}>
                  <option value="">—</option>
                  <option value="unfurnished">{t("furn.unfurnished")}</option>
                  <option value="partially">{t("furn.partially")}</option>
                  <option value="fully">{t("furn.fully")}</option>
                </select>)}
              {field("vacant", t("f.vacant"),
                <select name="vacant" defaultValue="" className={inputCls}>
                  <option value="">—</option>
                  <option value="yes">{t("yes")}</option>
                  <option value="no">{t("no")}</option>
                </select>)}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {field("tenure", t("f.tenure"),
                <input name="tenure" placeholder="Freehold / Leasehold" className={inputCls} />)}
              {field("completionYear", t("f.completionYear"),
                <input type="number" min="1900" max="2100" name="completionYear" className={inputCls} />)}
              {field("availabilityDate", t("f.availabilityDate"),
                <input type="date" name="availabilityDate" className={inputCls} />)}
            </div>
            {field("facilities", t("f.facilities"),
              <input name="facilities" placeholder={t("f.facilitiesHint")} className={inputCls} />)}
          </Section>

          <Section title={t("sectionMarketing")}>
            {field("description", t("f.description"),
              <textarea name="description" rows={3} className={inputCls} />)}
            {field("keySellingPoints", t("f.keySellingPoints"),
              <textarea name="keySellingPoints" rows={2} className={inputCls} />)}
            {field("internalRemarks", t("f.internalRemarks"),
              <textarea name="internalRemarks" rows={2} placeholder={t("f.internalRemarksHint")} className={inputCls} />)}
          </Section>

          <Section title={t("sectionSource")}>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("sourceType", t("f.sourceType"),
                <select name="sourceType" defaultValue="direct_written_appointment" className={inputCls}>
                  {SOURCE_TYPES.map((s) => (
                    <option key={s} value={s}>{t(`sources.${s}`)}</option>
                  ))}
                </select>)}
              {field("appointmentStatus", t("f.appointmentStatus"),
                <select name="appointmentStatus" defaultValue="" className={inputCls}>
                  <option value="">—</option>
                  <option value="written_appointment">{t("appt.written_appointment")}</option>
                  <option value="appointment_pending">{t("appt.appointment_pending")}</option>
                  <option value="verbal_authorisation">{t("appt.verbal_authorisation")}</option>
                  <option value="none">{t("appt.none")}</option>
                </select>)}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("ownerConfirmationStatus", t("f.ownerConfirmation"),
                <select name="ownerConfirmationStatus" defaultValue="" className={inputCls}>
                  <option value="">—</option>
                  <option value="confirmed">{t("owner.confirmed")}</option>
                  <option value="pending">{t("owner.pending")}</option>
                  <option value="not_obtained">{t("owner.not_obtained")}</option>
                </select>)}
              {field("sourcePermission", t("f.sourcePermission"),
                <select name="sourcePermission" defaultValue="" className={inputCls}>
                  <option value="">—</option>
                  <option value="yes">{t("yes")}</option>
                  <option value="no">{t("no")}</option>
                </select>)}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {field("sourceAgentName", t("f.sourceAgentName"),
                <input name="sourceAgentName" placeholder={t("f.ifIndirect")} className={inputCls} />)}
              {field("sourceAgency", t("f.sourceAgency"),
                <input name="sourceAgency" placeholder={t("f.ifIndirect")} className={inputCls} />)}
              {field("chainAgentCount", t("f.chainAgentCount"),
                <input type="number" min="0" step="1" name="chainAgentCount" className={inputCls} />)}
            </div>
          </Section>

          <Section title={t("sectionCobroke")}>
            <p className="text-xs text-muted">{t("cobrokeHint")}</p>
            <div className="grid gap-4 sm:grid-cols-4">
              {field("commissionType", t("f.commissionType"),
                <select name="commissionType" defaultValue="" className={inputCls}>
                  <option value="">—</option>
                  <option value="percentage">{t("comm.percentage")}</option>
                  <option value="fixed">{t("comm.fixed")}</option>
                  <option value="rental_months">{t("comm.rental_months")}</option>
                </select>)}
              {field("commissionPercentage", t("f.commissionPercentage"),
                <input type="number" min="0" max="100" step="0.01" name="commissionPercentage" className={inputCls} />)}
              {field("commissionAmount", t("f.commissionAmount"),
                <input type="number" min="0" step="0.01" name="commissionAmount" className={inputCls} />)}
              {field("commissionMonths", t("f.commissionMonths"),
                <input type="number" min="0" step="0.5" name="commissionMonths" className={inputCls} />)}
            </div>
            {field("commissionConditions", t("f.commissionConditions"),
              <input name="commissionConditions" className={inputCls} />)}
            <div className="rounded-lg bg-surface p-4">
              <p className="mb-2 text-sm font-medium">{t("splitTitle")}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("listingSplit", t("f.listingSplit"),
                  <input type="number" min="0" max="100" step="0.5" name="listingSplit" defaultValue="50" className={inputCls} />)}
                {field("buyerSplit", t("f.buyerSplit"),
                  <input type="number" min="0" max="100" step="0.5" name="buyerSplit" defaultValue="50" className={inputCls} />)}
              </div>
              <p className="mt-2 text-xs text-muted">{t("splitHint")}</p>
            </div>
          </Section>

          <Section title={t("sectionMedia")}>
            <p className="text-xs text-muted">{t("mediaHint")}</p>
            {field("coverImage", t("f.coverImage"),
              <input type="file" name="coverImage" accept=".jpg,.jpeg,.png,.webp" className="block w-full text-sm" />)}
            {field("galleryImages", t("f.galleryImages"),
              <input type="file" name="galleryImages" multiple accept=".jpg,.jpeg,.png,.webp" className="block w-full text-sm" />)}
          </Section>

          <section className="rounded-xl border border-crimson/30 bg-background p-5">
            <h2 className="mb-3 font-semibold">{t("declarationTitle")}</h2>
            <div className="mb-4 max-h-56 overflow-y-auto rounded-lg bg-surface p-4 text-xs leading-5 whitespace-pre-line">
              {declaration?.body ?? "—"}
            </div>
            <label className="flex items-start gap-3 text-sm font-medium">
              <input type="checkbox" name="declarationAccepted" required className="mt-0.5 h-4 w-4 accent-crimson" />
              {t("declarationAccept")}
            </label>
          </section>

          <button type="submit" className="w-full rounded-lg bg-crimson px-4 py-3 font-semibold text-white hover:bg-crimson-strong">
            {t("submitButton")}
          </button>
        </form>
      </main>
    </div>
  );
}
