"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Admin: the payment registry (Decision 8). Three things an admin can do —
 * switch a gateway off / sandbox / live, price a credit pack per currency,
 * and read what happened. Going live needs the word typed AND the database
 * trigger agreeing (billing mode LIVE_BILLING); the action alone cannot do it.
 */

function done(notice: string): never {
  redirect(`/admin/payments?notice=${notice}`);
}

const modeSchema = z.object({
  key: z.enum(["billplz", "midtrans", "stripe"]),
  mode: z.enum(["off", "sandbox", "live"]),
  confirm: z.string().optional(),
});

export async function setProviderMode(formData: FormData): Promise<void> {
  const actor = await requireCapability("commercial.manage");
  const parsed = modeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) done("invalid");
  const { key, mode, confirm } = parsed.data;
  if (mode === "live" && confirm !== "LIVE") done("confirm_required");

  const supabase = await createClient();
  const { data: before } = await supabase.from("payment_providers").select("mode").eq("key", key).maybeSingle();
  const { error } = await supabase.from("payment_providers").update({ mode, updated_by: actor.id }).eq("key", key);
  if (error) {
    // 23514 is the trigger: live while billing is not LIVE_BILLING.
    console.error("setProviderMode", error.code, error.message);
    done(error.code === "23514" ? "not_live_billing" : "failed");
  }
  await logAudit({ action: "payment.provider_mode_changed", entityType: "payment_provider", entityId: key, previous: { mode: before?.mode }, next: { mode } });
  revalidatePath("/admin/payments");
  revalidatePath("/plan");
  done("mode_set");
}

const packPriceSchema = z.object({
  packKey: z.string().min(2).max(40),
  currency: z.enum(["MYR", "IDR", "USD"]),
  price: z.coerce.number().min(0).max(100_000_000),
});

export async function setPackPrice(formData: FormData): Promise<void> {
  const actor = await requireCapability("commercial.manage");
  const parsed = packPriceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) done("invalid");
  const { packKey, currency, price } = parsed.data;
  const supabase = await createClient();
  const { data: before } = await supabase.from("credit_pack_prices").select("price").eq("pack_key", packKey).eq("currency", currency).maybeSingle();
  const { error } = price > 0
    ? await supabase.from("credit_pack_prices").upsert({ pack_key: packKey, currency, price, updated_by: actor.id, updated_at: new Date().toISOString() })
    : await supabase.from("credit_pack_prices").delete().eq("pack_key", packKey).eq("currency", currency);
  if (error) { console.error("setPackPrice", error.message); done("failed"); }
  await logAudit({ action: "payment.pack_priced", entityType: "credit_pack", entityId: packKey, previous: { currency, price: before?.price ?? null }, next: { currency, price: price > 0 ? price : null } });
  revalidatePath("/admin/payments");
  revalidatePath("/plan");
  done("priced");
}
