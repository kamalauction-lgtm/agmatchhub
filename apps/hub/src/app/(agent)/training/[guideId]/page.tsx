import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { pickTranslation } from "@/lib/training";
import { markComplete, markIncomplete } from "../actions";

/**
 * One guide. RLS is the access gate: an unpublished guide simply does not
 * come back from the query for a non-admin, so this page 404s without any
 * status juggling.
 */

type Row = {
  id: string;
  category: string;
  is_published: boolean;
  training_guide_translations: { locale: string; title: string; body: string }[];
};

export default async function GuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ guideId: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const user = await requireUser();
  const { guideId } = await params;
  const { done } = await searchParams;
  const t = await getTranslations("training");
  const uiLocale = await getLocale();
  const supabase = await createClient();

  const [{ data: guide }, { data: progress }] = await Promise.all([
    supabase
      .from("training_guides")
      .select("id, category, is_published, training_guide_translations(locale, title, body)")
      .eq("id", guideId)
      .eq("is_published", true)
      .maybeSingle(),
    supabase
      .from("training_progress")
      .select("guide_id")
      .eq("user_id", user.id)
      .eq("guide_id", guideId)
      .maybeSingle(),
  ]);
  if (!guide) notFound();

  const row = guide as Row;
  const tr = pickTranslation(row.training_guide_translations, uiLocale);
  if (!tr) notFound();
  const isDone = !!progress;

  return (
    <AgentShell>
      <Link href="/training" className="text-sm font-medium text-muted hover:text-crimson">
        ← {t("backToList")}
      </Link>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
        {t(`categories.${row.category}` as never)}
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{tr.title}</h1>

      {done && (
        <p className="mt-4 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t("doneNotice")}
        </p>
      )}

      <div className="mt-5 whitespace-pre-line text-sm leading-7">{tr.body}</div>

      <div className="mt-8 border-t border-line pt-5">
        {isDone ? (
          <form action={markIncomplete}>
            <input type="hidden" name="guideId" value={row.id} />
            <button
              type="submit"
              className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface"
            >
              ✓ {t("markIncomplete")}
            </button>
          </form>
        ) : (
          <form action={markComplete}>
            <input type="hidden" name="guideId" value={row.id} />
            <button
              type="submit"
              className="rounded-lg bg-success px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {t("markComplete")}
            </button>
          </form>
        )}
      </div>
    </AgentShell>
  );
}
