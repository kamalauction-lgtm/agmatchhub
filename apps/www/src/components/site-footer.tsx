import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-xs leading-relaxed text-muted">{t("disclaimer")}</p>
        <p className="mt-3 text-xs text-muted">
          © {year} {brand.appName}. {t("rights")}
        </p>
      </div>
    </footer>
  );
}
