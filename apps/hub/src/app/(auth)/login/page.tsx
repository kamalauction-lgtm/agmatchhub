import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PasswordInput } from "@/components/forms/password-input";
import { signIn } from "../actions";
import { ResendConfirmation } from "@/components/forms/resend-confirmation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("loginTitle")}</h1>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t(`errors.${["invalid_credentials", "email_not_confirmed", "generic"].includes(error) ? error : "generic"}`)}
        </p>
      )}
      <form action={signIn} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{tc("email")}</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="w-full rounded-lg border border-line bg-background px-3 py-2.5 outline-none focus:border-crimson"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{tc("password")}</span>
          <PasswordInput
            name="password"
            required
            autoComplete="current-password"
            showLabel={tc("show")}
            hideLabel={tc("hide")}
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-crimson-btn px-4 py-2.5 font-semibold text-white transition-colors hover:bg-crimson-btn-strong"
        >
          {tc("signIn")}
        </button>
      </form>
      {error === "email_not_confirmed" && <ResendConfirmation className="mt-6 rounded-xl border border-line p-4" />}
      <div className="mt-6 flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-muted hover:text-foreground">
          {t("forgotPassword")}
        </Link>
        <span>
          <span className="text-muted">{t("noAccount")} </span>
          <Link href="/register" className="inline-flex min-h-11 items-center font-medium text-crimson">
            {tc("register")}
          </Link>
        </span>
      </div>
      <p className="mt-1 text-center text-xs">
        <Link href="/verify-email" className="inline-flex min-h-11 items-center text-muted hover:text-foreground">{t("resendLink")}</Link>
      </p>
    </div>
  );
}
