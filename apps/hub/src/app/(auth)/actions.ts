"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

const registerSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(2).max(80),
  // Checked again by handle_new_user (00128): only an active country is kept.
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  confirmPassword: z.string(),
});

export async function signIn(formData: FormData) {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/login?error=invalid_credentials");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Only reachable with the right password, so it reveals nothing new.
  if (error?.code === "email_not_confirmed") redirect("/login?error=email_not_confirmed");
  if (error) redirect("/login?error=invalid_credentials");

  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function signUp(formData: FormData) {
  const parsed = registerSchema.safeParse({
    displayName: formData.get("displayName"),
    countryCode: formData.get("countryCode"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  // Carried through the form from /join?ref=CODE. Never trusted here: the
  // database decides whether it is a real, active code for somebody other
  // than this person, on an account young enough to attribute.
  const referralCode = String(formData.get("ref") ?? "").trim().slice(0, 16);
  if (!parsed.success) {
    const weak = parsed.error.issues.some((i) => i.path[0] === "password");
    redirect(`/register?error=${weak ? "weak_password" : "generic"}`);
  }
  if (parsed.data.password !== parsed.data.confirmPassword) {
    redirect("/register?error=password_mismatch");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName, country_code: parsed.data.countryCode },
      emailRedirectTo: process.env.AUTH_CALLBACK_URL,
    },
  });
  if (error) {
    redirect(
      `/register?error=${error.code === "user_already_exists" ? "email_in_use" : "generic"}`,
    );
  }

  /* Attribute the signup while we still have a session for the new account.
   * Deliberately not fatal: a referral that fails to attach must never cost
   * somebody their registration. `attach_referral` returns false rather than
   * throwing for every ordinary rejection (bad code, self-referral, already
   * attributed), so a thrown error here is genuinely unexpected. */
  if (referralCode) {
    const { error: refErr } = await supabase.rpc("attach_referral", { p_code: referralCode });
    if (refErr) console.error("attach_referral failed", refErr.message);
  }

  redirect("/verify-email");
}

/**
 * Send a fresh signup confirmation link (17 Nov 2026). The same answer
 * whether or not the address has an unconfirmed account (no enumeration);
 * Supabase's own per-address rate limit is reported as "wait".
 */
export async function resendConfirmation(formData: FormData) {
  const email = z.string().trim().email().safeParse(formData.get("email"));
  if (!email.success) redirect("/verify-email?resent=invalid");
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.data,
    options: { emailRedirectTo: process.env.AUTH_CALLBACK_URL },
  });
  if (error && (error.status === 429 || /rate|seconds/i.test(error.message))) redirect("/verify-email?resent=wait");
  if (error) console.error("resendConfirmation", error.code, error.message);
  redirect("/verify-email?resent=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPassword(formData: FormData) {
  const email = z.string().trim().email().safeParse(formData.get("email"));
  if (email.success) {
    const supabase = await createClient();
    // Route through /auth/callback so the recovery code is exchanged for a
    // session before the user lands on the reset form.
    await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${process.env.APP_BASE_URL}/auth/callback?next=/reset-password`,
    });
  }
  // Same response whether or not the account exists (no enumeration).
  redirect("/forgot-password?sent=1");
}

export async function resetPassword(formData: FormData) {
  const parsed = z.string().min(8).safeParse(formData.get("password"));
  if (!parsed.success) redirect("/reset-password?error=weak_password");
  if (parsed.data !== formData.get("confirmPassword")) {
    redirect("/reset-password?error=password_mismatch");
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) redirect("/reset-password?error=generic");
  // The temporary password an admin issued is gone now (00132).
  if (updated.user?.app_metadata?.must_change_password) {
    const svc = createServiceClient();
    await svc.auth.admin.updateUserById(updated.user.id, { app_metadata: { must_change_password: false } });
    await svc.from("profiles").update({ must_change_password: false }).eq("id", updated.user.id);
  }
  redirect("/dashboard");
}

/**
 * Activation of an account a super admin registered (/activate). The link's
 * one-time token is used only here, on a button press, never on the GET that
 * opens the page, so a mail scanner fetching the link does not spend it.
 * Success signs the person in; they then choose their password.
 */
const activateSchema = z.object({
  tokenHash: z.string().min(10).max(200),
  type: z.enum(["invite", "recovery"]),
});

export async function activateAccount(formData: FormData) {
  const parsed = activateSchema.safeParse({
    tokenHash: formData.get("tokenHash"),
    type: formData.get("type"),
  });
  if (!parsed.success) redirect("/activate?error=expired");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: parsed.data.type,
    token_hash: parsed.data.tokenHash,
  });
  if (error) redirect("/activate?error=expired");
  redirect("/reset-password?welcome=1");
}
