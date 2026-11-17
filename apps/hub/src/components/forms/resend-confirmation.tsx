import { getTranslations } from "next-intl/server";
import { resendConfirmation } from "@/app/(auth)/actions";

/**
 * "Didn't get the email?" — sends a fresh signup confirmation link.
 *
 * Confirmation links expire (24 hours since 17 Nov 2026), and an agent who
 * opened the email late had no way to get a new one. The answer is the same
 * whether or not the address exists, so this cannot be used to probe for
 * accounts.
 */
export async function ResendConfirmation({ className = "" }: { className?: string }) {
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");
  return (
    <form action={resendConfirmation} className={`space-y-3 text-left ${className}`} data-resend-confirmation="1">
      <p className="text-sm font-medium">{t("resendTitle")}</p>
      <p className="text-xs text-muted">{t("resendBody")}</p>
      <label className="block">
        <span className="sr-only">{tc("email")}</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder={tc("email")}
          className="w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson"
        />
      </label>
      <button
        type="submit"
        className="w-full rounded-lg border border-line px-4 py-2.5 text-sm font-semibold transition-colors hover:border-crimson hover:text-crimson"
      >
        {t("resendCta")}
      </button>
    </form>
  );
}
