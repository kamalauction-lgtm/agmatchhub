import "server-only";
import { z } from "zod";
import { runAi, type DeniedReason } from "./engine";
import { ruleRequirement, type RequirementDraft } from "./requirement-rules";

/**
 * The Buyer Profile Builder: a pasted chat → a structured requirement the
 * agent confirms field by field on /requests/new. Nothing is saved here.
 */
export type RequirementResult = RequirementDraft & { source: "ai" | "rules"; reason?: DeniedReason | "failed"; model?: string };

const schema = z.object({
  transaction_type: z.enum(["buy", "rent"]).nullable(),
  property_category: z.enum(["residential", "commercial", "industrial", "land"]).nullable(),
  property_type: z.string().max(60).nullable(),
  city: z.string().max(80).nullable(),
  state_region: z.string().max(80).nullable(),
  preferred_areas: z.array(z.string().max(80)).max(8).default([]),
  budget_min: z.number().nullable(),
  budget_max: z.number().nullable(),
  max_monthly_rent: z.number().nullable(),
  bedrooms_min: z.number().int().nullable(),
  bathrooms_min: z.number().int().nullable(),
  car_parks_min: z.number().int().nullable(),
  min_built_up: z.number().nullable(),
  furnishing: z.enum(["unfurnished", "partially", "fully"]).nullable(),
  expected_move_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  other_requirements: z.string().max(1000).nullable(),
  client_profile: z.string().max(400).nullable(),
  title: z.string().min(3).max(80),
  missing: z.array(z.string().max(80)).max(5).default([]),
});

export async function extractRequirement(input: {
  chat: string; userId: string; locale: string; country: string | null; currency: string | null;
}): Promise<RequirementResult> {
  const floor = ruleRequirement(input.chat, { country: input.country, currency: input.currency });
  const res = await runAi(
    "requirement_extract",
    { country: input.country, currency: input.currency, chat: input.chat, rules_draft: floor },
    schema,
    { userId: input.userId, locale: input.locale, refType: "requirement_chat" },
  );
  if (res.ok) {
    const o = res.output;
    // The model may not invent a budget the rules did not see AND the chat does
    // not mention in digits; a budget without any digit in the chat is dropped.
    const hasDigits = /\d/.test(input.chat);
    return {
      ...o,
      budget_min: hasDigits ? o.budget_min : null,
      budget_max: hasDigits ? o.budget_max : null,
      max_monthly_rent: hasDigits ? o.max_monthly_rent : null,
      source: "ai",
      model: `${res.provider}/${res.model}`,
    };
  }
  return { ...floor, source: "rules", reason: res.kind === "denied" ? res.reason : "failed" };
}
