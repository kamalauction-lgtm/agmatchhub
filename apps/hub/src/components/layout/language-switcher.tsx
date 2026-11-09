import { getLocale } from "next-intl/server";
import { setLocale } from "@/app/actions";
import { allowedLocalesForCountry } from "@/i18n/request";
import { createClient } from "@/lib/supabase/server";

const labels: Record<string, string> = { en: "EN", ms: "BM", id: "ID" };

export async function LanguageSwitcher() {
  const current = await getLocale();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("country_code").eq("id", user.id).maybeSingle()
    : { data: null };
  const options = allowedLocalesForCountry(profile?.country_code);
  return (
    <form action={setLocale} className="flex items-center gap-1 text-sm">
      {options.map((locale) => (
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
