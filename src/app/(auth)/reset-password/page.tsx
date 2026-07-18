import { getTranslations } from "next-intl/server";
import { resetPassword } from "../actions";

const KNOWN_ERRORS = ["password_mismatch", "weak_password", "generic"];

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("auth");

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
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border border-line bg-background px-3 py-2.5 outline-none focus:border-crimson"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t("confirmPassword")}</span>
          <input
            type="password"
            name="confirmPassword"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border border-line bg-background px-3 py-2.5 outline-none focus:border-crimson"
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
