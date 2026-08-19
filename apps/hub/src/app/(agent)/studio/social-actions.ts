"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

/**
 * Scheduling actions for the Content Studio.
 *
 * The design rule holds: the caption that gets published is EXACTLY the text
 * the agent had in the textarea when they pressed schedule. Nothing here
 * rewrites, appends or "improves" it. RLS does the ownership enforcement —
 * the insert policy verifies both the row and the target account belong to
 * the caller — so these actions validate shape, not authority.
 */

const scheduleSchema = z.object({
  accountId: z.string().uuid(),
  listingId: z.string().uuid().optional(),
  caption: z.string().trim().min(1).max(5000),
  imageUrl: z.string().url().max(1000).optional(),
  scheduledAt: z.string().min(1),
});

export async function schedulePost(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = scheduleSchema.safeParse({
    accountId: formData.get("accountId"),
    listingId: formData.get("listingId") || undefined,
    caption: formData.get("caption"),
    imageUrl: formData.get("imageUrl") || undefined,
    scheduledAt: formData.get("scheduledAt"),
  });
  const backTo = formData.get("listingId")
    ? `/studio/${formData.get("listingId")}`
    : "/studio";
  if (!parsed.success) redirect(`${backTo}?error=invalid`);
  const input = parsed.data;

  // datetime-local arrives without a zone; the browser gave us the agent's
  // wall-clock time, and new Date() interprets it in the server's zone. On
  // Cloudflare that is UTC, so the client sends an ISO string instead (the
  // form serialises it before submit). Reject anything unparseable or past.
  const when = new Date(input.scheduledAt);
  if (Number.isNaN(when.getTime())) redirect(`${backTo}?error=invalid`);
  if (when.getTime() < Date.now() - 60_000) redirect(`${backTo}?error=past`);
  if (when.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) {
    redirect(`${backTo}?error=too_far`);
  }

  // RLS lets the agent read only their own accounts, so this lookup is also
  // the ownership check.
  const { data: account } = await supabase
    .from("social_accounts")
    .select("id, platform, status")
    .eq("id", input.accountId)
    .maybeSingle();
  if (!account) redirect(`${backTo}?error=account_not_found`);
  if (account.status !== "active") redirect(`${backTo}?error=account_inactive`);

  // Instagram has no text-only posts. Enforced here, at claim time again in
  // the publisher, and explained in the UI — three layers because a failed
  // post at 9pm is an agent who stops trusting the scheduler.
  if (account.platform === "instagram_business" && !input.imageUrl) {
    redirect(`${backTo}?error=ig_needs_image`);
  }

  const { data: row, error } = await supabase
    .from("scheduled_posts")
    .insert({
      user_id: user.id,
      account_id: account.id,
      listing_id: input.listingId ?? null,
      platform: account.platform,
      caption: input.caption,
      image_url: input.imageUrl ?? null,
      scheduled_at: when.toISOString(),
    })
    .select("id")
    .single();
  if (error || !row) redirect(`${backTo}?error=schedule_failed`);

  await logAudit({
    action: "social.post_scheduled",
    entityType: "scheduled_post",
    entityId: row.id,
    next: {
      platform: account.platform,
      listing_id: input.listingId ?? null,
      scheduled_at: when.toISOString(),
    },
  });

  redirect("/studio/scheduled?scheduled=1");
}

export async function cancelPost(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/studio/scheduled?error=invalid");

  // RLS only permits updating own rows still in 'scheduled' — a post the
  // publisher already claimed cannot be pulled back.
  const { data: row, error } = await supabase
    .from("scheduled_posts")
    .update({ status: "canceled" })
    .eq("id", parsed.data.id)
    .eq("status", "scheduled")
    .select("id")
    .maybeSingle();
  if (error || !row) redirect("/studio/scheduled?error=cancel_failed");

  await logAudit({
    action: "social.post_canceled",
    entityType: "scheduled_post",
    entityId: row.id,
  });

  redirect("/studio/scheduled?canceled=1");
}

export async function disconnectAccount(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/studio/accounts?error=invalid");

  // Cascades take the token and the account's queue with it — a pending post
  // without a token could never publish anyway, and the UI says so.
  const { error } = await supabase
    .from("social_accounts")
    .delete()
    .eq("id", parsed.data.id);
  if (error) redirect("/studio/accounts?error=disconnect_failed");

  await logAudit({
    action: "social.account_disconnected",
    entityType: "social_account",
    entityId: parsed.data.id,
  });

  redirect("/studio/accounts?disconnected=1");
}
