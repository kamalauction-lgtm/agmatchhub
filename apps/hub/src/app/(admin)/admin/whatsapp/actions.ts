"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Admin: the WhatsApp numbers, the template registry, the opt-out list.
 * Going `live` needs the word typed; `test` reaches only the listed
 * recipients, and the database refuses anyone else before Meta is called.
 */

function done(notice: string): never {
  redirect(`/admin/whatsapp?notice=${notice}`);
}

const accountSchema = z.object({
  id: z.string().uuid(),
  display_phone: z.string().trim().max(32).optional(),
  phone_number_id: z.string().trim().regex(/^\d{0,20}$/).optional(),
  waba_id: z.string().trim().regex(/^\d{0,20}$/).optional(),
  mode: z.enum(["off", "test", "live"]),
  test_recipients: z.string().max(1000).optional(),
  confirm: z.string().optional(),
});

export async function updateWaAccount(formData: FormData): Promise<void> {
  const actor = await requireCapability("platform.configure");
  const parsed = accountSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) done("invalid");
  const a = parsed.data;
  if (a.mode === "live" && a.confirm !== "LIVE") done("confirm_required");
  const recipients = (a.test_recipients ?? "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  if (recipients.some((r) => !/^\+[1-9]\d{7,14}$/.test(r))) done("bad_recipient");
  if (a.mode !== "off" && !a.phone_number_id) done("needs_number");

  const supabase = await createClient();
  const { data: before } = await supabase.from("wa_accounts").select("mode, phone_number_id, display_phone, test_recipients").eq("id", a.id).maybeSingle();
  const patch = {
    display_phone: a.display_phone || null, phone_number_id: a.phone_number_id || null, waba_id: a.waba_id || null,
    mode: a.mode, test_recipients: recipients, updated_by: actor.id,
  };
  const { error } = await supabase.from("wa_accounts").update(patch).eq("id", a.id);
  if (error) { console.error("updateWaAccount", error.message); done("failed"); }
  await logAudit({ action: "whatsapp.account_changed", entityType: "wa_account", entityId: a.id, previous: before, next: patch });
  revalidatePath("/admin/whatsapp");
  revalidatePath("/leads");
  done("saved");
}

const templateSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  account_id: z.string().uuid(),
  name: z.string().trim().regex(/^[a-z0-9_]{3,60}$/),
  language: z.enum(["en", "ms", "id"]),
  category: z.enum(["utility", "marketing", "authentication"]),
  status: z.enum(["draft", "pending", "approved", "rejected", "paused"]),
  body: z.string().trim().min(5).max(1024),
  meta_template_id: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).optional(),
});

export async function upsertWaTemplate(formData: FormData): Promise<void> {
  const actor = await requireCapability("platform.configure");
  const parsed = templateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) done("invalid");
  const t = parsed.data;
  // Meta: a body cannot start or end with a variable, and variables are {{1}}…{{n}} in order.
  const vars = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const n = vars.length ? Math.max(...vars) : 0;
  if (n > 10 || new Set(vars).size !== n || /^\{\{\d+\}\}/.test(t.body) || /\{\{\d+\}\}$/.test(t.body)) done("bad_body");

  const supabase = await createClient();
  const row = { account_id: t.account_id, name: t.name, language: t.language, category: t.category, status: t.status, body: t.body,
                variables: n, meta_template_id: t.meta_template_id || null, note: t.note || null, updated_by: actor.id };
  const { error } = t.id
    ? await supabase.from("wa_templates").update(row).eq("id", t.id)
    : await supabase.from("wa_templates").insert(row);
  if (error) { console.error("upsertWaTemplate", error.message); done(error.code === "23505" ? "duplicate" : "failed"); }
  await logAudit({ action: "whatsapp.template_saved", entityType: "wa_template", entityId: t.id || undefined, next: { name: t.name, language: t.language, category: t.category, status: t.status, variables: n } });
  revalidatePath("/admin/whatsapp");
  revalidatePath("/leads");
  done("template_saved");
}

const optOutSchema = z.object({ phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/), note: z.string().trim().max(200).optional() });

export async function addWaOptOut(formData: FormData): Promise<void> {
  const actor = await requireCapability("platform.configure");
  const parsed = optOutSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) done("invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("wa_opt_outs").insert({ phone: parsed.data.phone, source: "admin", note: parsed.data.note || null, created_by: actor.id });
  if (error && error.code !== "23505") { console.error("addWaOptOut", error.message); done("failed"); }
  await logAudit({ action: "whatsapp.opt_out_added", entityType: "wa_opt_out", next: { source: "admin" } });
  revalidatePath("/admin/whatsapp");
  done("opt_out_added");
}
