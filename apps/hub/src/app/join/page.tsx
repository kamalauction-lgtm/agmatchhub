import { redirect } from "next/navigation";

/**
 * /join?ref=CODE — where a referral link lands.
 *
 * A referral link travels through WhatsApp, so it has to be short, has to
 * survive being pasted, and has to work for someone who has never seen the
 * product. All this page does is carry the code into registration, which is
 * where the account is actually made.
 *
 * It stays a redirect rather than a marketing page on purpose: a second
 * landing page would be a second thing to translate and keep truthful, and
 * the register screen already says what the platform is.
 *
 * The code is NOT validated here. Validation belongs in `attach_referral`,
 * after the account exists, where the checks that matter can run — is the code
 * real, is it somebody else's, has this person already been attributed. Doing
 * it here would only tell a stranger which codes are valid.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const code = (ref ?? "").trim().slice(0, 16);
  redirect(code ? `/register?ref=${encodeURIComponent(code)}` : "/register");
}
