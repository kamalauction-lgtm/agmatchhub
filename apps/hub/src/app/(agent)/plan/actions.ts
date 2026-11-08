"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { startCheckout } from "@/lib/payments";

/**
 * The agent starts (or abandons) a payment. The database decides whether they
 * may and how much it is — `payment_intent_create()` takes WHAT, never an
 * amount — and the adapter turns the row into a checkout at the gateway.
 * Nothing here runs while the `payments` flag is off for this person: the
 * RPC refuses, and the page never shows the button.
 */

function back(notice: string): never {
  redirect(`/plan?pay=${notice}`);
}

const subSchema = z.object({ planVersionId: z.string().uuid(), cadence: z.enum(["monthly", "annual"]), label: z.string().max(80).optional() });
const packSchema = z.object({ packKey: z.string().min(2).max(40), label: z.string().max(80).optional() });
const cancelSchema = z.object({ intentId: z.string().uuid() });

async function createAndGo(rpcArgs: Record<string, unknown>, description: string): Promise<never> {
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("payment_intent_create", rpcArgs);
  if (error || !id) {
    console.error("payment_intent_create", error?.message);
    back(reasonOf(error?.message));
  }
  const out = await startCheckout(String(id), description);
  revalidatePath("/plan");
  if (!out.ok) back(out.reason);
  redirect(out.checkoutUrl);
}

/** Map the RPC's refusals to notices the page can translate. */
function reasonOf(message: string | undefined): string {
  if (!message) return "failed";
  if (/not enabled/.test(message)) return "flag_off";
  if (/no payment provider/.test(message)) return "no_provider";
  if (/nothing to pay/.test(message)) return "nothing_to_pay";
  if (/not priced|not a current/.test(message)) return "not_available";
  if (/LIVE_BILLING/.test(message)) return "not_live";
  return "failed";
}

export async function startSubscriptionCheckout(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = subSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) back("invalid");
  const { planVersionId, cadence, label } = parsed.data;
  await createAndGo({ p_kind: "subscription", p_plan_version_id: planVersionId, p_cadence: cadence, p_pack_key: null }, label || "Plan");
}

export async function startTopupCheckout(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = packSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) back("invalid");
  const { packKey, label } = parsed.data;
  await createAndGo({ p_kind: "topup", p_plan_version_id: null, p_cadence: "monthly", p_pack_key: packKey }, label || "Credits");
}

export async function cancelPayment(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = cancelSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) back("invalid");
  const supabase = await createClient();
  await supabase.rpc("payment_intent_cancel", { p_intent: parsed.data.intentId });
  revalidatePath("/plan");
  redirect(`/plan/payment/${parsed.data.intentId}`);
}
