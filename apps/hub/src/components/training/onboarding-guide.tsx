import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCompanions } from "@/lib/ai/cast";
import { CompanionBadge } from "@/components/ai/companion";

/**
 * Onboarding Guide — the first listing, lead and viewing as live facts from
 * the agent's own data (00098 `my_onboarding_steps`), each step pointing at
 * the screen where it happens. Disappears once every step is done.
 */
const HREF: Record<string, string> = {
  profile: "/profile", verified: "/verification", first_listing: "/listings/new", first_photo: "/listings", first_published: "/listings",
  first_share: "/studio", first_lead: "/card", first_reply: "/leads", first_task: "/tasks", first_viewing: "/tasks", first_guide: "/training",
};

export async function OnboardingGuide() {
  const supabase = await createClient();
  const t = await getTranslations("aiTools.onboarding");
  const { data } = await supabase.rpc("my_onboarding_steps");
  const steps = ((data ?? []) as { step: string; pos: number; done: boolean }[]).sort((a, b) => a.pos - b.pos);
  if (!steps.length || steps.every((s) => s.done)) return null;
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const { onboarding_guide: c } = await getCompanions(["onboarding_guide"]);

  return (
    <section className="mb-8 rounded-xl border border-line bg-card shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <CompanionBadge c={c} size="sm" />
          <div><h2 className="text-sm font-semibold">{t("title")}</h2><p className="text-xs text-muted">{t("progress", { done, total: steps.length })}</p></div>
        </div>
        {next && <Link href={HREF[next.step] ?? "/dashboard"} className="rounded-lg bg-crimson px-3 py-1.5 text-xs font-semibold text-white hover:bg-crimson-strong">{t("next")}: {t(`steps.${next.step}` as never)} →</Link>}
      </header>
      <ol className="grid gap-x-6 px-5 py-3 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.step} className="flex items-center gap-3 py-1.5 text-sm">
            <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${s.done ? "bg-success text-white" : "border border-line text-muted"}`}>{s.done ? "✓" : ""}</span>
            {s.done ? <span className="text-muted line-through">{t(`steps.${s.step}` as never)}</span> : <Link href={HREF[s.step] ?? "/dashboard"} className="font-medium hover:text-crimson">{t(`steps.${s.step}` as never)}</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}
