import "server-only";
import { z } from "zod";

/**
 * Shared property-submission core so the agent flow (/r/[token]/submit) and the
 * admin on-behalf flow (/admin/requests/[id]/add-property) validate and build
 * the exact same row — one source of truth for the property fields, risk
 * derivation, and the DB insert shape.
 */

const optNum = z.string().trim().transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().nonnegative().nullable());
const optInt = z.string().trim().transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().int().nonnegative().nullable());
const optText = z.string().trim().max(5000).transform((v) => (v === "" ? null : v));

export const SOURCE_TYPES = [
  "direct_written_appointment", "direct_appointment_pending",
  "direct_verbal_authorisation", "direct_no_appointment", "indirect_other_agent",
  "co_agent", "agency_shared", "developer", "landlord_referral", "open_market", "other",
] as const;

/** Every property field except the SA declaration tick (which is flow-specific). */
export const propertyFieldsSchema = z.object({
  title: z.string().trim().min(3).max(200),
  propertyCategory: z.enum(["residential", "commercial", "industrial", "land", "other"]),
  propertyType: optText,
  countrySearch: z.string().trim().max(80),
  stateRegion: optText,
  city: z.string().trim().max(120),
  district: optText,
  fullAddress: optText,
  generalAddress: optText,
  buildingName: optText,
  unitNumber: optText,
  currency: z.string().length(3),
  askingPrice: optNum,
  monthlyRental: optNum,
  rentPeriod: z.enum(["monthly", "yearly"]).catch("monthly"),
  negotiable: z.enum(["yes", "no", "subject_to_offer"]),
  minAcceptablePrice: optNum,
  measurementUnit: z.enum(["sqft", "sqm"]),
  builtUp: optNum,
  landArea: optNum,
  bedrooms: optInt,
  bathrooms: optInt,
  carParks: optInt,
  floorLevel: optText,
  furnishing: z.enum(["", "unfurnished", "partially", "fully"]),
  tenure: optText,
  completionYear: optInt,
  availabilityDate: z.string().trim().transform((v) => (v === "" ? null : v))
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  vacant: z.enum(["", "yes", "no"]),
  facilities: optText,
  description: optText,
  keySellingPoints: optText,
  clientSafeRemarks: optText,
  internalRemarks: optText,
  ownerConfirmationStatus: z.enum(["", "confirmed", "pending", "not_obtained"]),
  appointmentStatus: z.enum(["", "written_appointment", "appointment_pending", "verbal_authorisation", "none"]),
  sourceType: z.enum(SOURCE_TYPES),
  sourceAgentName: optText,
  sourceAgency: optText,
  sourcePermission: z.enum(["", "yes", "no"]),
  chainAgentCount: optInt,
  commissionType: z.enum(["", "percentage", "fixed", "rental_months"]),
  commissionPercentage: optNum,
  commissionAmount: optNum,
  commissionMonths: optNum,
  commissionConditions: optText,
  // §73: proposed sharing of the received commission, default 50:50
  listingSplit: optNum,
  buyerSplit: optNum,
});

export type PropertyFields = z.infer<typeof propertyFieldsSchema>;

export function deriveRisk(sourceType: string, permission: string): string {
  switch (sourceType) {
    case "direct_written_appointment":
    case "direct_appointment_pending":
    case "direct_verbal_authorisation":
    case "developer":
    case "landlord_referral":
      return "direct_document_pending";
    case "direct_no_appointment":
    case "other":
      return "high_risk";
    case "indirect_other_agent":
    case "co_agent":
    case "agency_shared":
      return permission === "yes" ? "indirect_verified_source" : "indirect_limited_verification";
    case "open_market":
      return "open_market_confirmation_required";
    default:
      return "high_risk";
  }
}

export const IMG_MIMES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};
export const MAX_IMG_BYTES = 10 * 1024 * 1024;

/**
 * Build the property_submissions insert row from validated fields. When
 * createdByAdminId is set the row was entered by an admin on behalf of the
 * supply agent, but is otherwise identical to an agent-entered submission.
 */
export function buildSubmissionRow(
  d: PropertyFields,
  opts: {
    humanId: string;
    requestId: string;
    supplyAgentId: string;
    countryCode: string;
    risk: string;
    createdByAdminId?: string | null;
  },
) {
  return {
    human_readable_id: opts.humanId,
    request_id: opts.requestId,
    supply_agent_id: opts.supplyAgentId,
    created_by_admin_id: opts.createdByAdminId ?? null,
    status: "submitted",
    title: d.title,
    property_category: d.propertyCategory,
    property_type: d.propertyType,
    country_code: opts.countryCode,
    state_region: d.stateRegion,
    city: d.city,
    district: d.district,
    full_address: d.fullAddress,
    general_address: d.generalAddress,
    building_name: d.buildingName,
    unit_number: d.unitNumber,
    currency: d.currency,
    asking_price: d.askingPrice,
    monthly_rental: d.monthlyRental,
    rent_period: d.rentPeriod,
    negotiable: d.negotiable,
    measurement_unit: d.measurementUnit,
    built_up: d.builtUp,
    land_area: d.landArea,
    bedrooms: d.bedrooms,
    bathrooms: d.bathrooms,
    car_parks: d.carParks,
    floor_level: d.floorLevel,
    furnishing: d.furnishing || null,
    tenure: d.tenure,
    completion_year: d.completionYear,
    availability_date: d.availabilityDate,
    vacant: d.vacant === "" ? null : d.vacant === "yes",
    facilities: d.facilities ? d.facilities.split(",").map((s) => s.trim()).filter(Boolean) : [],
    description: d.description,
    key_selling_points: d.keySellingPoints,
    client_safe_remarks: d.clientSafeRemarks,
    owner_confirmation_status: d.ownerConfirmationStatus || null,
    appointment_status: d.appointmentStatus || null,
    source_type: d.sourceType,
    risk_indicator: opts.risk,
    cobroke_accepted: true,
    commission_type: d.commissionType || null,
    commission_percentage: d.commissionPercentage,
    commission_amount: d.commissionAmount,
    commission_months: d.commissionMonths,
    commission_currency: d.commissionType ? d.currency : null,
    commission_conditions: d.commissionConditions,
  };
}

/** Whether this submission carries source-chain detail worth a sources row. */
export function hasSourceDetail(sourceType: string): boolean {
  return sourceType.startsWith("indirect") ||
    ["co_agent", "agency_shared", "other"].includes(sourceType);
}
