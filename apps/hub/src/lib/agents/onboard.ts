import "server-only";
import { randomInt } from "node:crypto";

/**
 * Temporary passwords for accounts an admin opens on an agent's behalf
 * (00132, owner decision 19 Nov 2026). The agent must replace it at first
 * sign-in. 14 characters from an alphabet without look-alikes (no 0/O, 1/l/I),
 * with at least one lower, upper and digit, so it can be read aloud or typed
 * from a WhatsApp message without mistakes.
 */
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const ALL = LOWER + UPPER + DIGIT;

export function temporaryPassword(length = 14): string {
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** The consent scopes an admin can record; open_account is always included. */
export const CONSENT_SCOPES = ["open_account", "import_listings", "publish_on_behalf"] as const;
export const CONSENT_METHODS = ["phone_call", "whatsapp", "in_person", "email"] as const;

/** Short-lived, page-scoped cookie that shows the admin the message once. */
export const ONBOARD_MESSAGE_COOKIE = "pg_onboard_message";
export const ONBOARD_PAGE = "/admin/agents/onboard";
