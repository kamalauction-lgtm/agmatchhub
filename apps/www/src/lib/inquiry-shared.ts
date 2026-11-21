import "server-only";
import { headers } from "next/headers";
import { market } from "@/config/market";

/**
 * What both enquiry server actions need: the local listing form (inquiry.ts)
 * and the international one (international-enquiry.ts). Kept out of those
 * files because a "use server" module may only export async actions.
 */

/**
 * Normalise a local phone number to E.164, using THIS MARKET's dialling code.
 *
 * "0812…" in Indonesia and "012-345 6789" in Malaysia are both the local
 * convention of writing a national number with a leading zero; which country
 * that zero belongs to is the market's, not a constant. This used to hard-code
 * +62, which on a Malaysian build would have turned every Malaysian buyer's
 * number into an Indonesian one — an undeliverable lead that still looks like
 * a valid phone number, so nothing downstream would flag it.
 *
 * Numbers already in E.164 pass through untouched: overseas buyers exist (§2).
 */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[\s\-().]/g, "");
  const code = market.phoneCode.replace("+", "");

  if (/^\+[1-9][0-9]{7,14}$/.test(digits)) return digits;
  // Local form: a leading zero standing in for the country code.
  if (/^0[0-9]{7,13}$/.test(digits)) return `${market.phoneCode}${digits.slice(1)}`;
  // Pasted with the country code but no plus.
  if (new RegExp(`^${code}[0-9]{7,13}$`).test(digits)) return `+${digits}`;
  return digits; // let the database's E.164 check reject it
}

/** Hash the caller's IP for rate limiting. The raw IP is never stored. */
export async function ipHash(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const salt = process.env.INQUIRY_IP_SALT ?? "dev-salt";
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
