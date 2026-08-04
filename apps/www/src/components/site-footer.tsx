import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-card border border-line bg-surface-raised p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <p className="font-semibold">{t("forAgents")}</p>
            <p className="mt-1 text-sm text-muted">{t("agentPitch")}</p>
          </div>
          <a
            href={brand.hubUrl}
            className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong sm:mt-0 sm:shrink-0"
          >
            {t("openHub")}
          </a>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-muted">{t("disclaimer")}</p>
        <p className="mt-3 text-xs text-muted">
          © {year} {brand.appName}. {t("rights")}
        </p>
      </div>
    </footer>
  );
}
