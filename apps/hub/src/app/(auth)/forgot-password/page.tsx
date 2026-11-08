import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { forgotPassword } from "../actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("resetTitle")}</h1>
      {sent ? (
        <p className="mb-6 rounded-lg bg-surface px-4 py-3 text-sm">{t("resetSent")}</p>
      ) : (
        <form action={forgotPassword} className="space-y-4">
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
          <button
            type="submit"
            className="w-full rounded-lg bg-crimson px-4 py-2.5 font-semibold text-white transition-colors hover:bg-crimson-strong"
          >
            {t("sendReset")}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-muted hover:text-foreground">
          {tc("back")}
        </Link>
      </p>
    </div>
  );
}
