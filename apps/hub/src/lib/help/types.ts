/**
 * The in-app playbook (owner decision 19 Nov 2026): step-by-step guides for
 * agents and admins, in English and Bahasa Indonesia, kept in the repository
 * and updated in the same change as the feature they describe. Malay readers
 * see English until a Malay reviewer is in place (D-9).
 *
 * Each guide is shown as an interactive walkthrough: one step at a time, with
 * a screenshot of the real screen and the thing to press highlighted.
 *
 * To amend a guide: edit content-agent.ts or content-admin.ts, bump `updated`,
 * and ship it with the feature change. If the screen changed, re-take its
 * pictures with `node scripts/capture-help-shots.mjs <id>` (staging only).
 */
import shots from "./shots.json";

export type HelpLang = "en" | "id";
export type Localised = Record<HelpLang, string>;

/**
 * A screenshot captured by scripts/capture-help-shots.mjs (staging, demo
 * data). Only ids present in shots.json compile, so a guide can never point
 * at a picture that was not taken.
 */
export type ShotId = keyof typeof shots;
export type HelpStep = Localised & { shot?: ShotId };

export type HelpSection = {
  heading: Localised;
  /** Numbered steps, in order. A step without a shot keeps the previous picture. */
  steps?: HelpStep[];
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

/** `?lang=` on a guide overrides the interface language (the EN/ID switch). */
export function helpLang(locale: string, override?: string | null): HelpLang {
  if (override === "en" || override === "id") return override;
  return locale === "id" ? "id" : "en";
}

export type ShotBox = { x: number; y: number; w: number; h: number };
export type WalkStep = {
  section: string;
  sectionIndex: number;
  text: string;
  notes: string[];
  /** Image URL; null when the guide has no picture (yet) at this point. */
  src: string | null;
  /** Highlight in percent of the image; null when the step points at nothing. */
  box: ShotBox | null;
};

type ShotEntry = Partial<Record<HelpLang, { box: ShotBox | null; w: number; h: number }>>;
const SHOTS = shots as Record<string, ShotEntry>;

/** Flatten a topic into walkthrough steps, resolving each step's picture. */
export function walkSteps(topic: HelpTopic, lang: HelpLang): WalkStep[] {
  const out: WalkStep[] = [];
  let src: string | null = null;
  topic.sections.forEach((section, sectionIndex) => {
    const heading = pick(section.heading, lang);
    const notes = (section.notes ?? []).map((n) => pick(n, lang));
    const steps = section.steps ?? [];
    if (!steps.length) {
      out.push({ section: heading, sectionIndex, text: notes.join(" "), notes: [], src, box: null });
      return;
    }
    steps.forEach((s, i) => {
      let box: ShotBox | null = null;
      if (s.shot) {
        const entry = SHOTS[s.shot];
        const which: HelpLang = entry?.[lang] ? lang : "en";
        src = `/help/shots/${which}/${s.shot}.webp`;
        box = entry?.[which]?.box ?? null;
      }
      out.push({
        section: heading,
        sectionIndex,
        text: pick(s, lang),
        // A section's notes travel with its last step, where the reader has the context.
        notes: i === steps.length - 1 ? notes : [],
        src,
        box,
      });
    });
  });
  return out;
}

/** First picture of a topic, for the guide cards. */
export function topicCover(topic: HelpTopic, lang: HelpLang): string | null {
  for (const section of topic.sections) {
    for (const s of section.steps ?? []) {
      if (s.shot) return `/help/shots/${SHOTS[s.shot]?.[lang] ? lang : "en"}/${s.shot}.webp`;
    }
  }
  return null;
}
