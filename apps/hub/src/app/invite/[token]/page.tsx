import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { looksLikeInviteToken } from "@/lib/agents/invitations";
import { acceptInvitation } from "./actions";

/**
 * The link an invited agent opens. /invite is a protected prefix, so a
 * visitor who is not signed in is sent to /login?next=/invite/<token> and
 * comes back here. Nothing about the invitation is looked up or shown before
 * the agent accepts: the page cannot be used to test which links exist.
 */

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { token } = await params;
  const { error } = await searchParams;
  if (!looksLikeInviteToken(token)) notFound();
  const t = await getTranslations("invite");
  const known = ["invalid", "email_mismatch", "rate_limited", "sign_in_required"];

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted">{t("intro")}</p>

      {error && (
        <p className="mt-6 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {t(`error.${known.includes(error) ? error : "failed"}` as never)}
        </p>
      )}

      <form action={acceptInvitation} className="mt-8">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="min-h-11 w-full cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-crimson-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
        >
          {t("accept")}
        </button>
      </form>
      <p className="mt-6 text-xs text-muted">
        {t("wrongAccount")} <Link href="/profile" className="underline">{t("checkAccount")}</Link>
      </p>
    </main>
  );
}
