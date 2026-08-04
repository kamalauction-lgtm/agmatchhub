import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function VerifyEmailPage() {
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");
  return (
    <div className="text-center">
      <div aria-hidden className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-crimson-soft text-2xl">
        ✉️
      </div>
      <h1 className="mb-3 text-2xl font-semibold">{t("verifyTitle")}</h1>
      <p className="mb-6 text-sm leading-6 text-muted">{t("verifyBody")}</p>
      <Link href="/login" className="font-medium text-crimson">
        {tc("signIn")}
      </Link>
    </div>
  );
}
