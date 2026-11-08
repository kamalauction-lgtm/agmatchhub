import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";

/**
 * Global admin search.
 *
 * An operator with a phone number, a listing reference or half a company name
 * should not have to know which screen owns it. Results are grouped by kind so
 * the answer is scannable rather than a flat list where an agent and a listing
 * look identical.
 *
 * `requireAdmin` rather than a capability: looking somebody up is not itself a
 * privileged action, and every destination already gates on its own capability
 * — a compliance admin who finds a banner here still cannot open the banner
 * screen.
 */

export const dynamic = "force-dynamic";

type Result = {
  kind: string;
  id: string;
  label: string;
  sublabel: string | null;
  href: string;
};

const KIND_ORDER = ["agent", "organisation", "listing", "request", "referral_code", "import_batch"];

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q } = await searchParams;
  const t = await getTranslations("adminSearch");
  const query = (q ?? "").trim();

  let results: Result[] = [];
  if (query.length >= 2) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("admin_search", { p_query: query, p_limit: 8 });
    results = (data ?? []) as Result[];
  }

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    rows: results.filter((r) => r.kind === kind),
  })).filter((g) => g.rows.length > 0);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>

      <form action="/admin/search" className="mb-8 flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={query}
          autoFocus
          placeholder={t("placeholder")}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-background px-4 text-sm outline-none focus:border-crimson"
        />
        <button
          type="submit"
          className="min-h-11 cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-crimson-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
        >
          {t("search")}
        </button>
      </form>

      {/* Two characters minimum: a single letter matches most of the database
          and tells nobody anything. */}
      {query.length > 0 && query.length < 2 && (
        <p className="text-sm text-muted">{t("tooShort")}</p>
      )}

      {query.length >= 2 && results.length === 0 && (
        <div className="rounded-xl border border-dashed border-line px-6 py-14 text-center">
          <p className="font-semibold">{t("noResults", { query })}</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{t("noResultsHint")}</p>
        </div>
      )}

      {grouped.map((group) => (
        <section key={group.kind} className="mb-7">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            {t(`kind.${group.kind}` as never)}
          </h2>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {group.rows.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <Link
                  href={r.href}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors duration-200 hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
                >
                  <span className="min-w-0 font-medium">{r.label}</span>
                  <span className="shrink-0 text-xs text-muted">{r.sublabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
