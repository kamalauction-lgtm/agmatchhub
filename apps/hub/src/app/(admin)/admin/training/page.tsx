import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/authz";
import { createGuide, saveTranslation, togglePublish, deleteGuide } from "./actions";

/**
 * Training guide editor. Follows the legal-content page's shape: one section
 * per guide, per-locale state at a glance, edit forms folded into <details>.
 */

const LOCALES = ["en", "ms", "id"] as const;
const CATEGORIES = ["platform", "sales", "marketing"] as const;
const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

type GuideRow = {
  id: string;
  category: string;
  position: number;
  is_published: boolean;
  training_guide_translations: { locale: string; title: string; body: string }[];
};

export default async function AdminTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const { saved, error } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("adminTraining");

  const { data } = await supabase
    .from("training_guides")
    .select("id, category, position, is_published, training_guide_translations(locale, title, body)")
    .order("category")
    .order("position");
  const guides = (data ?? []) as GuideRow[];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {saved && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t("savedNotice")}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t(`errors.${error}` as never)}
        </p>
      )}

      {/* New guide ------------------------------------------------------- */}
      <details className="mb-8 rounded-xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-semibold">{t("newGuide")}</summary>
        <form action={createGuide} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("category")}</span>
            <select name="category" className={inputCls}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`categories.${c}`)}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("position")}</span>
            <input name="position" type="number" defaultValue={0} min={0} className={inputCls} />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
          >
            {t("create")}
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">{t("createHint")}</p>
      </details>

      {/* Guides ----------------------------------------------------------- */}
      <div className="space-y-6">
        {guides.map((g) => {
          const byLocale = Object.fromEntries(
            g.training_guide_translations.map((tr) => [tr.locale, tr])
          );
          const anyTitle =
            byLocale.id?.title ?? byLocale.en?.title ?? byLocale.ms?.title ?? t("untitled");
          return (
            <section key={g.id} className="rounded-xl border border-line p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{anyTitle}</h2>
                  <p className="mt-0.5 text-xs text-muted">
                    {t(`categories.${g.category}` as never)} · #{g.position}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      g.is_published ? "bg-success/10 text-success" : "bg-surface text-muted"
                    }`}
                  >
                    {g.is_published ? t("published") : t("draft")}
                  </span>
                  <form action={togglePublish}>
                    <input type="hidden" name="guideId" value={g.id} />
                    <input type="hidden" name="publish" value={String(!g.is_published)} />
                    <button
                      type="submit"
                      className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-crimson hover:text-crimson"
                    >
                      {g.is_published ? t("unpublish") : t("publish")}
                    </button>
                  </form>
                  <form action={deleteGuide}>
                    <input type="hidden" name="guideId" value={g.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:border-danger hover:text-danger"
                    >
                      {t("delete")}
                    </button>
                  </form>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                {LOCALES.map((loc) => {
                  const tr = byLocale[loc];
                  return (
                    <details key={loc} className="rounded-lg bg-surface p-4">
                      <summary className="cursor-pointer text-xs font-bold uppercase">
                        {loc}{" "}
                        <span className="ml-1 font-medium normal-case text-muted">
                          {tr ? tr.title : t("missing")}
                        </span>
                      </summary>
                      <form action={saveTranslation} className="mt-3 space-y-2">
                        <input type="hidden" name="guideId" value={g.id} />
                        <input type="hidden" name="locale" value={loc} />
                        <input
                          name="title"
                          defaultValue={tr?.title ?? ""}
                          placeholder={t("guideTitle")}
                          required
                          minLength={3}
                          className={inputCls}
                        />
                        <textarea
                          name="body"
                          defaultValue={tr?.body ?? ""}
                          placeholder={t("guideBody")}
                          rows={10}
                          required
                          minLength={20}
                          className={inputCls}
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong"
                        >
                          {t("save")}
                        </button>
                      </form>
                    </details>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
