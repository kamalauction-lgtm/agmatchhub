import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { pickTranslation } from "@/lib/training";

/**
 * Training & guides — the last module card to come alive (§20's grid).
 *
 * Guides are language-neutral rows with per-locale translations; the list
 * shows each guide once, in the reader's best available language. Progress is
 * keyed to the guide, so switching language never resets a checkmark
 * (country+language rule).
 */

const CATEGORY_ORDER = ["platform", "sales", "marketing"] as const;

type Row = {
  id: string;
  category: string;
  position: number;
  training_guide_translations: { locale: string; title: string }[];
};

export default async function TrainingPage() {
  const user = await requireUser();
  const t = await getTranslations("training");
  const uiLocale = await getLocale();
  const supabase = await createClient();

  const [{ data: guides }, { data: progress }] = await Promise.all([
    supabase
      .from("training_guides")
      .select("id, category, position, training_guide_translations(locale, title)")
      .eq("is_published", true)
      .order("position"),
    supabase.from("training_progress").select("guide_id").eq("user_id", user.id),
  ]);

  const rows = (guides ?? []) as Row[];
  const done = new Set((progress ?? []).map((p) => p.guide_id));
  const total = rows.length;
  const completed = rows.filter((g) => done.has(g.id)).length;

  return (
    <AgentShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-4 mt-1 text-sm text-muted">{t("intro")}</p>

      {total > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{t("progressLabel")}</span>
            <span className="font-semibold text-foreground">
              {completed}/{total}
            </span>
          </div>
          <div
            className="mt-1 h-2 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-valuenow={completed}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={t("progressLabel")}
          >
            <div
              className="h-full rounded-full bg-success"
              style={{ width: total ? `${Math.round((completed / total) * 100)}%` : 0 }}
            />
          </div>
        </div>
      )}

      {!total ? (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
          {t("empty")}
        </p>
      ) : (
        CATEGORY_ORDER.map((cat) => {
          const inCat = rows.filter((g) => g.category === cat);
          if (!inCat.length) return null;
          return (
            <section key={cat} className="mb-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                {t(`categories.${cat}`)}
              </h2>
              <div className="space-y-2">
                {inCat.map((g) => {
                  const tr = pickTranslation(g.training_guide_translations, uiLocale);
                  const isDone = done.has(g.id);
                  return (
                    <Link
                      key={g.id}
                      href={`/training/${g.id}`}
                      className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 transition hover:border-crimson"
                    >
                      <span
                        aria-hidden
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                          isDone ? "bg-success text-white" : "border border-line text-muted"
                        }`}
                      >
                        {isDone ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {tr?.title ?? "—"}
                      </span>
                      <span aria-hidden className="text-muted">→</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </AgentShell>
  );
}
