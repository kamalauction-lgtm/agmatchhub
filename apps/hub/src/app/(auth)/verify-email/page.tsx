import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ResendConfirmation } from "@/components/forms/resend-confirmation";

const NOTICES = ["1", "wait", "invalid"] as const;

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ resent?: string }>;
}) {
  const { resent } = await searchParams;
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");
  const notice = (NOTICES as readonly string[]).includes(resent ?? "") ? resent : null;
  return (
    <div className="text-center">
      <div aria-hidden className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-crimson-soft text-2xl">
        ✉️
      </div>
      <h1 className="mb-3 text-2xl font-semibold">{t("verifyTitle")}</h1>
      <p className="mb-6 text-sm leading-6 text-muted">{t("verifyBody")}</p>
      {notice && (
        <p
          role="status"
          data-resent={notice}
          className={`mb-6 rounded-lg px-4 py-3 text-sm ${notice === "1" ? "bg-success/10 text-success" : "bg-crimson-soft text-crimson"}`}
        >
          {t(`resent.${notice === "1" ? "sent" : notice}` as never)}
        </p>
      )}
      <ResendConfirmation className="mb-6 rounded-xl border border-line p-4" />
      <Link href="/login" className="font-medium text-crimson">
        {tc("signIn")}
      </Link>
    </div>
  );
}
