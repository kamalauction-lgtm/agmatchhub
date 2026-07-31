import { getTranslations } from "next-intl/server";
import { PasswordInput } from "@/components/forms/password-input";
import { resetPassword } from "../actions";

const KNOWN_ERRORS = ["password_mismatch", "weak_password", "generic"];

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("resetTitle")}</h1>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t(`errors.${KNOWN_ERRORS.includes(error) ? error : "generic"}`)}
        </p>
      )}
      <form action={resetPassword} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t("newPassword")}</span>
          <PasswordInput
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            showLabel={tc("show")}
            hideLabel={tc("hide")}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t("confirmPassword")}</span>
          <PasswordInput
            name="confirmPassword"
            required
            minLength={8}
            autoComplete="new-password"
            showLabel={tc("show")}
            hideLabel={tc("hide")}
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-crimson px-4 py-2.5 font-semibold text-white transition-colors hover:bg-crimson-strong"
        >
          {t("resetSubmit")}
        </button>
      </form>
    </div>
  );
}
