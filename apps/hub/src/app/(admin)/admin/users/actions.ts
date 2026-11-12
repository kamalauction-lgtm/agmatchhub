"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { getTranslations } from "next-intl/server";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { createOrRefreshActivation } from "@/lib/admin/register-person";

/**
 * Granting and revoking roles.
 *
 * Until now there was no way to do this from the application at all —
 * `user_roles` was read in one place and written in none, so the only path to
 * creating an admin was a developer running `seed-admin.mjs` against the
 * database. That left the platform with two accounts and no way to delegate
 * anything.
 *
 * Three protections sit UNDER this, in migration 00060, so they hold no matter
 * what calls the table: only a holder of `roles.manage` may write it, nobody
 * may edit their own roles, and the last super admin cannot be removed. The
 * checks here exist to give a person a sentence they can act on instead of a
 * database error.
 */

const COUNTRY = /^[A-Z]{2}$/;

const grantSchema = z.object({
  userId: z.string().uuid(),
  roleKey: z.enum(["super_admin", "admin", "country_admin", "compliance_admin", "agent"]),
  countryCodes: z.string().trim().max(200).optional(),
});

/**
 * An EMPTY ARRAY means every country, not null.
 *
 * `user_roles.country_codes` is `not null default '{}'`, so writing null is a
 * constraint violation — which is exactly what happened the first time this
 * shipped, and the generic "that change was refused" told nobody why.
 * `has_capability_in()` treats empty and null alike, so `[]` is the value that
 * satisfies both the column and the check.
 */
function parseCountries(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(
    raw.toUpperCase().split(/[\s,]+/).filter(Boolean).filter((c) => COUNTRY.test(c)),
  )];
}

export async function grantRole(formData: FormData): Promise<void> {
  const actor = await requireCapability("roles.manage");
  const parsed = grantSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirectTo("invalid");
  const { userId, roleKey, countryCodes } = parsed.data;

  if (userId === actor.id) redirectTo("self");

  const supabase = await createClient();
  const { data: role } = await supabase
    .from("roles").select("id").eq("key", roleKey).maybeSingle();
  if (!role) redirectTo("unknown_role");

  const countries = parseCountries(countryCodes);

  // A country scope on a role that is not country-scoped would read as a
  // restriction the system does not apply. Say so rather than storing it.
  if (countries.length && roleKey !== "country_admin") redirectTo("scope_not_supported");

  const { error } = await supabase.from("user_roles").insert({
    user_id: userId,
    role_id: role.id,
    country_codes: countries,
  });

  if (error) {
    // Log before mapping. A bare "denied" with nothing behind it cost a
    // debugging round trip here already: the real cause was a not-null
    // violation on country_codes, and the notice said only "refused".
    console.error("grantRole failed", error.code, error.message, error.details);
    // 23505 = they already hold it; anything else is the guard in 00060.
    redirectTo(error.code === "23505" ? "already_held" : "denied");
  }

  await logAudit({
    action: "role.granted",
    entityType: "user",
    entityId: userId,
    next: { role: roleKey, country_codes: countries },
  });

  revalidatePath("/admin/users");
  redirectTo("granted");
}

const revokeSchema = z.object({ grantId: z.string().uuid() });

export async function revokeRole(formData: FormData): Promise<void> {
  const actor = await requireCapability("roles.manage");
  const parsed = revokeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirectTo("invalid");

  const supabase = await createClient();
  const { data: grant } = await supabase
    .from("user_roles")
    .select("id, user_id, roles(key)")
    .eq("id", parsed.data.grantId)
    .maybeSingle();
  if (!grant) redirectTo("not_found");

  if (grant.user_id === actor.id) redirectTo("self");

  const { error } = await supabase.from("user_roles").delete().eq("id", grant.id);
  if (error) {
    console.error("revokeRole failed", error.code, error.message, error.details);
    // 23514 is the last-super-admin guard. It is not a bug; it is the point.
    redirectTo(error.code === "23514" ? "last_super_admin" : "denied");
  }

  await logAudit({
    action: "role.revoked",
    entityType: "user",
    entityId: grant.user_id,
    previous: { role: (grant.roles as unknown as { key: string } | null)?.key },
  });

  revalidatePath("/admin/users");
  redirectTo("revoked");
}

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  roleKey: z.enum(["none", "admin", "country_admin", "compliance_admin", "super_admin"]),
  countryCodes: z.string().trim().max(200).optional(),
  language: z.enum(["id", "en", "ms"]).default("id"),
});

/**
 * Super admin registers a person directly (owner request, 12 Nov 2026).
 *
 * The account exists straight away and can be given a role in the same step,
 * so the person does not have to sign up first. They still get an email and
 * activate the account themselves by choosing a password; until then they
 * cannot sign in. Agents are not registered here: they go through
 * Invitations, which carries the activation declarations (D-1).
 */
export async function registerPerson(formData: FormData): Promise<void> {
  await requireCapability("roles.manage");
  const parsed = registerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirectTo("invalid");
  const { fullName, email, roleKey, countryCodes, language } = parsed.data;

  const countries = parseCountries(countryCodes);
  if (countries.length && roleKey !== "country_admin") redirectTo("scope_not_supported");

  const supabase = await createClient();
  let roleId: string | null = null;
  if (roleKey !== "none") {
    const { data: role } = await supabase.from("roles").select("id").eq("key", roleKey).maybeSingle();
    if (!role) redirectTo("unknown_role");
    roleId = role.id;
  }

  const result = await createOrRefreshActivation(email, fullName);
  if (!result.ok) redirectTo(result.reason === "email_registered" ? "email_registered" : "register_failed");

  // Written with the admin's own session, so the 00060 guards still apply.
  let roleGranted = false;
  if (roleId) {
    const { error } = await supabase.from("user_roles").insert({
      user_id: result.userId,
      role_id: roleId,
      country_codes: countries,
    });
    if (error && error.code !== "23505") {
      console.error("registerPerson role grant failed", error.code, error.message, error.details);
    } else if (!error) {
      roleGranted = true;
    }
  }

  const t = await getTranslations({ locale: language, namespace: "adminUsers.registerEmail" });
  const sent = await sendEmail({
    to: email,
    subject: t("subject"),
    heading: t("heading", { name: fullName }),
    body: t("body"),
    ctaLabel: t("cta"),
    ctaUrl: result.link,
  });

  await logAudit({
    action: result.created ? "user.registered_by_admin" : "user.activation_resent",
    entityType: "user",
    entityId: result.userId,
    next: { role: roleKey === "none" ? null : roleKey, country_codes: countries, email_sent: sent },
    result: sent ? "success" : "failure",
  });
  if (roleGranted) {
    await logAudit({
      action: "role.granted",
      entityType: "user",
      entityId: result.userId,
      next: { role: roleKey, country_codes: countries },
    });
  }

  revalidatePath("/admin/users");
  if (roleId && !roleGranted) redirectTo("registered_role_failed");
  if (!sent) redirectTo("registered_email_failed");
  redirectTo(result.created ? "registered" : "activation_resent");
}

/** `redirect` throws, so this never returns — typed that way so callers know. */
function redirectTo(notice: string): never {
  redirect(`/admin/users?notice=${notice}`);
}
