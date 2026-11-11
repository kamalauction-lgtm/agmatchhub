"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";

/**
 * Photo Quality Centre actions (P1-a, storyboard screen 7). Each is one
 * 00114 database function, called with the reviewer's own session: the
 * database checks `media.review` for the photo's country, separation of
 * duties (release) and the state rule, writes the audit row, and does it in
 * one transaction. Nothing here makes a photo public.
 */

const schema = z.object({
  mediaId: z.string().uuid(),
  back: z.string().regex(/^\/admin\/media(\?[\w=&%-]*)?$/).optional(),
});

async function run(fn: "admin_media_release" | "admin_media_retry", formData: FormData, done: string): Promise<void> {
  await requireCapability("media.review");
  const p = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!p.success) redirect("/admin/media?error=invalid");
  const back = p.data.back ?? "/admin/media";
  const sep = back.includes("?") ? "&" : "?";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_media: p.data.mediaId });
  const r = data as { ok?: boolean; error?: string } | null;
  if (error || !r?.ok) redirect(`${back}${sep}error=${r?.error ?? "update_failed"}`);
  redirect(`${back}${sep}done=${done}`);
}

/** Undo a keep-out. Not on a listing the reviewer prepared (00107). */
export async function releasePhoto(formData: FormData): Promise<void> {
  await run("admin_media_release", formData, "released");
}

/** Give a failed photo, or one paused by the quota or the cap, a fresh run. */
export async function retryPhoto(formData: FormData): Promise<void> {
  await run("admin_media_retry", formData, "retried");
}
