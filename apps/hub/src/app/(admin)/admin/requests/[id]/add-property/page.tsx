import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, requireCapabilityIn } from "@/lib/authz";
import { SOURCE_TYPES } from "@/lib/submissions/core";
import { addPropertyOnBehalf } from "./actions";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

const KNOWN_ERRORS = [
  "invalid_fields", "agent_required", "agent_invalid", "email_in_use",
  "agent_failed", "invalid_file_type", "file_too_large", "upload_failed", "save_failed",
];

function Fieldset({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-background p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default async function AdminAddPropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; fields?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { error, fields } = await searchParams;

  const service = createServiceClient();
  const { data: request } = await service
    .from("property_requests")
    .select("id, human_readable_id, title, currency, country_code")
    .eq("id", id)
    .maybeSingle();
  if (!request) notFound();
  // Read through the service client, so scope is checked here before anything
  // about the request is rendered (P0-a; the action checks the same).
  await requireCapabilityIn("request.manage", request.country_code, "/admin/requests");

  const [{ data: currencies }, { data: countries }, { data: profiles }] = await Promise.all([
    service.from("currencies").select("code").eq("active", true).order("code"),
    service.from("countries").select("code, name").order("name"),
    service.from("profiles").select("id, display_name, agent_status").order("display_name"),
  ]);

  // Attach emails for the picker (no direct FK between profiles and users_private).
  const ids = (profiles ?? []).map((p) => p.id);
  const { data: privs } = ids.length
    ? await service.from("users_private").select("user_id, email").in("user_id", ids)
    : { data: [] as { user_id: string; email: string | null }[] };
  const emailById = new Map((privs ?? []).map((p) => [p.user_id, p.email ?? ""]));

  const requestCountry = countries?.find((c) => c.code === request.country_code);

  const t = await getTranslations("submit");
  const ta = await getTranslations("adminAddProperty");

  const bad = new Set((fields ?? "").split(",").filter(Boolean));
  const field = (name: string, label: string, node: React.ReactNode) => (
    <label className="block text-sm" key={name}>
      <span className="mb-1 block font-medium">
        {label}
        {bad.has(name) && <span className="ml-2 text-xs text-crimson">*</span>}
      </span>
      {node}
    </label>
  );

  return (
    <div>
      <Link href={`/admin/requests/${id}`} className="text-sm text-muted hover:text-foreground">
        ← {request.human_readable_id}
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold">{ta("title")}</h1>
      <p className="mb-6 text-sm text-muted">
        {ta("forRequirement", { title: request.title })}
      </p>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {ta(`errors.${KNOWN_ERRORS.includes(error) ? error : "save_failed"}`)}
        </p>
      )}

      <form action={addPropertyOnBehalf} className="max-w-3xl space-y-6">
        <input type="hidden" name="requestId" value={id} />

        {/* Which agent -------------------------------------------------- */}
        <Fieldset title={ta("agentSection")}>
          <label className="flex items-start gap-3 text-sm">
            <input type="radio" name="agentMode" value="existing" defaultChecked className="mt-1 h-4 w-4 accent-crimson" />
            <span className="flex-1">
              <span className="mb-1 block font-medium">{ta("existingAgent")}</span>
              <select name="agentId" className={inputCls} defaultValue="">
                <option value="">{ta("chooseAgent")}</option>
                {(profiles ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name || emailById.get(p.id) || p.id}
                    {emailById.get(p.id) ? ` — ${emailById.get(p.id)}` : ""}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label className="flex items-start gap-3 border-t border-line pt-4 text-sm">
            <input type="radio" name="agentMode" value="new" className="mt-1 h-4 w-4 accent-crimson" />
            <span className="flex-1">
              <span className="mb-2 block font-medium">{ta("newAgent")}</span>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("displayName", ta("na_name"), <input name="displayName" className={inputCls} />)}
                {field("email", ta("na_email"), <input type="email" name="email" className={inputCls} />)}
                {field("mobileNumber", ta("na_phone"), <input name="mobileNumber" className={inputCls} />)}
                {field("whatsappNumber", ta("na_whatsapp"), <input name="whatsappNumber" className={inputCls} />)}
                {field("agencyName", ta("na_agency"), <input name="agencyName" className={inputCls} />)}
                {field("licenceNumber", ta("na_licenceNumber"), <input name="licenceNumber" className={inputCls} />)}
              </div>
              <p className="mt-2 text-xs text-muted">{ta("newAgentHint")}</p>
            </span>
          </label>
        </Fieldset>

        {/* Property ----------------------------------------------------- */}
        <Fieldset title={t("sectionProperty")}>
          {field("title", t("f.title"), <input name="title" required minLength={5} maxLength={200} className={inputCls} />)}
          <div className="grid gap-4 sm:grid-cols-3">
            {field("propertyCategory", t("f.category"),
              <select name="propertyCategory" defaultValue="residential" className={inputCls}>
                {["residential", "commercial", "industrial", "land", "other"].map((c) => (
                  <option key={c} value={c}>{t(`categories.${c}`)}</option>
                ))}
              </select>)}
            {field("propertyType", t("f.propertyType"), <input name="propertyType" className={inputCls} />)}
            {field("buildingName", t("f.buildingName"), <input name="buildingName" className={inputCls} />)}
          </div>
          {field("countrySearch", t("f.country"),
            <>
              <input name="countrySearch" list="country-list" placeholder={requestCountry?.name ?? ""} className={inputCls} />
              <datalist id="country-list">
                {(countries ?? []).map((c) => <option key={c.code} value={c.name} />)}
              </datalist>
            </>)}
          <div className="grid gap-4 sm:grid-cols-3">
            {field("city", t("f.city"), <input name="city" className={inputCls} />)}
            {field("district", t("f.district"), <input name="district" className={inputCls} />)}
            {field("stateRegion", t("f.stateRegion"), <input name="stateRegion" className={inputCls} />)}
          </div>
          {field("generalAddress", t("f.generalAddress"),
            <input name="generalAddress" placeholder={t("f.generalAddressHint")} className={inputCls} />)}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("fullAddress", t("f.fullAddress"), <input name="fullAddress" placeholder={t("agentOnly")} className={inputCls} />)}
            {field("unitNumber", t("f.unitNumber"), <input name="unitNumber" placeholder={t("agentOnly")} className={inputCls} />)}
          </div>
        </Fieldset>

        <Fieldset title={t("sectionPricing")}>
          <div className="grid gap-4 sm:grid-cols-5">
            {field("currency", t("f.currency"),
              <select name="currency" defaultValue={request.currency ?? "MYR"} className={inputCls}>
                {(currencies ?? []).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>)}
            {field("askingPrice", t("f.askingPrice"), <input type="number" min="0" step="0.01" name="askingPrice" className={inputCls} />)}
            {field("monthlyRental", t("f.rentAmount"), <input type="number" min="0" step="0.01" name="monthlyRental" className={inputCls} />)}
            {field("rentPeriod", t("f.rentPeriod"),
              <select name="rentPeriod" defaultValue="monthly" className={inputCls}>
                <option value="monthly">{t("periods.monthly")}</option>
                <option value="yearly">{t("periods.yearly")}</option>
              </select>)}
            {field("negotiable", t("f.negotiable"),
              <select name="negotiable" defaultValue="subject_to_offer" className={inputCls}>
                <option value="yes">{t("f.negYes")}</option>
                <option value="no">{t("f.negNo")}</option>
                <option value="subject_to_offer">{t("f.negSubject")}</option>
              </select>)}
          </div>
          {field("minAcceptablePrice", t("f.minAcceptablePrice"),
            <input type="number" min="0" step="0.01" name="minAcceptablePrice" placeholder={t("f.minPriceHint")} className={inputCls} />)}
        </Fieldset>

        <Fieldset title={t("sectionSpecs")}>
          <div className="grid gap-4 sm:grid-cols-4">
            {field("builtUp", t("f.builtUp"), <input type="number" min="0" step="0.01" name="builtUp" className={inputCls} />)}
            {field("measurementUnit", t("f.unit"),
              <select name="measurementUnit" defaultValue="sqft" className={inputCls}>
                <option value="sqft">sqft</option><option value="sqm">sqm</option>
              </select>)}
            {field("bedrooms", t("f.bedrooms"), <input type="number" min="0" step="1" name="bedrooms" className={inputCls} />)}
            {field("bathrooms", t("f.bathrooms"), <input type="number" min="0" step="1" name="bathrooms" className={inputCls} />)}
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            {field("carParks", t("f.carParks"), <input type="number" min="0" step="1" name="carParks" className={inputCls} />)}
            {field("floorLevel", t("f.floorLevel"), <input name="floorLevel" className={inputCls} />)}
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
          {field("facilities", t("f.facilities"), <input name="facilities" placeholder={t("f.facilitiesHint")} className={inputCls} />)}
        </Fieldset>

        <Fieldset title={t("sectionMarketing")}>
          {field("description", t("f.description"), <textarea name="description" rows={3} className={inputCls} />)}
          {field("keySellingPoints", t("f.keySellingPoints"), <textarea name="keySellingPoints" rows={2} className={inputCls} />)}
          {field("internalRemarks", t("f.internalRemarks"),
            <textarea name="internalRemarks" rows={2} placeholder={t("f.internalRemarksHint")} className={inputCls} />)}
        </Fieldset>

        <Fieldset title={t("sectionSource")}>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("sourceType", t("f.sourceType"),
              <select name="sourceType" defaultValue="direct_written_appointment" className={inputCls}>
                {SOURCE_TYPES.map((s) => <option key={s} value={s}>{t(`sources.${s}`)}</option>)}
              </select>)}
            {field("sourcePermission", t("f.sourcePermission"),
              <select name="sourcePermission" defaultValue="" className={inputCls}>
                <option value="">—</option>
                <option value="yes">{t("yes")}</option>
                <option value="no">{t("no")}</option>
              </select>)}
          </div>
        </Fieldset>

        <Fieldset title={t("sectionCobroke")}>
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
          {field("commissionConditions", t("f.commissionConditions"), <input name="commissionConditions" className={inputCls} />)}
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
        </Fieldset>

        <Fieldset title={t("sectionMedia")}>
          <p className="text-xs text-muted">{t("mediaHint")}</p>
          {field("coverImage", t("f.coverImage"),
            <input type="file" name="coverImage" accept=".jpg,.jpeg,.png,.webp" className="block w-full text-sm" />)}
          {field("galleryImages", t("f.galleryImages"),
            <input type="file" name="galleryImages" multiple accept=".jpg,.jpeg,.png,.webp" className="block w-full text-sm" />)}
        </Fieldset>

        <p className="rounded-lg bg-surface px-4 py-3 text-xs text-muted">{ta("declarationNote")}</p>

        <button type="submit" className="w-full rounded-lg bg-crimson px-4 py-3 font-semibold text-white hover:bg-crimson-strong">
          {ta("submit")}
        </button>
      </form>
    </div>
  );
}
