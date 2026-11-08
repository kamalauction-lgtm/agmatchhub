import "server-only";
import { z } from "zod";
import { runAi, type DeniedReason } from "./engine";
import { ruleQualify, type QualifyInput, type Qualification } from "./qualifier-rules";

/**
 * The Lead Qualifier. Rules first (free, instant, honest), then the model is
 * asked to read the enquiry properly and say why. Either way the result is a
 * sort key with a sentence attached — never a reason to hide a lead.
 */
export type QualifierResult = Qualification & { source: "ai" | "rules"; reason_code?: DeniedReason | "failed"; model?: string };

const schema = z.object({
  intent: z.number().int().min(1).max(5),
  reason: z.string().min(5).max(240),
  signals: z.array(z.string().min(2).max(60)).max(4).default([]),
  suggested_action: z.string().min(3).max(160),
});

export async function qualify(
  input: QualifyInput & { listing: Record<string, unknown>; history: Record<string, unknown>; userId: string; leadId: string },
): Promise<QualifierResult> {
  const floor = ruleQualify(input);
  const res = await runAi(
    "lead_qualify",
    {
      enquiry: { message: input.message ?? "", inquiry_type: input.inquiryType },
      listing: input.listing,
      history: input.history,
      rules_estimate: { intent: floor.intent, signals: floor.signals },
    },
    schema,
    { userId: input.userId, locale: input.locale, refType: "lead", refId: input.leadId },
  );
  if (res.ok) {
    return {
      intent: res.output.intent as Qualification["intent"],
      reason: res.output.reason,
      signals: res.output.signals,
      suggestedAction: res.output.suggested_action,
      source: "ai",
      model: `${res.provider}/${res.model}`,
    };
  }
  return { ...floor, source: "rules", reason_code: res.kind === "denied" ? res.reason : "failed" };
}
