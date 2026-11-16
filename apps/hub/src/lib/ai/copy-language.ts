/**
 * Which language generated listing copy is written in (P0-d-1c).
 *
 * Copy follows the LISTING's stored `language`, never the agent's UI locale.
 * Two languages have phrase sets today: Indonesian and English.
 *
 * Malay (`ms`) has no reviewed phrase set yet, and Indonesian is not Malay, so
 * a Malay listing gets an ENGLISH draft rather than Indonesian, and says so:
 * `fallback` is true and the UI tells the agent the draft is in English. The
 * listing's stored language is never changed by this; the agent reviews and
 * edits the draft before anything is saved.
 *
 * An unknown value keeps the old behaviour (Indonesian) and is also flagged.
 * Pure: no imports, safe in server and client code and in unit tests.
 */

export type CopyLang = "id" | "en";

export type CopyLanguage = {
  /** The language the draft is written in. */
  lang: CopyLang;
  /** The listing's stored language, unchanged. */
  stored: string;
  /** True when the draft is not in the stored language. */
  fallback: boolean;
};

export function copyLanguage(stored: string | null | undefined): CopyLanguage {
  const s = stored ?? "id";
  if (s === "id") return { lang: "id", stored: s, fallback: false };
  if (s === "en") return { lang: "en", stored: s, fallback: false };
  // Temporary, owner-approved 11 Nov 2026: English until reviewed Malay phrases exist.
  if (s === "ms") return { lang: "en", stored: s, fallback: true };
  return { lang: "id", stored: s, fallback: true };
}
