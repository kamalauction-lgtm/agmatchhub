import { getTranslations } from "next-intl/server";
import { activateAccount } from "../actions";

/**
 * Landing page for the activation email a super admin's registration sends.
 * It only shows a button: the token is used by the form's action, not by
 * opening this page.
 */
export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; error?: string }>;
}) {
  const { token_hash: tokenHash, type, error } = await searchParams;
  const t = await getTranslations("auth");
  const usable = !error && tokenHash && (type === "invite" || type === "recovery");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">{t("activateTitle")}</h1>
      {usable ? (
        <form action={activateAccount} className="space-y-4">
          <p className="text-sm text-muted">{t("activateBody")}</p>
          <input type="hidden" name="tokenHash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <button
            type="submit"
            className="w-full rounded-lg bg-crimson px-4 py-2.5 font-semibold text-white transition-colors hover:bg-crimson-strong"
          >
            {t("activateCta")}
          </button>
        </form>
      ) : (
        <p role="alert" className="rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t("activateExpired")}
        </p>
      )}
    </div>
  );
}
