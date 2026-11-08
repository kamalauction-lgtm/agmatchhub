"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Commercial administration: billing mode, plan pricing, and admin grants.
 *
 * Everything here was SQL-only until now, which meant every "give this agent
 * twenty more slots" was a developer task with no audit line and no reason
 * recorded. These actions are the same operations with an actor, a reason and
 * a timestamp attached.
 *
 * Two rules run through all of it:
 *   · prices are VERSIONED, never edited — a subscription sold on v1 keeps v1
 *   · grants are REVOKED, never deleted — the reversal is history
 */

/* -------------------------------------------------------------------------- */
/* Billing mode                                                                */
/* -------------------------------------------------------------------------- */

const billingSchema = z.object({
  mode: z.enum(["FREE_LAUNCH", "SHADOW_BILLING", "LIVE_BILLING"]),
  confirm: z.string().optional(),
});

export async function setBillingMode(formData: FormData): Promise<void> {
  const actor = await requireCapability("commercial.manage");
  const parsed = billingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/commercial?notice=invalid");
  const { mode, confirm } = parsed.data;

  /* Turning on real billing starts charging real people. It is the single
   * highest-impact switch in the platform, so it needs the word typed out —
   * a dropdown and a Save button is not enough friction for that. */
  if (mode === "LIVE_BILLING" && confirm !== "LIVE_BILLING") {
    redirect("/admin/commercial?notice=confirm_required");
  }

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("commercial_settings").select("billing_mode").eq("id", true).maybeSingle();

  const { error } = await supabase
    .from("commercial_settings")
    .update({ billing_mode: mode, updated_by: actor.id })
    .eq("id", true);

  if (error) {
    console.error("setBillingMode failed", error.code, error.message);
    redirect("/admin/commercial?notice=failed");
  }

  await logAudit({
    action: "commercial.billing_mode_changed",
    entityType: "commercial_settings",
    previous: { billing_mode: current?.billing_mode },
    next: { billing_mode: mode },
  });

  revalidatePath("/admin/commercial");
  redirect("/admin/commercial?notice=billing_mode_set");
}

/* -------------------------------------------------------------------------- */
/* Plan pricing                                                                */
/* -------------------------------------------------------------------------- */

const priceSchema = z.object({
  planId: z.string().uuid(),
  /* One price list per currency (Decision 4): the form says which list it is
   * repricing, and a currency with no current version yet gets its v1 here. */
  currency: z.enum(["MYR", "IDR", "USD"]),
  monthlyPrice: z.coerce.number().min(0),
  annualPrice: z.coerce.number().min(0),
  note: z.string().trim().max(200).optional(),
});

export async function repricePlan(formData: FormData): Promise<void> {
  const actor = await requireCapability("commercial.manage");
  const parsed = priceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/commercial?notice=invalid");
  const { planId, currency, monthlyPrice, annualPrice, note } = parsed.data;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("plan_versions")
    .select("id, version, monthly_price, annual_price, currency")
    .eq("plan_id", planId)
    .eq("currency", currency)
    .eq("is_current", true)
    .maybeSingle();

  if (!current) {
    // First version in this currency. Entitlements are inherited by trigger.
    const { error } = await supabase.from("plan_versions").insert({
      plan_id: planId, version: 1, currency, monthly_price: monthlyPrice, annual_price: annualPrice,
      note: note || null, is_current: true, created_by: actor.id,
    });
    if (error) {
      console.error("repricePlan first-version failed", error.code, error.message);
      redirect("/admin/commercial?notice=failed");
    }
    await logAudit({
      action: "commercial.plan_repriced", entityType: "plan", entityId: planId,
      next: { version: 1, currency, monthly: monthlyPrice, annual: annualPrice, note },
    });
    revalidatePath("/admin/commercial");
    redirect("/admin/commercial?notice=repriced");
  }

  /* A NEW VERSION, not an UPDATE. Overwriting the price would rewrite what
   * every existing subscription was sold at, and there would be no record that
   * the old number ever existed. */
  const { error: closeErr } = await supabase
    .from("plan_versions")
    .update({ is_current: false, effective_until: new Date().toISOString() })
    .eq("id", current.id);
  if (closeErr) {
    console.error("repricePlan close failed", closeErr.message);
    redirect("/admin/commercial?notice=failed");
  }

  const { error } = await supabase.from("plan_versions").insert({
    plan_id: planId,
    version: current.version + 1,
    currency,
    monthly_price: monthlyPrice,
    annual_price: annualPrice,
    note: note || null,
    is_current: true,
    created_by: actor.id,
  });

  if (error) {
    // Put the old version back rather than leave the plan with no current row.
    await supabase
      .from("plan_versions")
      .update({ is_current: true, effective_until: null })
      .eq("id", current.id);
    console.error("repricePlan insert failed", error.code, error.message);
    redirect("/admin/commercial?notice=failed");
  }

  await logAudit({
    action: "commercial.plan_repriced",
    entityType: "plan",
    entityId: planId,
    previous: { version: current.version, currency, monthly: current.monthly_price, annual: current.annual_price },
    next: { version: current.version + 1, currency, monthly: monthlyPrice, annual: annualPrice, note },
  });

  revalidatePath("/admin/commercial");
  redirect("/admin/commercial?notice=repriced");
}

/* -------------------------------------------------------------------------- */
/* Admin grants                                                                */
/* -------------------------------------------------------------------------- */

const grantSchema = z.object({
  userId: z.string().uuid(),
  entitlementKey: z.string().trim().min(3).max(60),
  value: z.coerce.number().int().min(1).max(100000),
  reason: z.string().trim().min(1).max(300),
  days: z.union([z.coerce.number().int().min(1).max(3650), z.literal("")]).optional(),
});

export async function grantEntitlement(formData: FormData): Promise<void> {
  const actor = await requireCapability("commercial.manage");
  const parsed = grantSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/agents?notice=invalid");
  const { userId, entitlementKey, value, reason, days } = parsed.data;

  const supabase = await createClient();

  // Only a key the platform actually knows: a typo would create a grant that
  // resolves against nothing and silently does no good.
  const { data: def } = await supabase
    .from("entitlement_definitions").select("key, value_type").eq("key", entitlementKey).maybeSingle();
  if (!def) redirect(`/admin/agents/${userId}?notice=unknown_entitlement`);

  const until =
    typeof days === "number"
      ? new Date(Date.now() + days * 86_400_000).toISOString()
      : null;

  const { error } = await supabase.from("entitlement_grants").insert({
    user_id: userId,
    entitlement_key: entitlementKey,
    int_value: value,
    source: "admin_grant",
    reason,
    effective_until: until,
    granted_by: actor.id,
  });

  if (error) {
    console.error("grantEntitlement failed", error.code, error.message);
    redirect(`/admin/agents/${userId}?notice=failed`);
  }

  await logAudit({
    action: "commercial.entitlement_granted",
    entityType: "user",
    entityId: userId,
    next: { entitlement: entitlementKey, value, reason, expires: until },
  });

  revalidatePath(`/admin/agents/${userId}`);
  redirect(`/admin/agents/${userId}?notice=granted`);
}

/* -------------------------------------------------------------------------- */
/* Credits (00090) — the admin's hand on the wallet                            */
/* -------------------------------------------------------------------------- */

const creditSchema = z.object({
  userId: z.string().uuid(),
  kind: z.enum(["ai", "boost"]),
  amount: z.coerce.number().int().min(1).max(100000),
  reason: z.enum(["grant", "promotion", "refund", "adjustment", "hero_welcome"]),
  note: z.string().trim().min(1).max(300),
});

/** Add credit of one kind. The RPC refuses anyone without commercial.manage and audits itself. */
export async function grantCredits(formData: FormData): Promise<void> {
  await requireCapability("commercial.manage");
  const parsed = creditSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/agents?notice=invalid");
  const { userId, kind, amount, reason, note } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("credit_grant", {
    p_agent: userId, p_kind: kind, p_amount: amount, p_reason: reason, p_note: note, p_ref_type: "admin", p_ref_id: null,
  });
  if (error) {
    console.error("grantCredits failed", error.code, error.message);
    redirect(`/admin/agents/${userId}?notice=failed`);
  }
  revalidatePath(`/admin/agents/${userId}`);
  redirect(`/admin/agents/${userId}?notice=credited`);
}

const revokeSchema = z.object({
  grantId: z.string().uuid(),
  userId: z.string().uuid(),
  reason: z.string().trim().min(1).max(300),
});

export async function revokeGrant(formData: FormData): Promise<void> {
  const actor = await requireCapability("commercial.manage");
  const parsed = revokeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/agents?notice=invalid");
  const { grantId, userId, reason } = parsed.data;

  const supabase = await createClient();
  // Revoked, not deleted — the row is the evidence that it was ever given.
  const { error } = await supabase
    .from("entitlement_grants")
    .update({ revoked_at: new Date().toISOString(), revoked_by: actor.id, revoke_reason: reason })
    .eq("id", grantId)
    .is("revoked_at", null);

  if (error) {
    console.error("revokeGrant failed", error.code, error.message);
    redirect(`/admin/agents/${userId}?notice=failed`);
  }

  await logAudit({
    action: "commercial.entitlement_revoked",
    entityType: "entitlement_grant",
    entityId: grantId,
    next: { reason },
  });

  revalidatePath(`/admin/agents/${userId}`);
  redirect(`/admin/agents/${userId}?notice=revoked`);
}
