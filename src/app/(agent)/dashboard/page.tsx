import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { BrandLockup } from "@/components/layout/brand-lockup";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { signOut } from "@/app/(auth)/actions";

const STATUS_KEYS = [
  "draft", "email_verification_pending", "mobile_verification_pending",
  "documents_pending", "under_review", "additional_information_required",
  "verified", "rejected", "suspended", "temporarily_restricted", "banned",
  "expired_licence", "archived",
] as const;

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: isAdmin }] = await Promise.all([
    supabase.from("profiles").select("display_name, agent_status").eq("id", user.id).single(),
    supabase.rpc("is_platform_admin"),
  ]);

  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");

  const status = (STATUS_KEYS as readonly string[]).includes(profile?.agent_status ?? "")
    ? (profile!.agent_status as (typeof STATUS_KEYS)[number])
    : "draft";
  const isVerified = status === "verified";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <BrandLockup size={28} />
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-crimson hover:text-crimson"
            >
              {tc("signOut")}
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold">{t("title")}</h1>
        <p className="mb-8 text-muted">
          {t("welcome", { name: profile?.display_name ?? user.email ?? "" })}
        </p>

        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-2 text-sm font-medium text-muted">{t("statusLabel")}</h2>
          <span
            className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
              isVerified
                ? "bg-success/10 text-success"
                : "bg-crimson-soft text-crimson"
            }`}
          >
            {t(`status.${status}`)}
          </span>
          {!isVerified && (
            <>
              <p className="mt-3 text-sm leading-6 text-muted">{t("statusNote")}</p>
              <Link
                href="/verification"
                className="mt-4 inline-block rounded-lg bg-crimson px-5 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
              >
                {t("startVerification")}
              </Link>
            </>
          )}
        </section>

        {isVerified && (
          <Link
            href="/requests"
            className="mt-6 mr-3 inline-block rounded-lg bg-crimson px-5 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
          >
            {t("myRequests")}
          </Link>
        )}

        {isAdmin && (
          <Link
            href="/admin"
            className="mt-6 inline-block rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:border-crimson hover:text-crimson"
          >
            {t("adminConsole")}
          </Link>
        )}
      </main>
    </div>
  );
}
