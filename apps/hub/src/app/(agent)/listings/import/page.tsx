import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { portalChoices } from "@/lib/import/adapters";
import { ImportStarter } from "@/components/import/import-starter";
import { FileUpload } from "@/components/import/file-upload";

/**
 * "I already have listings elsewhere. Bring them here without entering
 * everything again."
 *
 * Three routes in, in descending order of how much typing they save: a portal,
 * a spreadsheet, or the ordinary wizard. The third is a link rather than a
 * form — there is one listing creation flow and this is not a second one.
 */

export const dynamic = "force-dynamic";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { error } = await searchParams;
  const t = await getTranslations("listingImport");
  const locale = await getLocale();
  const supabase = await createClient();

  const { data: batches } = await supabase
    .from("import_batches")
    .select("id, source_kind, source_portal, source_label, status, found_count, imported_count, failed_count, created_at")
    .eq("agent_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const when = new Intl.DateTimeFormat(locale, {
    day: "numeric", month: "short", timeZone: "Asia/Jakarta",
  });

  return (
    <AgentShell wide>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">{t("subtitle")}</p>

      {error && (
        <p className="mt-5 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {t(`errors.${error}`)}
        </p>
      )}

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {/* Method 1 — portal ------------------------------------------------ */}
        <section className="rounded-xl border border-line p-5 lg:col-span-2">
          <h2 className="font-semibold">{t("portal.title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("portal.help")}</p>
          <div className="mt-4">
            <ImportStarter
              portals={portalChoices()}
              labels={{
                portal: t("portal.choose"),
                tabProfile: t("portal.tabProfile"),
                tabUrls: t("portal.tabUrls"),
                profileHelp: t("portal.profileHelp"),
                profilePlaceholder: t("portal.profilePlaceholder"),
                profileCta: t("portal.profileCta"),
                urlsHelp: t("portal.urlsHelp"),
                urlsPlaceholder: t("portal.urlsPlaceholder"),
                urlsCta: t("portal.urlsCta"),
                note: t("portal.note"),
              }}
            />
          </div>
        </section>

        <div className="space-y-5">
          {/* Method 2 — file ------------------------------------------------ */}
          <section className="rounded-xl border border-line p-5">
            <h2 className="font-semibold">{t("file.title")}</h2>
            <p className="mt-1 text-sm text-muted">{t("file.help")}</p>
            <FileUpload
              labels={{
                choose: t("file.choose"),
                formats: t("file.formats"),
                cta: t("file.cta"),
                needs: t("file.needs"),
                template: t("file.template"),
                tooLarge: t("errors.too_large"),
              }}
            />
          </section>

          {/* Method 3 — manual --------------------------------------------- */}
          <section className="rounded-xl border border-line p-5">
            <h2 className="font-semibold">{t("manual.title")}</h2>
            <p className="mt-1 text-sm text-muted">{t("manual.help")}</p>
            <Link
              href="/listings/new"
              className="mt-4 inline-block rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-crimson hover:text-crimson"
            >
              {t("manual.cta")}
            </Link>
          </section>
        </div>
      </div>

      {/* History ----------------------------------------------------------- */}
      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-muted">
        {t("history.title")}
      </h2>
      {!batches?.length ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
          {t("history.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">{t("history.source")}</th>
                <th className="px-4 py-3">{t("history.date")}</th>
                <th className="px-4 py-3 text-right">{t("history.found")}</th>
                <th className="px-4 py-3 text-right">{t("history.imported")}</th>
                <th className="px-4 py-3 text-right">{t("history.failed")}</th>
                <th className="px-4 py-3">{t("history.status")}</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t border-line hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`/listings/import/${b.id}`} className="font-medium text-crimson hover:underline">
                      {b.source_portal ?? b.source_kind}
                    </Link>
                    <span className="block truncate text-xs text-muted">{b.source_label}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{when.format(new Date(b.created_at))}</td>
                  <td className="px-4 py-3 text-right">{b.found_count}</td>
                  <td className="px-4 py-3 text-right font-semibold">{b.imported_count}</td>
                  <td className="px-4 py-3 text-right">{b.failed_count}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-surface px-2 py-0.5 text-xs">
                      {t(`status.${b.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AgentShell>
  );
}
