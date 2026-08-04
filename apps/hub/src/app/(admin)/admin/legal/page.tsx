import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/authz";
import { publishDeclarationVersion } from "./actions";

const LOCALES = ["en", "ms", "id"] as const;
const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

export default async function LegalContentPage({
  searchParams,
}: {
  searchParams: Promise<{ published?: string; error?: string }>;
}) {
  await requireAdmin();
  const { published, error } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("adminLegal");

  const { data: declarations } = await supabase
    .from("declarations")
    .select("id, key, name, declaration_versions(id, locale, version_number, body, active, created_at)")
    .order("key");

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {published && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t("publishedNotice")}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t(`errors.${error === "invalid" ? "invalid" : "save_failed"}`)}
        </p>
      )}

      <div className="space-y-8">
        {(declarations ?? []).map((d) => {
          const versions = d.declaration_versions ?? [];
          return (
            <section key={d.id} className="rounded-xl border border-line p-6">
              <h2 className="mb-1 font-semibold">{t(`types.${d.key}`)}</h2>
              <p className="mb-4 text-xs text-muted">{d.key}</p>

              <div className="mb-6 grid gap-4 lg:grid-cols-3">
                {LOCALES.map((loc) => {
                  const active = versions
                    .filter((v) => v.locale === loc && v.active)
                    .sort((a, b) => b.version_number - a.version_number)[0];
                  return (
                    <div key={loc} className="rounded-lg bg-surface p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase">{loc}</span>
                        <span className="text-xs text-muted">
                          {active ? `v${active.version_number}` : t("noVersion")}
                        </span>
                      </div>
                      {active && (
                        <details>
                          <summary className="cursor-pointer text-xs font-medium text-crimson">
                            {t("viewText")}
                          </summary>
                          <p className="mt-2 text-xs leading-5 whitespace-pre-line text-muted">
                            {active.body}
                          </p>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>

              <details className="rounded-lg border border-line p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  {t("publishNew")}
                </summary>
                <form action={publishDeclarationVersion} className="mt-4 space-y-3">
                  <input type="hidden" name="declarationId" value={d.id} />
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">{t("locale")}</span>
                    <select name="locale" className={inputCls} defaultValue="en">
                      {LOCALES.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">{t("body")}</span>
                    <textarea name="body" rows={8} required minLength={50} className={inputCls} />
                  </label>
                  <p className="text-xs text-muted">{t("publishHint")}</p>
                  <button type="submit" className="rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong">
                    {t("publish")}
                  </button>
                </form>
              </details>
            </section>
          );
        })}
      </div>
    </div>
  );
}
