/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyLinkSession, linkCookieName } from "@/lib/request-links";
import { getClientSafeProperties } from "@/lib/projections/client-safe";
import { getActiveDeclaration } from "@/lib/consents";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { unlockPresentation, submitClientFeedback } from "./actions";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

export default async function ClientPresentationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { token } = await params;
  const { error, done } = await searchParams;
  const t = await getTranslations("clientView");
  const locale = await getLocale();

  const service = createServiceClient();
  const { data: p } = await service
    .from("client_presentations")
    .select(
      `id, title, client_display_name, intro_message, active, expires_at,
       allow_feedback, allow_comparison, allow_offer, allow_viewing_request,
       profiles ( display_name )`,
    )
    .eq("token", token)
    .maybeSingle();

  if (!p || !p.active || new Date(p.expires_at) < new Date()) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-24 text-center">
          <h1 className="mb-3 text-2xl font-semibold">{t("unavailableTitle")}</h1>
          <p className="text-sm text-muted">{t("unavailableBody")}</p>
        </div>
      </Shell>
    );
  }

  const ra = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
  const raName = ra?.display_name ?? "";

  const cookieVal = (await cookies()).get(linkCookieName(p.id))?.value;
  const unlocked = verifyLinkSession(cookieVal, p.id);

  if (!unlocked) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-20">
          <div className="rounded-2xl border border-line bg-background p-8 shadow-sm">
            <h1 className="mb-1 text-xl font-semibold">{p.title}</h1>
            <p className="mb-6 text-sm text-muted">{t("presentedBy", { name: raName })}</p>
            {error === "wrong_password" && (
              <p role="alert" className="mb-4 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
                {t("wrongPassword")}
              </p>
            )}
            {error === "locked" && (
              <p role="alert" className="mb-4 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
                {t("locked")}
              </p>
            )}
            <form action={unlockPresentation} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{t("accessCode")}</span>
                <input name="password" required autoComplete="off"
                  className={`${inputCls} text-center font-mono text-lg tracking-widest uppercase`} />
              </label>
              <button type="submit"
                className="w-full rounded-lg bg-crimson px-4 py-2.5 font-semibold text-white hover:bg-crimson-strong">
                {t("unlock")}
              </button>
            </form>
          </div>
        </div>
      </Shell>
    );
  }

  const [properties, disclaimer] = await Promise.all([
    getClientSafeProperties(p.id),
    getActiveDeclaration("client_disclaimer", locale),
  ]);

  const money = (cur: string, n: number | null) =>
    n == null ? null : `${cur} ${n.toLocaleString()}`;

  return (
    <Shell>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <header className="mb-10 text-center">
          <p className="mb-2 text-xs font-semibold tracking-widest text-crimson uppercase">
            {t("presentedBy", { name: raName })}
          </p>
          <h1 className="mb-3 text-3xl font-bold">{p.title}</h1>
          {p.client_display_name && (
            <p className="mb-2 text-sm text-muted">{t("preparedFor", { name: p.client_display_name })}</p>
          )}
          {p.intro_message && (
            <p className="mx-auto max-w-2xl text-sm leading-6 text-muted">{p.intro_message}</p>
          )}
        </header>

        {done && (
          <p className="mb-8 rounded-lg bg-success/10 px-4 py-3 text-center text-sm font-medium text-success">
            {t(`done.${done}`)}
          </p>
        )}

        {p.allow_comparison && properties.length >= 2 && (
          <div className="mb-8 text-center">
            <Link href={`/p/${token}/compare`}
              className="inline-block rounded-lg border border-crimson px-5 py-2.5 text-sm font-semibold text-crimson hover:bg-crimson-soft">
              {t("compareAll", { count: properties.length })}
            </Link>
          </div>
        )}

        <div className="space-y-10">
          {properties.map((prop, i) => (
            <article key={prop.ppid} className="overflow-hidden rounded-2xl border border-line bg-background shadow-sm">
              {prop.images.length > 0 && (
                <div className="flex gap-1 overflow-x-auto bg-charcoal">
                  {prop.images.map((img, j) => (
                    <img key={j} src={img.url} alt={`${prop.title} ${j + 1}`}
                      className={`h-64 object-cover ${j === 0 ? "w-full flex-shrink" : "w-64 flex-none"}`} />
                  ))}
                </div>
              )}
              <div className="p-6">
                <div className="mb-1 flex items-start justify-between gap-4">
                  <h2 className="text-xl font-semibold">
                    <span className="mr-2 text-muted">{i + 1}.</span>{prop.title}
                  </h2>
                  <p className="text-lg font-bold whitespace-nowrap text-crimson">
                    {money(prop.currency, prop.price) ?? money(prop.currency, prop.monthlyRental)}
                    {prop.monthlyRental != null && prop.price == null && (
                      <span className="text-xs font-normal text-muted"> {t("perMonth")}</span>
                    )}
                  </p>
                </div>
                <p className="mb-4 text-sm text-muted">{prop.generalLocation}</p>

                <div className="mb-4 flex flex-wrap gap-2 text-xs">
                  {prop.builtUp != null && (
                    <span className="rounded-full bg-surface px-3 py-1">
                      {prop.builtUp.toLocaleString()} {prop.measurementUnit}
                    </span>
                  )}
                  {prop.bedrooms != null && (
                    <span className="rounded-full bg-surface px-3 py-1">{t("beds", { n: prop.bedrooms })}</span>
                  )}
                  {prop.bathrooms != null && (
                    <span className="rounded-full bg-surface px-3 py-1">{t("baths", { n: prop.bathrooms })}</span>
                  )}
                  {prop.carParks != null && (
                    <span className="rounded-full bg-surface px-3 py-1">{t("parks", { n: prop.carParks })}</span>
                  )}
                  {prop.furnishing && (
                    <span className="rounded-full bg-surface px-3 py-1">{t(`furnishing.${prop.furnishing}`)}</span>
                  )}
                </div>

                {prop.description && <p className="mb-3 text-sm leading-6">{prop.description}</p>}
                {prop.keySellingPoints && (
                  <p className="mb-3 text-sm leading-6"><span className="font-medium">{t("highlights")}: </span>{prop.keySellingPoints}</p>
                )}
                {prop.agentNote && (
                  <p className="mb-4 rounded-lg bg-crimson-soft/50 px-4 py-3 text-sm">
                    <span className="font-medium">{t("agentNote", { name: raName })}: </span>{prop.agentNote}
                  </p>
                )}

                {p.allow_feedback && (
                  <div className="mt-5 border-t border-line pt-5">
                    <div className="mb-4 flex flex-wrap gap-2">
                      <QuickAction token={token} ppid={prop.ppid} kind="shortlist" label={t("actions.shortlist")} accent />
                      <QuickAction token={token} ppid={prop.ppid} kind="not_interested" label={t("actions.notInterested")} />
                      {(["first", "second", "third"] as const).map((r) => (
                        <RankAction key={r} token={token} ppid={prop.ppid} rank={r} label={t(`actions.${r}`)} />
                      ))}
                    </div>
                    <details className="text-sm">
                      <summary className="cursor-pointer font-medium text-crimson">{t("actions.more")}</summary>
                      <div className="mt-3 grid gap-4 sm:grid-cols-3">
                        <form action={submitClientFeedback} className="space-y-2">
                          <input type="hidden" name="token" value={token} />
                          <input type="hidden" name="ppid" value={prop.ppid} />
                          <input type="hidden" name="kind" value="question" />
                          <input type="hidden" name="rankValue" value="" />
                          <input type="hidden" name="offerAmount" value="" />
                          <input type="hidden" name="preferredDate" value="" />
                          <textarea name="message" rows={2} required placeholder={t("actions.questionHint")} className={inputCls} />
                          <button className="w-full rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:border-crimson hover:text-crimson">
                            {t("actions.ask")}
                          </button>
                        </form>
                        {p.allow_offer && (
                          <form action={submitClientFeedback} className="space-y-2">
                            <input type="hidden" name="token" value={token} />
                            <input type="hidden" name="ppid" value={prop.ppid} />
                            <input type="hidden" name="kind" value="offer_suggestion" />
                            <input type="hidden" name="rankValue" value="" />
                            <input type="hidden" name="preferredDate" value="" />
                            <input type="number" name="offerAmount" min="0" step="1000" required
                              placeholder={t("actions.offerHint", { currency: prop.currency })} className={inputCls} />
                            <input type="hidden" name="message" value="" />
                            <button className="w-full rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:border-crimson hover:text-crimson">
                              {t("actions.suggestOffer")}
                            </button>
                          </form>
                        )}
                        {p.allow_viewing_request && (
                          <form action={submitClientFeedback} className="space-y-2">
                            <input type="hidden" name="token" value={token} />
                            <input type="hidden" name="ppid" value={prop.ppid} />
                            <input type="hidden" name="kind" value="viewing_request" />
                            <input type="hidden" name="rankValue" value="" />
                            <input type="hidden" name="offerAmount" value="" />
                            <input type="hidden" name="message" value="" />
                            <input type="date" name="preferredDate" required className={inputCls} />
                            <button className="w-full rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:border-crimson hover:text-crimson">
                              {t("actions.requestViewing")}
                            </button>
                          </form>
                        )}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>

        <footer className="mt-12 border-t border-line pt-6">
          <p className="text-xs leading-5 whitespace-pre-line text-muted">{disclaimer?.body}</p>
          <p className="mt-4 text-center text-xs text-muted">
            {t("footer", { name: raName })}
          </p>
        </footer>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <div className="flex justify-end px-4 pt-3">
        <LanguageSwitcher />
      </div>
      {children}
    </div>
  );
}

function QuickAction({
  token, ppid, kind, label, accent = false,
}: {
  token: string; ppid: string; kind: string; label: string; accent?: boolean;
}) {
  return (
    <form action={submitClientFeedback} className="inline">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="ppid" value={ppid} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="rankValue" value="" />
      <input type="hidden" name="message" value="" />
      <input type="hidden" name="offerAmount" value="" />
      <input type="hidden" name="preferredDate" value="" />
      <button
        className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
          accent
            ? "bg-crimson text-white hover:bg-crimson-strong"
            : "border border-line hover:border-crimson hover:text-crimson"
        }`}
      >
        {label}
      </button>
    </form>
  );
}

function RankAction({
  token, ppid, rank, label,
}: {
  token: string; ppid: string; rank: string; label: string;
}) {
  return (
    <form action={submitClientFeedback} className="inline">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="ppid" value={ppid} />
      <input type="hidden" name="kind" value="rank" />
      <input type="hidden" name="rankValue" value={rank} />
      <input type="hidden" name="message" value="" />
      <input type="hidden" name="offerAmount" value="" />
      <input type="hidden" name="preferredDate" value="" />
      <button className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold hover:border-crimson hover:text-crimson">
        {label}
      </button>
    </form>
  );
}
