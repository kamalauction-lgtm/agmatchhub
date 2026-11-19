import { getTranslations } from "next-intl/server";
import { HelpHint } from "./help-views";
import { ADMIN_TOPICS } from "@/lib/help/content-admin";
import { AGENT_TOPICS } from "@/lib/help/content-agent";

/**
 * "? Guide" next to a screen's title, opening the matching walkthrough (on a
 * given step when `step` is set). Refuses unknown slugs at render time so a
 * renamed guide shows up in development instead of as a broken link.
 */
export async function GuideLink({ slug, step }: { slug: string; step?: number }) {
  const t = await getTranslations("help");
  const admin = ADMIN_TOPICS.some((x) => x.slug === slug);
  const agent = AGENT_TOPICS.some((x) => x.slug === slug);
  if (!admin && !agent) {
    if (process.env.NODE_ENV !== "production") throw new Error(`GuideLink: unknown guide "${slug}"`);
    return null;
  }
  // Sits inside a page's <h1>, so it resets the heading's type and colour.
  return (
    <span className="mt-2 block align-middle text-base font-normal text-foreground sm:ml-3 sm:mt-0 sm:inline-block">
      <HelpHint href={`${admin ? "/admin/help" : "/help"}/${slug}`} step={step} label={t("hint")} />
    </span>
  );
}
