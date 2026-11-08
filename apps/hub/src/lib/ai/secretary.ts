import "server-only";
import { z } from "zod";
import { runAi, type DeniedReason } from "./engine";
import { ruleReply, firstNameOf, type ReplyInput } from "./secretary-rules";

/**
 * The AI Communication Secretary.
 *
 * Given a lead (the enquiry, who asked, which listing) it drafts the reply the
 * agent will edit and send from their own WhatsApp or through the platform's
 * e-mail. The deterministic reply is the floor; the model is asked to do better
 * from the same facts; the agent always sees which one they got.
 *
 * The enquirer's phone and e-mail never go to the model: the engine redacts
 * string inputs by default, and the Secretary only ever needs the first name.
 */

export type SecretaryDraft = {
  reply: string;
  nextStep: string;
  questions: string[];
  source: "ai" | "rules";
  reason?: DeniedReason | "failed";
  model?: string;
};

const schema = z.object({
  reply: z.string().min(40).max(1400),
  next_step: z.string().min(3).max(200),
  questions_to_ask: z.array(z.string().min(3).max(160)).max(3).default([]),
});

export async function draftReply(
  input: ReplyInput & {
    message: string | null;
    listing: Record<string, unknown>;
    userId: string;
    leadId: string;
  },
): Promise<SecretaryDraft> {
  const floor = ruleReply(input);

  const res = await runAi(
    "secretary_reply",
    {
      enquiry: {
        message: input.message ?? "",
        first_name: input.firstName,
        inquiry_type: input.inquiryType,
        language: input.locale,
      },
      listing: input.listing,
      channel: input.channel,
      agent_name: input.agentName,
      deterministic_reply: floor.reply,
      length_limit: input.channel === "whatsapp" ? 700 : 1200,
    },
    schema,
    { userId: input.userId, locale: input.locale, refType: "lead", refId: input.leadId },
  );

  if (res.ok) {
    return {
      reply: res.output.reply,
      nextStep: res.output.next_step,
      questions: res.output.questions_to_ask,
      source: "ai",
      model: `${res.provider}/${res.model}`,
    };
  }
  return { ...floor, source: "rules", reason: res.kind === "denied" ? res.reason : "failed" };
}

export { firstNameOf };
