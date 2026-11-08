"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Marking an announcement read.
 *
 * No capability check and no audit entry: this is an agent acknowledging
 * something addressed to them, which is neither privileged nor interesting
 * later. `mark_announcement_read()` derives the user from `auth.uid()`, so the
 * form cannot dismiss anything on somebody else's behalf, and the insert is
 * `on conflict do nothing` — a double-click is not an error.
 */

export async function dismissAnnouncement(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_announcement_read", { p_announcement: id });
  if (error) console.error("dismissAnnouncement failed", error.code, error.message);

  /* Both, and the redirect is the one that matters. Verified on production:
   * revalidatePath alone recorded the read but left the banner on screen
   * until a manual reload, so pressing "Got it" appeared to do nothing —
   * which invites a second press and a support message. The redirect forces
   * the fresh render. */
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
