import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { publicPath } from "@/i18n/routing";
import { market } from "@/config/market";

export async function SiteFooter({ locale }: { locale: string }) {
  const t = await getTranslations("footer");
  const tn = await getTranslations("nav");
  const year = new Date().getFullYear();

  return (
    <footer className="command-band mt-16">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="flex items-center gap-2 text-lg font-extrabold">
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-black text-white">P</span>
              {brand.appName}
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-command-muted">{t("disclaimer")}</p>
            <p className="mt-3 max-w-md text-xs leading-relaxed text-command-muted/80">{t("aiDisclosure")}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-command-gold">{t("explore")}</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href={`${publicPath(locale, "search")}?type=sale`} className="text-command-muted hover:text-white">{tn("buy")}</Link></li>
              <li><Link href={`${publicPath(locale, "search")}?type=rent`} className="text-command-muted hover:text-white">{tn("rent")}</Link></li>
              <li><Link href={publicPath(locale, "assistant")} className="text-command-muted hover:text-white">{tn("assistant")}</Link></li>
              <li><Link href={publicPath(locale, "compare")} className="text-command-muted hover:text-white">{tn("compare")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-command-gold">{tn("forAgents")}</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href={`${market.hubUrl}/register`} className="text-command-muted hover:text-white">{t("agentJoin")}</a></li>
              <li><a href={`${market.hubUrl}/login`} className="text-command-muted hover:text-white">{tn("agentLogin")}</a></li>
            </ul>
          </div>
        </div>
        <div className="gold-rule mt-10" />
        <p className="mt-5 text-xs text-command-muted">
          © {year} {brand.appName}. {t("rights")}
        </p>
      </div>
    </footer>
  );
}
