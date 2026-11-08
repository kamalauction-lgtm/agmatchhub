import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { toggleFlag } from "./actions";

/**
 * Feature switches.
 *
 * The controls §38 asks for: turn the referral programme off, stop issuing
 * rewards, close registrations — without a deploy and without editing rows by
 * hand at two in the morning.
 *
 * The page states the distinction that matters, because somebody will
 * eventually try to use a flag as a permission: a flag decides whether a
 * FEATURE exists, never whether a PERSON may act. Permissions live in the role
 * matrix, and using a flag for one produces a control that looks like security
 * and is not.
 */

export const dynamic = "force-dynamic";

/** Grouped so the growth kill switches are not buried among product toggles. */
const GROUPS: Record<string, string[]> = {
  growth: [
    "referrals", "referral_registration", "reward_issuing",
    "featured_rewards", "homepage_spotlight", "marketing_booster",
  ],
  product: ["listing_import", "comarketing", "matchhub", "paid_boosts", "ai_features", "custom_domains"],
  platform: ["new_registrations", "payments"],
};

export default async function FlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireCapability("platform.configure");
  const { notice } = await searchParams;
  const t = await getTranslations("flags");
  const supabase = await createClient();

  const { data: flags } = await supabase
    .from("feature_flags")
    .select("key, name, description, enabled, targeted, updated_at")
    .order("key");

  const byKey = new Map((flags ?? []).map((f) => [f.key, f]));
  // Anything not in a group still gets shown, so a flag added later cannot
  // become invisible just because this list was not updated.
  const grouped = new Set(Object.values(GROUPS).flat());
  const ungrouped = (flags ?? []).filter((f) => !grouped.has(f.key)).map((f) => f.key);

  const section = (titleKey: string, keys: string[]) => {
    const rows = keys.map((k) => byKey.get(k)).filter(Boolean);
    if (!rows.length) return null;
    return (
      <section key={titleKey} className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {t(`group.${titleKey}` as never)}
        </h2>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {rows.map((f) => (
            <li key={f!.key} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <Link href={`/admin/flags/${f!.key}`} className="font-medium hover:text-crimson">
                  {f!.name}
                </Link>
                <p className="text-xs text-muted">{f!.description}</p>
                <p className="mt-0.5 font-mono text-xs text-muted">{f!.key}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {/* A targeted flag reads as "on" while applying to a handful of
                    people. Without this badge the list would say the same thing
                    for platform-wide and pilot-only, which is the difference
                    somebody is checking the list to find out. */}
                {f!.targeted && (
                  <Link
                    href={`/admin/flags/${f!.key}`}
                    className="rounded-full bg-crimson-soft px-2.5 py-0.5 text-xs font-semibold text-crimson"
                  >
                    {t("limited")}
                  </Link>
                )}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    f!.enabled ? "bg-success/10 text-success" : "bg-surface text-muted"
                  }`}
                >
                  {f!.enabled ? t("on") : t("off")}
                </span>
                <form action={toggleFlag}>
                  <input type="hidden" name="key" value={f!.key} />
                  <input type="hidden" name="enabled" value={f!.enabled ? "false" : "true"} />
                  <button
                    type="submit"
                    className={`min-h-9 cursor-pointer rounded-lg border px-3 text-xs font-semibold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson ${
                      f!.enabled
                        ? "border-line text-muted hover:border-danger hover:text-danger"
                        : "border-line hover:border-crimson hover:text-crimson"
                    }`}
                  >
                    {f!.enabled ? t("turnOff") : t("turnOn")}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-2 mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>
      {/* The sentence that stops a flag being used as a permission. */}
      <p className="mb-6 max-w-2xl border-l-2 border-crimson pl-3 text-sm italic text-muted">
        {t("notAuthorization")}
      </p>

      {notice && (
        <p
          className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${
            notice === "updated" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
          }`}
        >
          {t(`notice.${notice}` as never)}
        </p>
      )}

      {section("growth", GROUPS.growth)}
      {section("product", GROUPS.product)}
      {section("platform", GROUPS.platform)}
      {ungrouped.length > 0 && section("other", ungrouped)}
    </>
  );
}
