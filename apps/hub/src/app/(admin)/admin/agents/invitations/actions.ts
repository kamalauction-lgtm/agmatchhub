"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, requireCapabilityIn } from "@/lib/authz";
import { INVITE_LINK_COOKIE, INVITE_VALID_DAYS, inviteLink, newInviteToken } from "@/lib/agents/invitations";

/**
 * Create, resend and revoke agent invitations (P0-b, 00106).
 *
 * Every write is a database function that checks agent.invite for the
 * invitation's country and audits the call; the checks here only give a
 * readable answer first. The token never reaches the database: we send its
 * hash, and show the link to the admin once, through a short-lived cookie
 * rather than the URL.
 */

const PAGE = "/admin/agents/invitations";

async function showLinkOnce(token: string) {
  (await cookies()).set(INVITE_LINK_COOKIE, inviteLink(token), {
    httpOnly: true, secure: true, sameSite: "lax", path: PAGE, maxAge: 300,
  });
}

/** Postgres error → a notice key the page knows. */
function noticeFor(message: string | undefined, code: string | undefined): string {
  if (code === "42501") return "denied";
  if (message?.includes("invitation_email_registered")) return "email_registered";
  if (message?.includes("idx_agent_invitations_open_email")) return "already_invited";
  if (message?.includes("invitation_country_inactive")) return "country_inactive";
  if (message?.includes("invitation_not_pending")) return "not_pending";
  return "failed";
}

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  country: z.string().trim().length(2).toUpperCase(),
  language: z.string().trim().max(5).optional().or(z.literal("")),
  agency: z.string().trim().max(160).optional().or(z.literal("")),
});

export async function createInvitation(formData: FormData): Promise<void> {
  await requireCapability("agent.invite");
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${PAGE}?notice=invalid`);
  const d = parsed.data;
  await requireCapabilityIn("agent.invite", d.country, PAGE);

  const { token, hash } = await newInviteToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc("agent_invitation_create", {
    p_token_hash: hash,
    p_country: d.country,
    p_full_name: d.fullName,
    p_email: d.email,
    p_phone: d.phone || null,
    p_language: d.language || null,
    p_agency: d.agency || null,
    p_valid_days: INVITE_VALID_DAYS,
  });
  if (error) redirect(`${PAGE}?notice=${noticeFor(error.message, error.code)}`);

  await showLinkOnce(token);
  revalidatePath(PAGE);
  redirect(`${PAGE}?notice=created`);
}

const idSchema = z.object({ invitationId: z.string().uuid(), reason: z.string().trim().max(300).optional() });

export async function resendInvitation(formData: FormData): Promise<void> {
  await requireCapability("agent.invite");
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${PAGE}?notice=invalid`);

  const { token, hash } = await newInviteToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc("agent_invitation_resend", {
    p_id: parsed.data.invitationId,
    p_new_token_hash: hash,
    p_valid_days: INVITE_VALID_DAYS,
  });
  if (error) redirect(`${PAGE}?notice=${noticeFor(error.message, error.code)}`);

  await showLinkOnce(token);
  revalidatePath(PAGE);
  redirect(`${PAGE}?notice=resent`);
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  await requireCapability("agent.invite");
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${PAGE}?notice=invalid`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("agent_invitation_revoke", {
    p_id: parsed.data.invitationId,
    p_reason: parsed.data.reason || null,
  });
  if (error) redirect(`${PAGE}?notice=${noticeFor(error.message, error.code)}`);

  revalidatePath(PAGE);
  redirect(`${PAGE}?notice=revoked`);
}
