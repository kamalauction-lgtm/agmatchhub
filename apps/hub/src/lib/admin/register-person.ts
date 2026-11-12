import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Super-admin direct registration: the account is created now, and the person
 * still receives an email to activate it by choosing their own password.
 *
 * Nobody ever learns the person's password, the admin included: the account is
 * created without one, and the link in the email is the only way in. The token
 * is Supabase's own one-time hash. We never store it, and the link opens a page
 * that asks for a click before using it, so a mail scanner that pre-fetches
 * links cannot spend it.
 *
 * Callers MUST have checked `roles.manage` first: this uses the service role.
 */

export type ActivationLink =
  | { ok: true; userId: string; link: string; created: boolean }
  | { ok: false; reason: "email_registered" | "failed" };

export function activationUrl(tokenHash: string, type: "invite" | "recovery"): string {
  const base = process.env.APP_BASE_URL ?? "";
  const qs = new URLSearchParams({ token_hash: tokenHash, type });
  return `${base}/activate?${qs.toString()}`;
}

/**
 * New email: create the account (unconfirmed, no password) with an invite link.
 * Existing account that has never signed in: a fresh link, so submitting the
 * form again re-sends the activation email. Anyone who has already signed in
 * keeps their account untouched.
 */
export async function createOrRefreshActivation(email: string, fullName: string): Promise<ActivationLink> {
  const svc = createServiceClient();

  const invite = await svc.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { display_name: fullName } },
  });
  if (!invite.error && invite.data.user && invite.data.properties?.hashed_token) {
    return {
      ok: true,
      created: true,
      userId: invite.data.user.id,
      link: activationUrl(invite.data.properties.hashed_token, "invite"),
    };
  }

  const exists =
    invite.error?.code === "email_exists" ||
    /already (been )?registered/i.test(invite.error?.message ?? "");
  if (!exists) {
    console.error("registerPerson: generateLink(invite) failed", invite.error?.code, invite.error?.message);
    return { ok: false, reason: "failed" };
  }

  // ilike: older rows keep the case the person typed. Escape its wildcards.
  const pattern = email.replace(/[\\%_]/g, (c) => "\\" + c);
  const { data: row } = await svc
    .from("users_private").select("user_id").ilike("email", pattern).limit(1).maybeSingle();
  if (!row?.user_id) return { ok: false, reason: "email_registered" };
  const { data: existing } = await svc.auth.admin.getUserById(row.user_id);
  if (!existing?.user || existing.user.last_sign_in_at) return { ok: false, reason: "email_registered" };

  const recovery = await svc.auth.admin.generateLink({ type: "recovery", email });
  if (recovery.error || !recovery.data.properties?.hashed_token) {
    console.error("registerPerson: generateLink(recovery) failed", recovery.error?.code, recovery.error?.message);
    return { ok: false, reason: "failed" };
  }
  return {
    ok: true,
    created: false,
    userId: row.user_id,
    link: activationUrl(recovery.data.properties.hashed_token, "recovery"),
  };
}
