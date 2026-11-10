import { getTranslations } from "next-intl/server";
import { getCompanions } from "@/lib/ai/cast";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { ListingWizard, type WizardLabels } from "@/components/listings/listing-wizard";
import { createListing } from "../actions";
import { getAgentMarket } from "@/lib/listings/market";
import { PLATFORM_TYPES, TENURES, WIZARD_LOCATION_LEVELS } from "@/lib/listings/vocabulary";

/** Advice keys the wizard can render, flattened for the client component. */
const ADVICE_KEYS = [
  "titleTooShort", "titleTooLong", "titleAllCaps", "titleShouty",
  "titleNoLocation", "titleNoBedrooms", "descTooShort", "descNoLandmark",
  "descNoCta", "descHasPhone", "looksGood",
] as const;

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; field?: string }>;
}) {
  const user = await requireUser();
  const { error, field } = await searchParams;
  const supabase = await createClient();

  const t = await getTranslations("listings.form");
  const tw = await getTranslations("listings.wizard");
  const tt = await getTranslations("propertyTypes");
  const to = await getTranslations("ownershipTypes");
  const ta = await getTranslations("listings.advisor");

  // D8: the wizard is the agent's market, resolved from their own profile.
  const market = await getAgentMarket(supabase, user.id);
  if (!market) {
    return (
      <AgentShell wide>
        <h1 className="mb-1 text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">
          {t("errors.market_unavailable")}
        </p>
      </AgentShell>
    );
  }

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name, level, path_names")
    .eq("country_code", market.country)
    .eq("is_active", true)
    .in("level", [...WIZARD_LOCATION_LEVELS[market.country]])
    .order("path_names")
    .limit(600);

  // next-intl is server-side here, so every string the client wizard needs is
  // resolved now and handed over as plain data. Keeps the message dictionary
  // out of the browser bundle.
  const labels: WizardLabels = {
    progress: tw("progress"),
    step_type: tw("stepType"),
    step_location: tw("stepLocation"),
    step_unit: tw("stepUnit"),
    step_price: tw("stepPrice"),
    step_description: tw("stepDescription"),
    step_photos: tw("stepPhotos"),
    step_review: tw("stepReview"),
    back: tw("back"),
    next: tw("next"),
    submit: tw("submit"),
    submitting: tw("submitting"),
    select: tw("select"),
    decrease: tw("decrease"),
    increase: tw("increase"),
    categoryQ: tw("categoryQ"),
    forQ: tw("forQ"),
    // The examples name the market's own products (a Malaysian agent has no kost).
    catResidentialHint: market.country === "MY" ? tw("catResidentialHintMY") : tw("catResidentialHint"),
    catCommercialHint: market.country === "MY" ? tw("catCommercialHintMY") : tw("catCommercialHint"),
    writeSelf: tw("writeSelf"),
    writeSelfHint: tw("writeSelfHint"),
    writeAi: tw("writeAi"),
    writeAiHint: tw("writeAiHint"),
    aiWorking: tw("aiWorking"),
    checkCopy: tw("checkCopy"),
    titleSuggestions: tw("titleSuggestions"),
    // .raw: the count is only known in the client component, which substitutes
    // {n} itself. Calling tw() here throws FORMATTING_ERROR for the missing arg.
    photosChosen: tw.raw("photosChosen") as string,
    draftRestored: tw("draftRestored"),
    draftPhotosLost: tw("draftPhotosLost"),
    draftContinue: tw("draftContinue"),
    draftStartOver: tw("draftStartOver"),

    // reused from the existing form namespace
    forSale: t("sale"),
    forRent: t("rent"),
    rentPeriod: t("rentPeriod"),
    monthly: t("monthly"),
    yearly: t("yearly"),
    catResidential: t("catResidential"),
    catCommercial: t("catCommercial"),
    propertyType: t("propertyType"),
    area: t("area"),
    generalAddress: t("generalAddress"),
    generalAddressPlaceholder: t("generalAddressPlaceholder"),
    generalAddressHelp: t("generalAddressHelp"),
    buildingName: t("buildingName"),
    postalCode: t("postalCode"),
    bedrooms: t("bedrooms"),
    bathrooms: t("bathrooms"),
    parking: t("parking"),
    floors: t("floors"),
    landSize: t("landSize", { unit: market.unit === "sqft" ? "sq ft" : "m²" }),
    buildingSize: t("buildingSize", { unit: market.unit === "sqft" ? "sq ft" : "m²" }),
    yearBuilt: t("yearBuilt"),
    certificate: market.country === "MY" ? t("tenure") : t("certificate"),
    furnishing: t("furnishing"),
    unfurnished: t("unfurnished"),
    partially: t("partially"),
    fully: t("fully"),
    condition: t("condition"),
    condNew: t("condNew"),
    condExcellent: t("condExcellent"),
    condGood: t("condGood"),
    condRenovation: t("condRenovation"),
    condConstruction: t("condConstruction"),
    facilities: t("facilities"),
    facilitiesPlaceholder: t("facilitiesPlaceholder"),
    price: t("price", { currency: market.currency }),
    priceHelp: t("priceHelp"),
    adTitle: t("adTitle"),
    adTitlePlaceholder: t("adTitlePlaceholder"),
    description: t("description"),
    photosHelp: t("photosHelp"),
    submitHelp: t("submitHelp"),
    // AI Listing Assistant (E3)
    rulesBadge: tw("rulesBadge"),
    aiSource: tw("aiSource"),
    rulesSource: tw("rulesSource"),
    comparables: tw("comparables"),
    sellingPoints: tw("sellingPoints"),
    sellingPointsHint: tw("sellingPointsHint"),
  };
  for (const r of ["quota", "daily_cap", "platform_cap", "circuit_open", "disabled", "feature_off", "unverified", "no_provider", "failed"]) {
    labels[`aiReason_${r}`] = tw(`aiReason.${r}` as never);
  }

  for (const k of ADVICE_KEYS) {
    // Advice messages carry placeholders the rules layer fills at runtime;
    // showing the generic form is honest and avoids inventing numbers here.
    labels[`advice_${k}`] = ta(k, { min: 0, max: 0, n: 0, place: "" });
  }

  const typeLabels = Object.fromEntries([...PLATFORM_TYPES[market.country]].map((p) => [p, tt(p as never)]));
  const ownershipLabels = Object.fromEntries(TENURES[market.country].map((o) => [o, to(o as never)]));

  const cast = await getCompanions(["listing_copywriter"]);
  return (
    <AgentShell wide>
      <h1 className="mb-1 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-sm text-muted">{t("intro")}</p>

      {error && (
        <p className="mb-6 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">
          {t(`errors.${error}` as never)}
          {field ? ` (${field})` : ""}
        </p>
      )}

      <ListingWizard
        companion={cast.listing_copywriter}
        action={createListing}
        locations={(locations ?? []) as { id: string; name: string; level: string; path_names: string[] }[]}
        t={labels}
        typeLabels={typeLabels}
        ownershipLabels={ownershipLabels}
        country={market.country}
        currency={market.currency}
        unit={market.unit}
      />
    </AgentShell>
  );
}
