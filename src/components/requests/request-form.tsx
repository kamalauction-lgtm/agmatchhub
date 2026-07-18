import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { saveRequest } from "@/app/(agent)/requests/actions";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

type RequestRow = Record<string, unknown> & { id?: string };

/** Shared create/edit requirement form (§13 core fields). */
export async function RequestForm({ existing }: { existing?: RequestRow }) {
  const t = await getTranslations("requests.form");
  const supabase = await createClient();
  const [{ data: countries }, { data: currencies }] = await Promise.all([
    supabase.from("countries").select("code, name, default_currency, measurement_unit").eq("active", true).order("name"),
    supabase.from("currencies").select("code").eq("active", true).order("code"),
  ]);

  const v = (k: string) => (existing?.[k] ?? "") as string | number;

  const field = (name: string, label: string, extra: React.ReactNode) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {extra}
    </label>
  );

  return (
    <form action={saveRequest} className="space-y-6">
      {existing?.id && <input type="hidden" name="id" value={existing.id} />}

      <section className="space-y-4 rounded-xl border border-line p-5">
        <h2 className="font-semibold">{t("sectionGeneral")}</h2>
        {field("title", t("title"),
          <input name="title" required minLength={5} maxLength={200} defaultValue={v("title")} className={inputCls} />)}
        {field("description", t("description"),
          <textarea name="description" rows={3} defaultValue={v("description")} className={inputCls} />)}
        <div className="grid gap-4 sm:grid-cols-4">
          {field("transactionType", t("transactionType"),
            <select name="transactionType" defaultValue={v("transaction_type") || "buy"} className={inputCls}>
              <option value="buy">{t("buy")}</option>
              <option value="rent">{t("rent")}</option>
            </select>)}
          {field("propertyCategory", t("propertyCategory"),
            <select name="propertyCategory" defaultValue={v("property_category") || "residential"} className={inputCls}>
              {["residential", "commercial", "industrial", "land", "other"].map((c) => (
                <option key={c} value={c}>{t(`categories.${c}`)}</option>
              ))}
            </select>)}
          {field("clientType", t("clientType"),
            <select name="clientType" defaultValue={v("client_type") || "individual"} className={inputCls}>
              {["individual", "company", "organisation"].map((c) => (
                <option key={c} value={c}>{t(`clientTypes.${c}`)}</option>
              ))}
            </select>)}
          {field("priority", t("priority"),
            <select name="priority" defaultValue={v("priority") || "normal"} className={inputCls}>
              {["normal", "high", "urgent"].map((p) => (
                <option key={p} value={p}>{t(`priorities.${p}`)}</option>
              ))}
            </select>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("submissionDeadline", t("submissionDeadline"),
            <input type="date" name="submissionDeadline" defaultValue={v("submission_deadline")} className={inputCls} />)}
          {field("expiryDate", t("expiryDate"),
            <input type="date" name="expiryDate" defaultValue={v("expiry_date")} className={inputCls} />)}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-line p-5">
        <h2 className="font-semibold">{t("sectionLocation")}</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          {field("countryCode", t("country"),
            <select name="countryCode" defaultValue={v("country_code") || "MY"} className={inputCls}>
              {(countries ?? []).map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>)}
          {field("stateRegion", t("stateRegion"),
            <input name="stateRegion" defaultValue={v("state_region")} className={inputCls} />)}
          {field("city", t("city"),
            <input name="city" required minLength={2} defaultValue={v("city")} className={inputCls} />)}
          {field("district", t("district"),
            <input name="district" defaultValue={v("district")} className={inputCls} />)}
        </div>
        {field("preferredAreas", t("preferredAreas"),
          <input name="preferredAreas" placeholder={t("preferredAreasHint")}
            defaultValue={Array.isArray(existing?.preferred_areas) ? (existing.preferred_areas as string[]).join(", ") : ""}
            className={inputCls} />)}
      </section>

      <section className="space-y-4 rounded-xl border border-line p-5">
        <h2 className="font-semibold">{t("sectionFinancial")}</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          {field("currency", t("currency"),
            <select name="currency" defaultValue={v("currency") || "MYR"} className={inputCls}>
              {(currencies ?? []).map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>)}
          {field("budgetMin", t("budgetMin"),
            <input type="number" min="0" step="0.01" name="budgetMin" defaultValue={v("budget_min")} className={inputCls} />)}
          {field("budgetMax", t("budgetMax"),
            <input type="number" min="0" step="0.01" name="budgetMax" defaultValue={v("budget_max")} className={inputCls} />)}
          {field("financing", t("financing"),
            <select name="financing" defaultValue={v("financing") || ""} className={inputCls}>
              <option value="">—</option>
              {["cash", "financing", "pre_approved", "undecided"].map((f) => (
                <option key={f} value={f}>{t(`financingOptions.${f}`)}</option>
              ))}
            </select>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("maxMonthlyRent", t("maxMonthlyRent"),
            <input type="number" min="0" step="0.01" name="maxMonthlyRent" defaultValue={v("max_monthly_rent")} className={inputCls} />)}
          {field("leaseTermMonths", t("leaseTermMonths"),
            <input type="number" min="0" step="1" name="leaseTermMonths" defaultValue={v("lease_term_months")} className={inputCls} />)}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-line p-5">
        <h2 className="font-semibold">{t("sectionProperty")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {field("propertyType", t("propertyType"),
            <input name="propertyType" placeholder={t("propertyTypeHint")} defaultValue={v("property_type")} className={inputCls} />)}
          {field("furnishing", t("furnishing"),
            <select name="furnishing" defaultValue={v("furnishing") || ""} className={inputCls}>
              <option value="">—</option>
              {["any", "unfurnished", "partially", "fully"].map((f) => (
                <option key={f} value={f}>{t(`furnishingOptions.${f}`)}</option>
              ))}
            </select>)}
          {field("measurementUnit", t("unit"),
            <select name="measurementUnit" defaultValue={v("measurement_unit") || "sqft"} className={inputCls}>
              <option value="sqft">sqft</option>
              <option value="sqm">sqm</option>
            </select>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-5">
          {field("minBuiltUp", t("minBuiltUp"),
            <input type="number" min="0" step="0.01" name="minBuiltUp" defaultValue={v("min_built_up")} className={inputCls} />)}
          {field("maxBuiltUp", t("maxBuiltUp"),
            <input type="number" min="0" step="0.01" name="maxBuiltUp" defaultValue={v("max_built_up")} className={inputCls} />)}
          {field("bedroomsMin", t("bedroomsMin"),
            <input type="number" min="0" step="1" name="bedroomsMin" defaultValue={v("bedrooms_min")} className={inputCls} />)}
          {field("bathroomsMin", t("bathroomsMin"),
            <input type="number" min="0" step="1" name="bathroomsMin" defaultValue={v("bathrooms_min")} className={inputCls} />)}
          {field("carParksMin", t("carParksMin"),
            <input type="number" min="0" step="1" name="carParksMin" defaultValue={v("car_parks_min")} className={inputCls} />)}
        </div>
        {field("otherRequirements", t("otherRequirements"),
          <textarea name="otherRequirements" rows={3} defaultValue={v("other_requirements")} className={inputCls} />)}
      </section>

      <section className="space-y-4 rounded-xl border border-line p-5">
        <h2 className="font-semibold">{t("sectionClient")}</h2>
        {field("clientProfileAnonymised", t("clientProfile"),
          <textarea name="clientProfileAnonymised" rows={2} placeholder={t("clientProfileHint")}
            defaultValue={v("client_profile_anonymised")} className={inputCls} />)}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("expectedMoveIn", t("expectedMoveIn"),
            <input type="date" name="expectedMoveIn" defaultValue={v("expected_move_in")} className={inputCls} />)}
        </div>
        {field("internalNotes", t("internalNotes"),
          <textarea name="internalNotes" rows={2} placeholder={t("internalNotesHint")}
            defaultValue={v("internal_notes")} className={inputCls} />)}
      </section>

      <div className="flex gap-3">
        <button name="intent" value="draft" type="submit"
          className="rounded-lg border border-line px-5 py-2.5 font-semibold hover:border-crimson hover:text-crimson">
          {t("saveDraft")}
        </button>
        <button name="intent" value="submit" type="submit"
          className="rounded-lg bg-crimson px-5 py-2.5 font-semibold text-white hover:bg-crimson-strong">
          {t("submitForApproval")}
        </button>
      </div>
    </form>
  );
}
