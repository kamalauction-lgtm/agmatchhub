import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/authz";
import { IdentitySwitch } from "@/components/admin/identity-switch";

/**
 * The activation switch for the operating group's identity (migration 00048).
 *
 * Kamal's launch decision, 9 Aug 2026: run neutral until the platform has
 * enough users to stand on its own, then turn the affiliation on here.
 *
 * The page's job is to make the blast radius legible before the click. An
 * admin should know exactly which surfaces change, and — just as important —
 * which ones do not.
 */

export const dynamic = "force-dynamic";

export default async function IdentityPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireAdmin();
  const { done, error } = await searchParams;
  const t = await getTranslations("adminIdentity");
  const locale = await getLocale();
  const supabase = await createClient();

  const { data } = await supabase
    .from("brand_settings")
    .select("partner_identity_public, partner_identity_activated_at")
    .eq("id", 1)
    .maybeSingle();

  const isPublic = data?.partner_identity_public === true;
  const activatedAt = data?.partner_identity_activated_at as string | null;

  const notice = done
    ? { tone: "success" as const, text: t(`done.${done}`) }
    : error
      ? { tone: "warn" as const, text: t(`errors.${error}`) }
      : null;

  const when = activatedAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(new Date(activatedAt))
    : null;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {notice && (
        <p
          className={`mt-5 rounded-lg px-4 py-3 text-sm font-medium ${
            notice.tone === "success"
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning"
          }`}
        >
          {notice.text}
        </p>
      )}

      {/* Current state ---------------------------------------------------- */}
      <section
        className={`mt-6 rounded-xl border p-5 ${
          isPublic ? "border-success/40 bg-success/5" : "border-line"
        }`}
      >
        <p className="text-sm font-semibold">
          {isPublic ? t("state.publicTitle") : t("state.hiddenTitle")}
        </p>
        <p className="mt-1 text-sm text-muted">
          {isPublic ? t("state.publicBody") : t("state.hiddenBody")}
        </p>
        {when && <p className="mt-2 text-xs text-muted">{t("state.since", { when })}</p>}
      </section>

      {/* What changes ----------------------------------------------------- */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line p-5">
          <h2 className="text-sm font-semibold">{t("affects.title")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {["logos", "agency", "copy"].map((k) => (
              <li key={k} className="flex gap-2">
                <span aria-hidden>•</span>
                <span>{t(`affects.${k}`)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Stated as prominently as what it DOES change. An admin who assumes
            this hides the company from the terms of service would be wrong in
            a way that matters. */}
        <section className="rounded-xl border border-line p-5">
          <h2 className="text-sm font-semibold">{t("unaffected.title")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {["legal", "data", "agents"].map((k) => (
              <li key={k} className="flex gap-2">
                <span aria-hidden>•</span>
                <span>{t(`unaffected.${k}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-6">
        <IdentitySwitch
          isPublic={isPublic}
          labels={{
            activate: t("activate"),
            hide: t("hide"),
            confirmActivate: t("confirmActivate"),
            confirmHide: t("confirmHide"),
            activateHelp: t("activateHelp"),
            hideHelp: t("hideHelp"),
            cacheNote: t("cacheNote"),
          }}
        />
      </div>
    </>
  );
}
