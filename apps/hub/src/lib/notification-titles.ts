import "server-only";
import en from "../../messages/en.json";
import ms from "../../messages/ms.json";
import id from "../../messages/id.json";

type Dict = { notificationsPage: { kinds: Record<string, string>; emailOpen?: string } };
const dicts: Record<string, Dict> = { en, ms, id };

/** Human title for a notification kind in the recipient's language. */
export function notificationTitle(kind: string, locale: string): string {
  const key = kind.replaceAll(".", "_");
  const dict = dicts[locale] ?? dicts.en;
  return (
    dict.notificationsPage.kinds[key] ??
    dicts.en.notificationsPage.kinds[key] ??
    // D10: never a hard-coded brand name; a neutral, translated fallback.
    dict.notificationsPage.kinds.generic ??
    dicts.en.notificationsPage.kinds.generic ??
    "Notification"
  );
}

/** The email button label in the recipient's language (D10: no brand in code). */
export function notificationOpenLabel(locale: string): string {
  const dict = dicts[locale] ?? dicts.en;
  return dict.notificationsPage.emailOpen ?? dicts.en.notificationsPage.emailOpen ?? "Open";
}
