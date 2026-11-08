import { getTranslations } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { grantRole, revokeRole } from "./actions";

/**
 * Who can do what.
 *
 * The screen the platform has never had. Before migration 00060 the only way
 * to create an admin was a developer running a script against the database, so
 * nothing could be delegated — not verification, not moderation, not the
 * listing photographs waiting on an admin who could not be appointed.
 *
 * It shows the capability matrix alongside the grants deliberately. "Make them
 * a compliance admin" means nothing to the person clicking it unless the page
 * also says what a compliance admin may then do.
 */

export const dynamic = "force-dynamic";

const ROLE_KEYS = ["admin", "country_admin", "compliance_admin", "super_admin"] as const;

const NOTICE_TONE: Record<string, "ok" | "warn"> = {
  granted: "ok",
  revoked: "ok",
  self: "warn",
  last_super_admin: "warn",
  already_held: "warn",
  scope_not_supported: "warn",
  denied: "warn",
  invalid: "warn",
  not_found: "warn",
  unknown_role: "warn",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; q?: string }>;
}) {
  const actor = await requireCapability("roles.manage");
  const { notice, q } = await searchParams;
  const t = await getTranslations("adminUsers");
  const supabase = await createClient();

  const [{ data: roles }, { data: matrix }, { data: grants }] = await Promise.all([
    supabase.from("roles").select("id, key, name, description").order("key"),
    supabase.from("role_capabilities").select("role_id, capability_key"),
    supabase
      .from("user_roles")
      .select("id, user_id, country_codes, granted_at, roles(key, name)")
      .order("granted_at", { ascending: false }),
  ]);

  // Everyone who could be given a role. Bounded, and searchable, because the
  // list grows with the agent base.
  let peopleQuery = supabase
    .from("profiles")
    .select("id, display_name, agent_status")
    .order("display_name")
    .limit(200);
  if (q?.trim()) peopleQuery = peopleQuery.ilike("display_name", `%${q.trim()}%`);
  const { data: people } = await peopleQuery;

  const capsByRole = new Map<string, string[]>();
  for (const row of matrix ?? []) {
    const list = capsByRole.get(row.role_id) ?? [];
    list.push(row.capability_key);
    capsByRole.set(row.role_id, list);
  }

  const nameById = new Map((people ?? []).map((p) => [p.id, p.display_name ?? p.id]));
  const holders = (grants ?? []).filter((g) => g.roles);

  const when = new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta",
  });

  const input =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {notice && (
        <p
          className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${
            NOTICE_TONE[notice] === "ok"
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning"
          }`}
        >
          {t(`notice.${notice}` as never)}
        </p>
      )}

      {/* Who holds what --------------------------------------------------- */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("currentTitle")}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">{t("person")}</th>
                <th className="px-4 py-3">{t("role")}</th>
                <th className="px-4 py-3">{t("scope")}</th>
                <th className="px-4 py-3">{t("granted")}</th>
                <th className="px-4 py-3 text-right">{t("action")}</th>
              </tr>
            </thead>
            <tbody>
              {holders.map((g) => {
                const role = g.roles as unknown as { key: string; name: string };
                const isSelf = g.user_id === actor.id;
                const scope = g.country_codes as string[] | null;
                return (
                  <tr key={g.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium">
                      {nameById.get(g.user_id) ?? (
                        <span className="font-mono text-xs text-muted">{g.user_id.slice(0, 8)}</span>
                      )}
                      {isSelf && (
                        <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-xs text-muted">
                          {t("you")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{role.name}</td>
                    <td className="px-4 py-3 text-muted">
                      {scope?.length ? scope.join(", ") : t("allCountries")}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {g.granted_at ? when.format(new Date(g.granted_at)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSelf ? (
                        /* Not a disabled button with no explanation: the reason
                           is the protection itself, so say it. */
                        <span className="text-xs text-muted">{t("cannotEditSelf")}</span>
                      ) : (
                        <form action={revokeRole} className="inline">
                          <input type="hidden" name="grantId" value={g.id} />
                          <button
                            type="submit"
                            className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold text-muted transition-colors duration-200 hover:border-danger hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
                          >
                            {t("revoke")}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!holders.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    {t("noGrants")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Grant ------------------------------------------------------------ */}
      <section className="mb-10 rounded-xl border border-line p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t("grantTitle")}
        </h2>

        <form className="mt-4 flex flex-wrap items-end gap-3" action="/admin/users">
          <label className="block text-sm">
            <span className="font-medium">{t("search")}</span>
            <input name="q" defaultValue={q ?? ""} className={input} placeholder={t("searchHint")} />
          </label>
          <button
            type="submit"
            className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-semibold hover:border-crimson hover:text-crimson"
          >
            {t("searchCta")}
          </button>
        </form>

        <form action={grantRole} className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="block text-sm sm:col-span-1">
            <span className="font-medium">{t("person")}</span>
            <select name="userId" required className={input}>
              <option value="">—</option>
              {(people ?? [])
                .filter((p) => p.id !== actor.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name ?? p.id.slice(0, 8)}
                    {p.agent_status ? ` · ${p.agent_status}` : ""}
                  </option>
                ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium">{t("role")}</span>
            <select name="roleKey" required defaultValue="admin" className={input}>
              {ROLE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {(roles ?? []).find((r) => r.key === k)?.name ?? k}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium">{t("scope")}</span>
            <input name="countryCodes" placeholder="ID, MY" className={input} />
            <span className="mt-1 block text-xs text-muted">{t("scopeHint")}</span>
          </label>

          <div className="sm:col-span-3">
            <button
              type="submit"
              className="min-h-11 cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-crimson-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
            >
              {t("grantCta")}
            </button>
          </div>
        </form>
      </section>

      {/* The matrix ------------------------------------------------------- */}
      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("matrixTitle")}
        </h2>
        <p className="mb-3 max-w-2xl text-sm text-muted">{t("matrixIntro")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {(roles ?? [])
            .filter((r) => r.key !== "agent")
            .map((r) => {
              const caps = (capsByRole.get(r.id) ?? []).sort();
              return (
                <div key={r.id} className="rounded-xl border border-line p-4">
                  <h3 className="font-semibold">{r.name}</h3>
                  <p className="mt-0.5 text-xs text-muted">{r.description}</p>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {caps.map((c) => (
                      <li
                        key={c}
                        className="rounded-md bg-surface px-2 py-1 font-mono text-xs text-muted"
                      >
                        {c}
                      </li>
                    ))}
                    {!caps.length && <li className="text-xs text-muted">—</li>}
                  </ul>
                </div>
              );
            })}
        </div>
      </section>
    </>
  );
}
