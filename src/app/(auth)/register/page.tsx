import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signUp } from "../actions";

const KNOWN_ERRORS = ["password_mismatch", "weak_password", "email_in_use", "generic"];

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("registerTitle")}</h1>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t(`errors.${KNOWN_ERRORS.includes(error) ? error : "generic"}`)}
        </p>
      )}
      <form action={signUp} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t("displayName")}</span>
          <input
            type="text"
            name="displayName"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            className="w-full rounded-lg border border-line bg-background px-3 py-2.5 outline-none focus:border-crimson"
          />
        </label>
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
          {tc("register")}
        </button>
      </form>
      <p className="mt-6 text-center text-sm">
        <span className="text-muted">{t("haveAccount")} </span>
        <Link href="/login" className="font-medium text-crimson">
          {tc("signIn")}
        </Link>
      </p>
    </div>
  );
}
