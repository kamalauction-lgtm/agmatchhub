"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { sendOnLead } from "@/lib/whatsapp";

/**
 * Send ONE WhatsApp message on ONE lead through the platform number (E12).
 * The database decides whether it may go (wa_send_check); this file only
 * carries the agent's text to it. Everything else — wa.me, drafting — is
 * unchanged and remains the path while the flag is off.
 */

const sessionSchema = z.object({ leadId: z.string().uuid(), body: z.string().trim().min(1).max(4096) });
const templateSchema = z.object({
  leadId: z.string().uuid(), templateId: z.string().uuid(),
  v1: z.string().max(200).optional(), v2: z.string().max(200).optional(), v3: z.string().max(200).optional(), v4: z.string().max(200).optional(),
});

export async function sendLeadWhatsapp(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = sessionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/leads?error=invalid");
  const supabase = await createClient();
  const out = await sendOnLead(supabase, parsed.data.leadId, { kind: "session", body: parsed.data.body });
  revalidatePath("/leads");
  redirect(out.ok ? "/leads?updated=whatsapp" : `/leads?error=wa_${out.reason}`);
}

export async function sendLeadWhatsappTemplate(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = templateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/leads?error=invalid");
  const { leadId, templateId, v1, v2, v3, v4 } = parsed.data;
  const values = [v1, v2, v3, v4].filter((v): v is string => typeof v === "string" && v.length > 0);
  const supabase = await createClient();
  const out = await sendOnLead(supabase, leadId, { kind: "template", templateId, values });
  revalidatePath("/leads");
  redirect(out.ok ? "/leads?updated=whatsapp" : `/leads?error=wa_${out.reason}`);
}
