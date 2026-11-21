import { getTranslations } from "next-intl/server";
import type { ArticleLabels, IndexLabels } from "@/components/help/help-views";

/** Interface strings for the guide pages (the guide text itself is EN/ID/MS content). */
export async function indexLabels(kind: "agent" | "admin"): Promise<IndexLabels> {
  const t = await getTranslations("help");
  return {
    title: t(kind === "admin" ? "adminTitle" : "agentTitle"),
    intro: t(kind === "admin" ? "adminIntro" : "agentIntro"),
    updated: t("updated"),
    // Malay guides exist since 21 Nov 2026, so nobody needs the "Malay is coming" note.
    langNote: null,
    language: t("language"),
    stepsCount: t("stepsCount", { n: "{n}" }),
    doneOf: t("doneOf", { n: "{n}", total: "{total}" }),
    start: t("start"),
  };
}

export async function articleLabels(): Promise<ArticleLabels> {
  const t = await getTranslations("help");
  return {
    updated: t("updated"),
    open: t("open"),
    language: t("language"),
    stepOf: t("stepOf", { n: "{n}", total: "{total}" }),
    doneOf: t("doneOf", { n: "{n}", total: "{total}" }),
    steps: t("steps"),
    back: t("prev"),
    next: t("next"),
    finish: t("finish"),
    markDone: t("markDone"),
    done: t("done"),
    finishedTitle: t("finishedTitle"),
    finishedBody: t("finishedBody"),
    restart: t("restart"),
    allGuides: t("back"),
    enlarge: t("enlarge"),
    noPicture: t("noPicture"),
    goodToKnow: t("goodToKnow"),
    shotAlt: t("shotAlt", { n: "{n}" }),
    keys: t("keys"),
  };
}

/** `?step=` is 1-based in the address; the walkthrough counts from 0. */
export function stepParam(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n - 1 : 0;
}
