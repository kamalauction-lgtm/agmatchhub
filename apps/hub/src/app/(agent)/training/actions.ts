"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Progress toggling. Deliberately not audited: an agent's reading state is
 * their own, not a critical platform action — the audit log is for things
 * that affect other people.
 */

export async function markComplete(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z.object({ guideId: z.string().uuid() }).safeParse({
    guideId: formData.get("guideId"),
  });
  if (!parsed.success) redirect("/training");

  // upsert: pressing the button twice is not an error.
  await supabase
    .from("training_progress")
    .upsert({ user_id: user.id, guide_id: parsed.data.guideId });
  redirect(`/training/${parsed.data.guideId}?done=1`);
}

export async function markIncomplete(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z.object({ guideId: z.string().uuid() }).safeParse({
    guideId: formData.get("guideId"),
  });
  if (!parsed.success) redirect("/training");

  await supabase
    .from("training_progress")
    .delete()
    .eq("user_id", user.id)
    .eq("guide_id", parsed.data.guideId);
  redirect(`/training/${parsed.data.guideId}`);
}
