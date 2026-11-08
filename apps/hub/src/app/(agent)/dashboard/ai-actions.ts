"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { briefDate } from "@/lib/ai/brief";

/**
 * "Write it again." Clears today's cached brief for the signed-in agent; the
 * next dashboard render regenerates it (and spends one AI task doing so, which
 * is why it is a button and not automatic). `ai_clear_brief()` is self-only
 * by its own guard, so the form cannot clear anybody else's.
 */
export async function regenerateBrief(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("ai_clear_brief", { p_user: user.id, p_date: briefDate() });
  if (error) console.error("regenerateBrief failed", error.code, error.message);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
