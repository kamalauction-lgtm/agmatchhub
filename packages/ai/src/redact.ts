/**
 * Strip personal identifiers from text before it leaves the platform.
 *
 * Most features do not need the enquirer's phone number to draft a reply, a
 * score or a caption — they need the MESSAGE. So the default is to redact and
 * let a feature opt out explicitly (the Secretary, for instance, needs the
 * name to greet someone, but still never the number: the agent sends from
 * their own phone).
 *
 * Patterns cover what actually appears in Malaysian and Indonesian property
 * chats: local and international phone forms, e-mail addresses, Malaysian IC
 * numbers (YYMMDD-PB-NNNN), Indonesian NIK (16 digits), card-like digit runs,
 * and the WhatsApp link form. Replacement tokens are stable so a model can
 * still refer to "the number" without having it.
 */

const RULES: { name: string; re: RegExp; token: string }[] = [
  { name: "email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, token: "[email]" },
  { name: "wa_link", re: /https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send)[^\s)]*/gi, token: "[whatsapp-link]" },
  // Malaysian IC: 900101-14-5678 (also written without dashes, 12 digits).
  { name: "my_ic", re: /\b\d{6}-?\d{2}-?\d{4}\b/g, token: "[id-number]" },
  // Indonesian NIK and any 16-digit run.
  { name: "nik", re: /\b\d{16}\b/g, token: "[id-number]" },
  // Phones: +60 12-345 6789 · 012-3456789 · +62 812 3456 7890 · 0812-3456-7890 · 021 1234567
  { name: "phone", re: /(?:\+?\d{1,3}[\s-]?)?(?:\(?0?\d{2,4}\)?[\s-]?)\d{3,4}[\s-]?\d{3,5}\b/g, token: "[phone]" },
];

export type Redaction = { text: string; counts: Record<string, number> };

export function redact(input: string, opts: { keepEmails?: boolean } = {}): Redaction {
  let text = input;
  const counts: Record<string, number> = {};
  for (const rule of RULES) {
    if (opts.keepEmails && rule.name === "email") continue;
    text = text.replace(rule.re, (m) => {
      // A phone rule is greedy by nature; do not swallow plain prices or years.
      if (rule.name === "phone") {
        const digits = m.replace(/\D/g, "");
        if (digits.length < 9 || digits.length > 14) return m;
        if (/^(19|20)\d{2}$/.test(digits)) return m;
      }
      counts[rule.name] = (counts[rule.name] ?? 0) + 1;
      return rule.token;
    });
  }
  return { text, counts };
}
