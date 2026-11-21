import { getTranslations } from "next-intl/server";
import type { ActiveDeclaration } from "@/lib/inquiry";
import { submitInternationalEnquiry } from "@/lib/international-enquiry";
import { ChatIcon } from "./icons";

/**
 * The international enquiry form. Server-rendered, no client JavaScript: a
 * plain POST to the server action, which records the enquiry and then sends
 * the browser to WhatsApp. Feedback for everything else comes back on
 * `?enquiry=` — a known outcome code, mapped to a translated sentence here.
 * Nothing from the database is ever printed as-is.
 *
 * Consent is the same mechanism as the local listing form: the active
 * `buyer_inquiry` declaration, its exact text shown beside the tick box and
 * its version id posted with the form.
 */

const ERROR_KEYS: Record<string, string> = {
  invalid_name: "errorName",
  invalid_phone: "errorPhone",
  invalid_email: "errorEmail",
  message_too_long: "errorMessageLong",
  listing_not_found: "errorListingGone",
  consent_required: "errorConsent",
  rate_limited: "errorRateLimited",
  invalid: "errorInvalid",
  error: "errorGeneric",
};

const field = "mt-1 min-h-11 w-full rounded-lg border border-line bg-background px-3 py-2.5";
const fieldLabel = "text-xs font-semibold uppercase tracking-wide text-muted";

export async function InternationalEnquiryForm({
  slug,
  locale,
  consent,
  status,
}: {
  slug: string;
  locale: string;
  consent: ActiveDeclaration | null;
  status?: string;
}) {
  const t = await getTranslations("international");

  if (status === "received") {
    return (
      <div className="rounded-card border border-success/40 bg-success/5 p-5" role="status">
        <p className="font-bold text-success">{t("receivedTitle")}</p>
        <p className="mt-2 text-sm leading-relaxed">{t("receivedBody")}</p>
      </div>
    );
  }

  if (!consent) {
    return (
      <p className="rounded-lg border border-line bg-surface p-3 text-sm text-muted">
        {t("formUnavailable")}
      </p>
    );
  }

  const errorKey = status ? (ERROR_KEYS[status] ?? "errorGeneric") : null;

  return (
    <form action={submitInternationalEnquiry} className="space-y-3">
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
        </p>
      )}

      <div>
        <label htmlFor="intl-name" className={fieldLabel}>
          {t("formName")} *
        </label>
        <input
          id="intl-name"
          name="fullName"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          className={field}
        />
      </div>

      <div>
        <label htmlFor="intl-phone" className={fieldLabel}>
          {t("formPhone")} *
        </label>
        <input
          id="intl-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          required
          minLength={8}
          maxLength={20}
          autoComplete="tel"
          aria-describedby="intl-phone-help"
          className={field}
        />
        <p id="intl-phone-help" className="mt-1 text-xs text-muted">
          {t("formPhoneHelp")}
        </p>
      </div>

      <div>
        <label htmlFor="intl-email" className={fieldLabel}>
          {t("formEmail")}
        </label>
        <input
          id="intl-email"
          name="email"
          type="email"
          maxLength={200}
          autoComplete="email"
          className={field}
        />
      </div>

      <div>
        <label htmlFor="intl-message" className={fieldLabel}>
          {t("formMessage")}
        </label>
        <textarea id="intl-message" name="message" rows={3} maxLength={2000} className={field} />
      </div>

      {/* The exact consent text is rendered, not summarised — what the buyer
          ticks is the version whose id is posted with the form. */}
      <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-surface p-3">
        <input type="checkbox" name="consent" required className="mt-0.5 h-5 w-5 shrink-0" />
        <span className="text-xs leading-relaxed text-muted">{consent.body}</span>
      </label>

      <button
        type="submit"
        className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-electric px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-electric-strong"
      >
        <ChatIcon className="h-4 w-4" />
        {t("formSubmit")}
      </button>
      <p className="text-center text-xs text-muted">{t("formSubmitHelp")}</p>
    </form>
  );
}
