/**
 * The in-app playbook (owner decision 19 Nov 2026): step-by-step guides for
 * agents and admins, in English and Bahasa Indonesia, kept in the repository
 * and updated in the same change as the feature they describe. Malay readers
 * see English until a Malay reviewer is in place (D-9).
 *
 * To amend a guide: edit content-agent.ts or content-admin.ts, bump `updated`,
 * and ship it with the feature change.
 */

export type HelpLang = "en" | "id";
export type Localised = Record<HelpLang, string>;

export type HelpSection = {
  heading: Localised;
  /** Numbered steps, in order. */
  steps?: Localised[];
  /** Short notes shown under the steps. */
  notes?: Localised[];
};

export type HelpTopic = {
  slug: string;
  audience: "agent" | "admin";
  /** ISO date of the last amendment. */
  updated: string;
  title: Localised;
  summary: Localised;
  /** Where in the app this happens, shown as a link. */
  path?: string;
  sections: HelpSection[];
};

export function pick(l: Localised, lang: HelpLang): string {
  return l[lang] ?? l.en;
}

export function helpLang(locale: string): HelpLang {
  return locale === "id" ? "id" : "en";
}
