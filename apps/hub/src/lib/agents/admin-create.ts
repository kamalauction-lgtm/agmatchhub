import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email";

// Readable alphabet: no ambiguous 0/O/1/I/L.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Strong but hand-typable one-time password, e.g. "Ag-7KMP-QR4T-9WXY".
 * Uses Web Crypto (available on both Node and the Workers runtime).
 */
export function generatePassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < 12; i += 1) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `Ag-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export type CreateAgentInput = {
  displayName: string;
  email: string;
  mobileNumber?: string | null;
  whatsappNumber?: string | null;
  agencyName?: string | null;
  agencyRegistrationNumber?: string | null;
  licenceType?: string | null;
  licenceNumber?: string | null;
  countryCode?: string | null;
  stateRegion?: string | null;
  city?: string | null;
  adminId: string;
};

export type CreateAgentResult =
  | { ok: true; userId: string; password: string }
  | { ok: false; error: "email_in_use" | "failed" };

/**
 * Admin creates an agent account on the agent's behalf. The account is
 * email-confirmed (so the agent can sign in immediately) but NOT verified —
 * they complete verification later. The verification profile is pre-filled with
 * whatever the admin supplied, and created_by_admin_id records the origin.
 *
 * Must only be called from an admin-gated server action.
 */
export async function adminCreateAgent(input: CreateAgentInput): Promise<CreateAgentResult> {
  const service = createServiceClient();
  const password = generatePassword();

  const { data, error } = await service.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: input.displayName },
  });
  if (error || !data.user) {
    const msg = error?.message ?? "";
    if (/already|exist|registered/i.test(msg)) return { ok: false, error: "email_in_use" };
    console.error("[adminCreateAgent] createUser failed:", msg);
    return { ok: false, error: "failed" };
  }
  const userId = data.user.id;

  // The on_auth_user_created trigger already inserted profiles + users_private.
  await service.from("users_private").update({
    mobile_number: input.mobileNumber ?? null,
    whatsapp_number: input.whatsappNumber ?? null,
  }).eq("user_id", userId);

  await service.from("profiles").update({
    display_name: input.displayName,
    country_code: input.countryCode ?? null,
  }).eq("id", userId);

  // Pre-fill the verification profile so the agent only reviews & submits later.
  await service.from("agent_profiles").upsert({
    user_id: userId,
    full_legal_name: input.displayName,
    agency_name: input.agencyName ?? null,
    agency_registration_number: input.agencyRegistrationNumber ?? null,
    licence_type: input.licenceType ?? null,
    licence_number: input.licenceNumber ?? null,
    country_code: input.countryCode ?? null,
    state_region: input.stateRegion ?? null,
    city: input.city ?? null,
    created_by_admin_id: input.adminId,
  }, { onConflict: "user_id" });

  return { ok: true, userId, password };
}

/** Best-effort welcome email carrying the login link + one-time password. */
export async function emailAgentCredentials(opts: {
  to: string;
  displayName: string;
  password: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: "Your IQI AG MatchHub account",
    heading: `Welcome to IQI AG MatchHub, ${opts.displayName}`,
    body:
      `An account has been created for you.\n\n` +
      `Email: ${opts.to}\n` +
      `Temporary password: ${opts.password}\n\n` +
      `Please sign in and change your password, then complete your agent verification.`,
    ctaUrl: "/login",
    ctaLabel: "Sign in",
  });
}
