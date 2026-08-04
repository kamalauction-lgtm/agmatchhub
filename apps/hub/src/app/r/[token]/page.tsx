import Link from "next/link";
import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { verifyLinkSession, linkCookieName } from "@/lib/request-links";
import { BrandLockup } from "@/components/layout/brand-lockup";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { unlockRequestLink } from "./actions";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-center font-mono text-lg tracking-widest uppercase outline-none focus:border-crimson";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between px-6 py-4">
        <BrandLockup size={28} />
        <LanguageSwitcher />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">{children}</main>
    </div>
  );
}

export default async function RequestLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("requestLink");
  const service = createServiceClient();

  const { data: link } = await service
    .from("request_links")
    .select("id, active, expires_at, request_id, property_requests(public_listing)")
    .eq("token", token)
    .maybeSingle();

  if (!link || !link.active || new Date(link.expires_at) < new Date()) {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-2xl border border-line bg-background p-8 text-center">
          <h1 className="mb-3 text-xl font-semibold">{t("invalidTitle")}</h1>
          <p className="text-sm text-muted">{t("invalidBody")}</p>
        </div>
      </Shell>
    );
  }

  // Public-board requirements (§13 visibility) skip the access code; the
  // full detail and submission still require a verified agent login.
  const reqMeta = Array.isArray(link.property_requests)
    ? link.property_requests[0]
    : link.property_requests;
  const isPublic = !!reqMeta?.public_listing;

  const cookieStore = await cookies();
  const unlocked =
    isPublic ||
    verifyLinkSession(cookieStore.get(linkCookieName(link.id))?.value, link.id);

  if (!unlocked) {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-2xl border border-line bg-background p-8">
          <h1 className="mb-2 text-xl font-semibold">{t("gateTitle")}</h1>
          <p className="mb-6 text-sm text-muted">{t("gateBody")}</p>
          {error && (
            <p role="alert" className="mb-4 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
              {t(error === "locked" ? "lockedNotice" : "wrongPassword")}
            </p>
          )}
          <form action={unlockRequestLink} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <input
              name="password"
              required
              maxLength={16}
              autoComplete="off"
              placeholder="········"
              className={inputCls}
            />
            <button type="submit" className="w-full rounded-lg bg-crimson px-4 py-2.5 font-semibold text-white hover:bg-crimson-strong">
              {t("unlock")}
            </button>
          </form>
        </div>
      </Shell>
    );
  }

  // Unlocked: load the requirement via a Supply-Agent-safe projection.
  // internal_notes / admin_notes / client identity never enter this object.
  const { data: r } = await service
    .from("property_requests")
    .select(
      "human_readable_id, title, description, transaction_type, property_category, priority, submission_deadline, expiry_date, country_code, state_region, city, district, preferred_areas, currency, budget_min, budget_max, max_monthly_rent, rent_period, lease_term_months, financing, property_type, measurement_unit, min_built_up, max_built_up, bedrooms_min, bathrooms_min, car_parks_min, furnishing, other_requirements, client_profile_anonymised, expected_move_in, status, profiles(display_name)",
    )
    .eq("id", link.request_id)
    .single();
  if (!r) return null;
  const ra = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;

  await service.from("request_link_access_logs").insert({
    link_id: link.id,
    event: "requirement_viewed",
    user_agent: (await headers()).get("user-agent")?.slice(0, 300) ?? null,
  });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let verifiedAgent = false;
  if (user) {
    const { data: p } = await supabase
      .from("profiles").select("agent_status").eq("id", user.id).single();
    verifiedAgent = p?.agent_status === "verified";
  }

  const tr = await getTranslations("requests");
  const money = (n: unknown) => (n == null ? null : `${r.currency} ${Number(n).toLocaleString()}`);
  const facts: [string, string | null][] = [
    [tr("form.transactionType"), tr(`transaction.${r.transaction_type}`)],
    [tr("form.propertyCategory"), tr(`form.categories.${r.property_category}`)],
    [tr("form.city"), [r.district, r.city, r.state_region, r.country_code].filter(Boolean).join(", ")],
    [tr("form.preferredAreas"), r.preferred_areas?.length ? r.preferred_areas.join(", ") : null],
    [tr("form.budgetMin"), money(r.budget_min)],
    [tr("form.budgetMax"), money(r.budget_max)],
    [tr("form.maxRent"), r.max_monthly_rent == null ? null
      : `${money(r.max_monthly_rent)} / ${tr(`form.periods.${r.rent_period ?? "monthly"}`)}`],
    [tr("form.propertyType"), r.property_type],
    [tr("form.bedroomsMin"), r.bedrooms_min?.toString() ?? null],
    [tr("form.minBuiltUp"), r.min_built_up ? `${Number(r.min_built_up).toLocaleString()} ${r.measurement_unit}` : null],
    [tr("form.submissionDeadline"), r.submission_deadline],
  ];

  return (
    <Shell>
      <div className="rounded-2xl border border-line bg-background p-8">
        <p className="mb-1 font-mono text-xs text-muted">{r.human_readable_id}</p>
        <h1 className="mb-1 text-2xl font-semibold">{r.title}</h1>
        <p className="mb-6 text-sm text-muted">
          {t("presentedBy", { name: ra?.display_name ?? "—" })}
        </p>
        {r.description && <p className="mb-6 text-sm leading-6">{r.description}</p>}
        <dl className="mb-6 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.filter(([, v]) => v).map(([label, v]) => (
            <div key={label}>
              <dt className="text-xs text-muted uppercase">{label}</dt>
              <dd className="text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {r.client_profile_anonymised && (
          <div className="mb-6 rounded-lg bg-surface p-4 text-sm">
            <span className="font-medium">{t("clientProfile")}: </span>
            {r.client_profile_anonymised}
          </div>
        )}

        <div className="rounded-xl border border-line bg-surface p-5 text-sm">
          {!user ? (
            <>
              <p className="mb-3">{t("loginToSubmit")}</p>
              <div className="flex gap-3">
                <Link href={`/login?next=/r/${token}`} className="rounded-lg bg-crimson px-4 py-2 font-semibold text-white hover:bg-crimson-strong">
                  {t("signIn")}
                </Link>
                <Link href="/register" className="rounded-lg border border-line px-4 py-2 font-semibold hover:border-crimson hover:text-crimson">
                  {t("register")}
                </Link>
              </div>
            </>
          ) : !verifiedAgent ? (
            <p>
              {t("verifyToSubmit")}{" "}
              <Link href="/verification" className="font-medium text-crimson">{t("verifyLink")}</Link>
            </p>
          ) : (
            <>
              <p className="mb-3 font-medium">{t("submitCta")}</p>
              <Link
                href={`/r/${token}/submit`}
                className="inline-block rounded-lg bg-crimson px-5 py-2.5 font-semibold text-white hover:bg-crimson-strong"
              >
                {t("submitButton")}
              </Link>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
