"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { hashInviteToken, looksLikeInviteToken } from "@/lib/agents/invitations";

/**
 * Accept an invitation (00106). The hub hashes the token and hands the hash
 * to redeem_agent_invitation(), which rate-limits, checks the signed-in
 * e-mail against the invitation, and audits every attempt. The raw IP never
 * leaves this function: only a hash of it is used as the rate-limit bucket.
 */
export async function acceptInvitation(formData: FormData): Promise<void> {
  await requireUser();
  const token = String(formData.get("token") ?? "");
  if (!looksLikeInviteToken(token)) redirect("/dashboard?invite=invalid");

  const ip = (await headers()).get("cf-connecting-ip") ?? (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ipHash = ip ? await hashInviteToken(`ip:${ip}`) : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_agent_invitation", {
    p_token_hash: await hashInviteToken(token),
    p_ip_hash: ipHash,
  });
  const result = (data ?? {}) as { ok?: boolean; error?: string };
  if (error || !result.ok) {
    const reason = ["invalid", "email_mismatch", "rate_limited", "sign_in_required"].includes(result.error ?? "")
      ? result.error
      : "failed";
    redirect(`/invite/${token}?error=${reason}`);
  }
  redirect("/verification?invited=1");
}
