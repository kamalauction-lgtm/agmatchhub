"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { notify } from "@/lib/notifications";

/**
 * The agent answers a change request on their own listing (P1-b). The 00115
 * function checks the listing is theirs and the request still open; the
 * moderator who asked is then notified.
 */

const schema = z.object({
  listingId: z.string().uuid(),
  requestId: z.string().uuid(),
  answer: z.string().trim().min(1).max(2000),
});

export async function answerChange(formData: FormData): Promise<void> {
  await requireUser();
  const p = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!p.success) redirect(`/listings/${String(formData.get("listingId") ?? "")}/edit?changes=invalid#changes`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agent_answer_change", { p_request: p.data.requestId, p_answer: p.data.answer });
  const r = data as { ok?: boolean; error?: string; opened_by?: string } | null;
  if (error || !r?.ok) redirect(`/listings/${p.data.listingId}/edit?changes=${r?.error ?? "failed"}#changes`);
  if (r?.opened_by) {
    try {
      await notify({ userId: r.opened_by, kind: "listing.change_answered", payload: {}, href: "/admin/handover" });
    } catch (e) {
      console.error("[change answer] notify failed:", e instanceof Error ? e.message : e);
    }
  }
  revalidatePath(`/listings/${p.data.listingId}/edit`);
  redirect(`/listings/${p.data.listingId}/edit?changes=answered#changes`);
}
