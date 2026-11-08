import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getCompanions } from "@/lib/ai/cast";
import { CompanionBadge } from "@/components/ai/companion";
import { aiQuotaFor } from "@/lib/ai/engine";

/**
 * The head of every standalone AI tool page: back to the directory, the
 * colleague who works here (00097), title, intro and the month's allowance.
 */
export async function ToolHeader({ roleKey, title, intro, userId }: { roleKey: string; title: string; intro: string; userId: string }) {
  const t = await getTranslations("aiTools");
  const [cast, quota] = await Promise.all([getCompanions([roleKey]), aiQuotaFor(userId)]);
  const c = cast[roleKey];
  return (
    <header className="mb-6">
      <Link href="/ai" className="text-sm font-medium text-muted hover:text-crimson">← {t("backToWorkforce")}</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <CompanionBadge c={c} size="md" className="shrink-0" />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">{intro}</p>
          </div>
        </div>
        {quota && (
          <span className="rounded-full bg-blue-soft px-3 py-1 text-xs font-semibold text-blue">
            {t("quota", { remaining: quota.remaining, total: quota.monthly_allowance })}
          </span>
        )}
      </div>
    </header>
  );
}
