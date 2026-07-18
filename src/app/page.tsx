import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { BrandLockup } from "@/components/layout/brand-lockup";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export default async function LandingPage() {
  const t = await getTranslations("landing");
  const tc = await getTranslations("common");

  const pillars = ["protect", "control", "audit"] as const;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <BrandLockup size={30} />
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <Link
            href="/login"
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-crimson hover:text-crimson"
          >
            {tc("signIn")}
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
          <p className="mb-4 text-sm font-semibold tracking-widest text-crimson uppercase">
            {brand.appName}
          </p>
          <h1 className="mx-auto mb-6 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-8 text-muted">
            {t("heroBody")}
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="w-full rounded-lg bg-crimson px-6 py-3 font-semibold text-white transition-colors hover:bg-crimson-strong sm:w-auto"
            >
              {t("ctaRegister")}
            </Link>
            <Link
              href="/login"
              className="w-full rounded-lg border border-line px-6 py-3 font-semibold transition-colors hover:border-crimson hover:text-crimson sm:w-auto"
            >
              {t("ctaSignIn")}
            </Link>
          </div>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto grid max-w-5xl gap-8 px-6 py-16 sm:grid-cols-3">
            {pillars.map((key) => (
              <div key={key} className="rounded-xl border border-line bg-background p-6">
                <h2 className="mb-2 font-semibold">{t(`pillars.${key}`)}</h2>
                <p className="text-sm leading-6 text-muted">{t(`pillars.${key}Body`)}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-6 py-6 text-center text-xs text-muted">
        {brand.appName} — {brand.tagline}
      </footer>
    </div>
  );
}
