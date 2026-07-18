"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

const registerSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(2).max(80),
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
  if (error) redirect("/login?error=invalid_credentials");

  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function signUp(formData: FormData) {
  const parsed = registerSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
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
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: process.env.AUTH_CALLBACK_URL,
    },
  });
  if (error) {
    redirect(
      `/register?error=${error.code === "user_already_exists" ? "email_in_use" : "generic"}`,
    );
  }
  redirect("/verify-email");
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
    await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${process.env.APP_BASE_URL}/reset-password`,
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
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) redirect("/reset-password?error=generic");
  redirect("/dashboard");
}
