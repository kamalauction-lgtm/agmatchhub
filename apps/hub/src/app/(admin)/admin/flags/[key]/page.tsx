import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { toggleFlag, setFlagTargeted, addFlagTarget, removeFlagTarget } from "../actions";

/**
 * One feature switch, and who it applies to.
 *
 * The list screen answers "is this on"; this one answers "on for whom", which
 * is the question a staged rollout actually turns on. Both numbers on the page
 * — the reach and the target list — come from the same resolver the product
 * uses, so what the admin reads here is what agents get.
 */

export const dynamic = "force-dynamic";

/** How many people the person picker offers before it says so. */
const PEOPLE_LIMIT = 200;

type Target = {
  id: string;
  target_type: string;
  subject_id: string;
  subject_label: string;
};

export default async function FlagDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireCapability("platform.configure");
  const { key } = await params;
  const { notice } = await searchParams;
  const t = await getTranslations("flags");
  const supabase = await createClient();

  const { data: flag } = await supabase
    .from("feature_flags")
    .select("key, name, description, enabled, targeted, updated_at")
    .eq("key", key)
    .maybeSingle();
  if (!flag) notFound();

  const [{ data: targets }, { data: reach }, { data: agents, count: peopleTotal }, { data: agencies }, { data: countries }, { data: campaigns }] =
    await Promise.all([
      supabase.rpc("feature_flag_target_list", { p_key: key }),
      supabase.rpc("feature_flag_reach", { p_key: key }),
      // Capped, and the cap is stated on the page rather than silently cutting
      // the list at 200 names. Person-targeting a flag is a pilot tool; when
      // the platform outgrows a dropdown this becomes a search field.
      supabase.from("profiles").select("id, display_name", { count: "exact" }).order("display_name").limit(PEOPLE_LIMIT),
      supabase.from("agencies").select("id, name").order("name"),
      supabase.from("countries").select("code, name").order("name"),
      supabase.from("growth_campaigns").select("id, name").order("name"),
    ]);

  const list = (targets ?? []) as Target[];
  const input =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson";

  return (
    <>
      <Link href="/admin/flags" className="text-sm text-muted hover:text-crimson">
        {t("backToFlags")}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{flag.name}</h1>
          <p className="mt-1 text-sm text-muted">{flag.description}</p>
          <p className="mt-0.5 font-mono text-xs text-muted">{flag.key}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              flag.enabled ? "bg-success/10 text-success" : "bg-surface text-muted"
            }`}
          >
            {flag.enabled ? t("on") : t("off")}
          </span>
          <form action={toggleFlag}>
            <input type="hidden" name="key" value={flag.key} />
            <input type="hidden" name="enabled" value={flag.enabled ? "false" : "true"} />
            <button
              type="submit"
              className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold transition-colors duration-200 hover:border-crimson hover:text-crimson"
            >
              {flag.enabled ? t("turnOff") : t("turnOn")}
            </button>
          </form>
        </div>
      </div>

      {notice && (
        <p
          className={`mt-5 rounded-lg px-4 py-3 text-sm font-medium ${
            ["updated", "target_added", "target_removed"].includes(notice)
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning"
          }`}
        >
          {t(`notice.${notice}` as never)}
        </p>
      )}

      {/* Reach ------------------------------------------------------------ */}
      <p className="mt-6 rounded-xl border border-line px-4 py-3 text-sm">
        {t("reach", { count: Number(reach ?? 0) })}
      </p>

      {/* Scope ------------------------------------------------------------ */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("scopeTitle")}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          {flag.targeted ? t("scopeTargeted") : t("scopeEveryone")}
        </p>
        {/* Off beats targeting, always — worth saying where somebody is about
            to reason about the two together. */}
        <p className="mt-2 max-w-2xl border-l-2 border-crimson pl-3 text-sm italic text-muted">
          {t("offWins")}
        </p>

        <form action={setFlagTargeted} className="mt-3">
          <input type="hidden" name="key" value={flag.key} />
          <input type="hidden" name="targeted" value={flag.targeted ? "false" : "true"} />
          <button
            type="submit"
            className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold transition-colors duration-200 hover:border-crimson hover:text-crimson"
          >
            {flag.targeted ? t("applyToEveryone") : t("limitToTargets")}
          </button>
        </form>
      </section>

      {/* Targets ---------------------------------------------------------- */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("targetsTitle")}
        </h2>

        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-muted">
            {t("noTargets")}
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {list.map((tg) => (
              <li key={tg.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <span className="mr-2 rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-muted">
                    {t(`targetType.${tg.target_type}` as never)}
                  </span>
                  <span className="font-medium">{tg.subject_label}</span>
                </div>
                <form action={removeFlagTarget}>
                  <input type="hidden" name="key" value={flag.key} />
                  <input type="hidden" name="id" value={tg.id} />
                  <button
                    type="submit"
                    className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-xs font-semibold text-muted transition-colors duration-200 hover:border-danger hover:text-danger"
                  >
                    {t("removeTarget")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {/* Add ------------------------------------------------------------ */}
        <form action={addFlagTarget} className="mt-4 grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-3">
          <input type="hidden" name="key" value={flag.key} />
          <label className="block text-xs font-semibold">
            {t("targetTypeLabel")}
            <select name="targetType" defaultValue="country" className={input}>
              {["user", "agency", "country", "campaign"].map((tt) => (
                <option key={tt} value={tt}>{t(`targetType.${tt}` as never)}</option>
              ))}
            </select>
          </label>

          {/* Every subject selector is present; the action reads only the one
              the chosen type names. Four dependent dropdowns would need client
              state for no gain — the server already decides. */}
          <label className="block text-xs font-semibold">
            {t("person")}
            <select name="userId" className={input}>
              <option value="">—</option>
              {(agents ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.display_name ?? a.id}</option>
              ))}
            </select>
            {(peopleTotal ?? 0) > PEOPLE_LIMIT && (
              <span className="mt-1 block text-xs font-normal text-muted">
                {t("peopleCapped", { shown: PEOPLE_LIMIT, total: peopleTotal ?? 0 })}
              </span>
            )}
          </label>
          <label className="block text-xs font-semibold">
            {t("organisation")}
            <select name="agencyId" className={input}>
              <option value="">—</option>
              {(agencies ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold">
            {t("country")}
            <select name="countryCode" className={input}>
              <option value="">—</option>
              {(countries ?? []).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold">
            {t("campaign")}
            <select name="campaignId" className={input}>
              <option value="">—</option>
              {(campaigns ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className="min-h-11 w-full cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-crimson-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
            >
              {t("addTarget")}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
