import { getTranslations } from "next-intl/server";
import { submitReport } from "@/lib/report";

/**
 * "Report this listing" (D9). Server-rendered, zero client JavaScript: a
 * collapsed <details> holding a plain POST to the server action; the outcome
 * comes back as ?report= on the redirect. Anonymous by design.
 */
const REASONS = ["wrong_info", "already_sold", "duplicate", "wrong_photos", "scam_or_fraud", "offensive", "other"] as const;

export async function ReportListing({ slug, locale, status }: { slug: string; locale: string; status?: string }) {
  const t = await getTranslations("report");

  if (status === "sent") {
    return (
      <p id="laporkan" className="mt-6 rounded-lg bg-surface px-4 py-3 text-sm text-muted" role="status" data-report="sent">
        {t("sent")}
      </p>
    );
  }
  const error = status && t.has(`errors.${status}` as never) ? t(`errors.${status}` as never) : status ? t("errors.error") : null;

  return (
    <details id="laporkan" className="mt-6 text-sm" open={!!error} data-report="form">
      <summary className="cursor-pointer text-muted underline-offset-2 hover:text-foreground hover:underline">{t("open")}</summary>
      <form action={submitReport} className="mt-3 max-w-md space-y-3 rounded-xl border border-line p-4">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="locale" value={locale} />
        <div aria-hidden="true" className="hidden">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <p className="text-muted">{t("intro")}</p>
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 font-medium text-danger" role="alert">{error}</p>}
        <label className="block">
          <span className="mb-1 block font-medium">{t("reason")}</span>
          <select name="reason" required defaultValue="" className="w-full rounded-lg border border-line bg-background px-3 py-2">
            <option value="" disabled>{t("choose")}</option>
            {REASONS.map((r) => <option key={r} value={r}>{t(`reasons.${r}`)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">{t("details")}</span>
          <textarea name="details" maxLength={1000} rows={3} className="w-full rounded-lg border border-line bg-background px-3 py-2" placeholder={t("detailsHint")} />
        </label>
        <button type="submit" className="min-h-11 cursor-pointer rounded-lg border border-line px-4 font-medium hover:border-foreground">{t("send")}</button>
      </form>
    </details>
  );
}
