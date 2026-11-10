import { getTranslations } from "next-intl/server";
import { submitInquiry, type ActiveDeclaration } from "@/lib/inquiry";

/**
 * Server-rendered inquiry form. Zero client JavaScript: a plain POST to the
 * server action, feedback via ?inquiry= on the redirect back. Works with JS
 * disabled and on the slowest connection — the buyer journey must not depend
 * on a bundle loading (§5 mobile-first).
 */
export async function InquiryForm({
  slug,
  locale,
  consent,
  status,
  leadRef,
  errorField,
}: {
  slug: string;
  locale: string;
  consent: ActiveDeclaration;
  status?: string;
  leadRef?: string;
  errorField?: string;
}) {
  const t = await getTranslations("inquiry");

  if (status === "sent" && leadRef) {
    return (
      <div
        id="tanya"
        className="rounded-card border border-success/40 bg-success/5 p-5"
        role="status"
      >
        <p className="font-bold text-success">{t("sentTitle")}</p>
        <p className="mt-2 text-sm leading-relaxed">{t("sentBody")}</p>
        <p className="mt-3 text-xs text-muted">
          {t("sentRef")}: <span className="font-mono font-semibold">{leadRef}</span>
        </p>
      </div>
    );
  }

  const errorKeys: Record<string, string> = {
    invalid_name: "errorName",
    invalid_phone: "errorPhone",
    invalid_email: "errorEmail",
    rate_limited: "errorRateLimited",
    consent_required: "errorConsent",
    listing_not_found: "errorListingGone",
    invalid: "errorInvalid",
    error: "errorGeneric",
  };
  const errorKey = status && status !== "sent" ? (errorKeys[status] ?? "errorGeneric") : null;

  return (
    <form id="tanya" action={submitInquiry} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="consentVersionId" value={consent.version_id} />
      {/* Honeypot — hidden from humans, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {errorKey && (
        <p
          className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {t(errorKey as never)}
          {errorField ? ` (${errorField})` : ""}
        </p>
      )}

      <div>
        <label htmlFor="inq-name" className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("name")} *
        </label>
        <input
          id="inq-name"
          name="fullName"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5"
        />
      </div>

      <div>
        <label htmlFor="inq-phone" className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("phone")} *
        </label>
        <input
          id="inq-phone"
          name="phone"
          type="tel"
          required
          placeholder="0812 3456 7890"
          autoComplete="tel"
          className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5"
        />
        <p className="mt-1 text-xs text-muted">{t("phoneHelp")}</p>
      </div>

      <div>
        <label htmlFor="inq-email" className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("email")}
        </label>
        <input
          id="inq-email"
          name="email"
          type="email"
          maxLength={200}
          autoComplete="email"
          className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5"
        />
      </div>

      <div>
        <label htmlFor="inq-type" className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("type")}
        </label>
        <select
          id="inq-type"
          name="inquiryType"
          defaultValue="viewing_request"
          className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5"
        >
          <option value="viewing_request">{t("typeViewing")}</option>
          <option value="availability">{t("typeAvailability")}</option>
          <option value="price_question">{t("typePrice")}</option>
          <option value="financing">{t("typeFinancing")}</option>
          <option value="general">{t("typeGeneral")}</option>
        </select>
      </div>

      <div>
        <label htmlFor="inq-message" className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("message")}
        </label>
        <textarea
          id="inq-message"
          name="message"
          rows={3}
          maxLength={2000}
          className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2.5"
        />
      </div>

      {/* The exact consent text is rendered, not summarised — what the buyer
          ticks is byte-for-byte what consent_records stores (§31). */}
      <label className="flex items-start gap-2.5 rounded-lg border border-line bg-surface p-3">
        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="text-xs leading-relaxed text-muted">{consent.body}</span>
      </label>

      <button
        type="submit"
        className="w-full cursor-pointer rounded-lg bg-electric py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-electric-strong"
      >
        {t("submit")}
      </button>
    </form>
  );
}
