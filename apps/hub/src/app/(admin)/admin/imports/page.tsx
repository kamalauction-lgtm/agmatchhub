import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireCapability, capabilityCountries } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { portalChoices } from "@/lib/import/adapters";
import { startImport } from "@/app/(agent)/listings/import/actions";
import { uploadSpreadsheet } from "@/app/(agent)/listings/import/upload-actions";

/**
 * Assisted listing import (P0-d-1, 00107).
 *
 * The admin prepares a batch that belongs to the agent; the agent reviews it,
 * accepts the import authority declaration in their own session and commits.
 * The same importer and the same review as the agent's own import — this page
 * only chooses the agent. The agent list is limited to the admin's countries,
 * and the database checks listing.import_assisted again for every batch.
 */

export const dynamic = "force-dynamic";

const AGENT_STATUSES = ["verified", "under_review", "documents_pending", "additional_information_required"];

export default async function AdminImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireCapability("listing.import_assisted");
  const { error } = await searchParams;
  const t = await getTranslations("adminImports");
  const supabase = await createClient();

  const scope = await capabilityCountries("listing.import_assisted");
  let agentQuery = supabase
    .from("profiles")
    .select("id, display_name, country_code, agent_status")
    .in("agent_status", AGENT_STATUSES)
    .neq("id", me.id)
    .order("display_name")
    .limit(300);
  if (scope) agentQuery = agentQuery.in("country_code", scope);

  const [{ data: agents }, { data: batches }] = await Promise.all([
    agentQuery,
    supabase
      .from("import_batches")
      .select("id, agent_id, source_portal, source_label, status, found_count, imported_count, handed_over_at, created_at, profiles(display_name)")
      .not("acting_admin_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const input =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";
  const agentSelect = (
    <label className="block text-sm">
      <span className="font-medium">{t("agent")}</span>
      <select name="forAgentId" required className={input} defaultValue="">
        <option value="" disabled>{t("chooseAgent")}</option>
        {(agents ?? []).map((a) => (
          <option key={a.id} value={a.id}>
            {a.display_name ?? a.id.slice(0, 8)} · {a.country_code ?? "—"} · {a.agent_status}
          </option>
        ))}
      </select>
    </label>
  );
  const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {error && (
        <p className="mb-6 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as never) : t("errors.failed")}
        </p>
      )}

      {!(agents ?? []).length ? (
        <p className="mb-10 rounded-xl border border-dashed border-line p-6 text-sm text-muted">{t("noAgents")}</p>
      ) : (
        <div className="mb-10 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-line p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("fileTitle")}</h2>
            <p className="mt-1 text-xs text-muted">{t("fileHint")}</p>
            <form action={uploadSpreadsheet} encType="multipart/form-data" className="mt-4 space-y-4">
              {agentSelect}
              <label className="block text-sm">
                <span className="font-medium">{t("file")}</span>
                <input type="file" name="file" required accept=".xlsx,.csv" className="mt-1 block w-full text-sm" />
              </label>
              <button type="submit" className="min-h-11 cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white hover:bg-crimson-strong">
                {t("startCta")}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-line p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("linksTitle")}</h2>
            <p className="mt-1 text-xs text-muted">{t("linksHint")}</p>
            <form action={startImport} className="mt-4 space-y-4">
              {agentSelect}
              <label className="block text-sm">
                <span className="font-medium">{t("portal")}</span>
                <select name="portal" className={input} defaultValue="other">
                  {portalChoices().map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>
              <input type="hidden" name="mode" value="urls" />
              <label className="block text-sm">
                <span className="font-medium">{t("links")}</span>
                <textarea name="input" required rows={4} className={input} placeholder="https://…" />
              </label>
              <button type="submit" className="min-h-11 cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white hover:bg-crimson-strong">
                {t("startCta")}
              </button>
            </form>
          </section>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("listTitle")}</h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">{t("agent")}</th>
                <th className="px-4 py-3">{t("source")}</th>
                <th className="px-4 py-3">{t("items")}</th>
                <th className="px-4 py-3">{t("state")}</th>
                <th className="px-4 py-3">{t("created")}</th>
              </tr>
            </thead>
            <tbody>
              {(batches ?? []).map((b) => {
                const agent = (Array.isArray(b.profiles) ? b.profiles[0] : b.profiles) as { display_name: string | null } | null;
                const state = b.imported_count > 0 ? "committed" : b.handed_over_at ? "handed_over" : "preparing";
                return (
                  <tr key={b.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <Link href={`/admin/imports/${b.id}`} className="font-medium hover:text-crimson">
                        {agent?.display_name ?? b.agent_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{b.source_portal} · {b.source_label}</td>
                    <td className="px-4 py-3">{b.imported_count}/{b.found_count}</td>
                    <td className="px-4 py-3">{t(`stateLabel.${state}` as never)}</td>
                    <td className="px-4 py-3 text-muted">{when.format(new Date(b.created_at))}</td>
                  </tr>
                );
              })}
              {!(batches ?? []).length && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">{t("empty")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
