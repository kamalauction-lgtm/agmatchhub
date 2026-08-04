import { getLocale } from "next-intl/server";
import { setLocale } from "@/app/actions";
import { locales } from "@/i18n/request";

const labels: Record<string, string> = { en: "EN", ms: "BM", id: "ID" };

export async function LanguageSwitcher() {
  const current = await getLocale();
  return (
    <form action={setLocale} className="flex items-center gap-1 text-sm">
      {locales.map((locale) => (
        <button
          key={locale}
          name="locale"
          value={locale}
          type="submit"
          aria-current={locale === current}
          className={`rounded px-2 py-1 transition-colors ${
            locale === current
              ? "bg-crimson-soft font-semibold text-crimson"
              : "text-muted hover:text-foreground"
          }`}
        >
          {labels[locale]}
        </button>
      ))}
    </form>
  );
}
