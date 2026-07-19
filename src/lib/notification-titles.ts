import "server-only";
import en from "../../messages/en.json";
import ms from "../../messages/ms.json";
import id from "../../messages/id.json";

type Dict = { notificationsPage: { kinds: Record<string, string> } };
const dicts: Record<string, Dict> = { en, ms, id };

/** Human title for a notification kind in the recipient's language. */
export function notificationTitle(kind: string, locale: string): string {
  const key = kind.replaceAll(".", "_");
  const dict = dicts[locale] ?? dicts.en;
  return (
    dict.notificationsPage.kinds[key] ??
    dicts.en.notificationsPage.kinds[key] ??
    "IQI AG MatchHub"
  );
}
