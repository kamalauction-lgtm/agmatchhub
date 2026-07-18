/**
 * Contact-detail detection (§24) — Warning mode: messages are delivered but
 * flagged for the participants and admin review. Never silently blocks.
 */
const PATTERNS: [RegExp, string][] = [
  [/\+?\d[\d\s().-]{7,}\d/, "phone_number"],
  [/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, "email_address"],
  [/\b(wa\.me|whatsapp\.com|t\.me|telegram\.me|line\.me)\b/i, "messaging_link"],
  [/\b(instagram\.com|facebook\.com|fb\.com|tiktok\.com)\/[\w.]+/i, "social_link"],
];

export function detectContactDetails(body: string): string | null {
  for (const [re, reason] of PATTERNS) {
    if (re.test(body)) return reason;
  }
  return null;
}
