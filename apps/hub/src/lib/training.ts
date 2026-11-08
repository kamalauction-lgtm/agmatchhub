/**
 * Best available translation for a reader: UI locale → id (the market's
 * language) → en → whatever exists. The fallback never leaves the guide —
 * a missing translation shows another language, not an empty page.
 */
export function pickTranslation<T extends { locale: string }>(
  translations: T[],
  uiLocale: string
): T | null {
  return (
    translations.find((t) => t.locale === uiLocale) ??
    translations.find((t) => t.locale === "id") ??
    translations.find((t) => t.locale === "en") ??
    translations[0] ??
    null
  );
}
