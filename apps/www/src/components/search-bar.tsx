import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

/**
 * Server-rendered search form. A plain GET form means search works with
 * JavaScript disabled, on a slow connection, and produces shareable, indexable
 * URLs — which matters more here than any interaction polish.
 */
export async function SearchBar({
  locale,
  defaultType = "sale",
  defaultQuery = "",
  size = "large",
}: {
  locale: string;
  defaultType?: "sale" | "rent";
  defaultQuery?: string;
  size?: "large" | "compact";
}) {
  const t = await getTranslations("home");
  const action = locale === routing.defaultLocale ? "/cari" : `/${locale}/cari`;
  const large = size === "large";

  return (
    <form action={action} method="get" className="w-full">
      <div
        className="inline-flex rounded-lg bg-surface p-1 text-sm"
        role="group"
        aria-label={t("searchButton")}
      >
        {(["sale", "rent"] as const).map((value) => (
          <label
            key={value}
            className="cursor-pointer rounded-md px-3 py-1.5 font-medium has-[:checked]:bg-background has-[:checked]:shadow-sm has-[:checked]:font-semibold"
          >
            <input
              type="radio"
              name="type"
              value={value}
              defaultChecked={defaultType === value}
              className="sr-only"
            />
            {value === "sale" ? t("tabBuy") : t("tabRent")}
          </label>
        ))}
      </div>

      <div
        className={`mt-3 flex flex-col gap-2 rounded-card border border-line bg-surface-raised p-2 sm:flex-row ${
          large ? "shadow-sm" : ""
        }`}
      >
        <input
          type="search"
          name="q"
          defaultValue={defaultQuery}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className={`flex-1 rounded-lg bg-transparent px-3 outline-none placeholder:text-muted ${
            large ? "py-3 text-base" : "py-2.5 text-sm"
          }`}
        />
        <button
          type="submit"
          className={`rounded-lg bg-brand font-semibold text-white hover:bg-brand-strong ${
            large ? "px-6 py-3" : "px-5 py-2.5 text-sm"
          }`}
        >
          {t("searchButton")}
        </button>
      </div>
    </form>
  );
}
