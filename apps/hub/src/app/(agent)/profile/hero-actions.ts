"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { linkHeroFor } from "@/lib/hero/link";

/**
 * The agent links, re-checks or unlinks their own Hero account. The check is
 * against the hub's own verified identifiers (see lib/hero/link.ts), so there
 * is no form field to abuse. Every outcome is audited without the identifier.
 */

function done(notice: string): never {
  redirect(`/profile?hero=${notice}#hero`);
}

export async function linkHero(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const outcome = await linkHeroFor(user.id, supabase);
  await logAudit({ action: "hero.link_attempted", entityType: "user", entityId: user.id, next: { outcome: outcome.kind }, result: outcome.kind === "error" ? "failure" : "success" });
  revalidatePath("/profile");
  revalidatePath("/ai");
  revalidatePath("/dashboard");
  done(outcome.kind);
}

export async function unlinkHero(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("hero_unlink", { p_user: user.id });
  if (error) done("error");
  await logAudit({ action: "hero.unlinked", entityType: "user", entityId: user.id });
  revalidatePath("/profile");
  revalidatePath("/ai");
  done("unlinked");
}
