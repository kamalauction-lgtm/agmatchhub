import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { CommandHeader } from "@/components/ui/command-header";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { getStudioListings } from "@/lib/studio/listings";
import { money, place } from "@/lib/listings/format";

/**
 * Content Studio — pick a listing (module design §5).
 *
 * The inventory here is everything the agent can legitimately promote: their
 * own published listings plus borrowed co-marketing ones, from the same view
 * that powers their public landing page. Drafts, tabs and sharing live one
 * level down at /studio/[listingId].
 *
 * The stat tiles are counts only, read with the agent's own session (RLS) from
 * the same tables /studio/scheduled and /studio/accounts list. A count that
 * fails to load drops its tile: a missing tile is honest, a made-up zero is
 * not.
 */

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson";

/** Header actions sit on the dark command band, so the focus ring is white there. */
const BAND_BUTTON =
  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white transition-colors duration-200 hover:border-white/50 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

type Tile = {
  key: string;
  href: string;
  icon: string;
  tone: string;
  value: number;
  label: string;
  hint: string;
};

export default async function StudioPickerPage() {
  const user = await requireUser();
  const t = await getTranslations("studio");
  const format = await getFormatter();
  const supabase = await createClient();

  const [listings, scheduled, published, accounts] = await Promise.all([
    getStudioListings(user.id),
    supabase
      .from("scheduled_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "scheduled"),
    supabase
      .from("scheduled_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "published"),
    supabase
      .from("social_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);

  const candidates: (Omit<Tile, "value"> & { value: number | null })[] = [
    {
      key: "listings",
      href: "#studio-listings",
      icon: "building",
      tone: "bg-crimson-soft text-crimson-strong",
      value: listings.length,
      label: t("statListings"),
      hint: t("statListingsHint"),
    },
    {
      key: "scheduled",
      href: "/studio/scheduled",
      icon: "clock",
      tone: "bg-blue-soft text-blue",
      value: scheduled.error ? null : scheduled.count,
      label: t("statScheduled"),
      hint: t("statScheduledHint"),
    },
    {
      key: "accounts",
      href: "/studio/accounts",
      icon: "link",
      tone: "bg-success-soft text-success",
      value: accounts.error ? null : accounts.count,
      label: t("statAccounts"),
      hint: t("statAccountsHint"),
    },
    {
      key: "published",
      href: "/studio/scheduled",
      icon: "send",
      tone: "bg-surface text-muted-strong",
      value: published.error ? null : published.count,
      label: t("statPublished"),
      hint: t("statPublishedHint"),
    },
  ];
  const tiles = candidates.filter((c): c is Tile => c.value !== null);

  const steps = [
    { title: t("step1Title"), body: t("step1Body") },
    { title: t("step2Title"), body: t("step2Body") },
    { title: t("step3Title"), body: t("step3Body") },
  ];
  const channels = [t("tabWhatsapp"), t("channelInstagram"), t("channelFacebook")];

  return (
    <AgentShell wide>
      {/* Command band: fixed colours so the text stays legible in dark mode. */}
      <CommandHeader className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">{t("title")}</h1>
          <p className="command-muted mt-2 text-sm leading-6 sm:text-base">{t("intro")}</p>
        </div>
        <nav aria-label={t("title")} className="flex flex-wrap gap-2">
          <Link href="/studio/plan" className={BAND_BUTTON}>
            <Icon name="calendar" size={18} />
            {t("planLink")}
          </Link>
          <Link href="/studio/scheduled" className={BAND_BUTTON}>
            <Icon name="clock" size={18} />
            {t("queueLink")}
          </Link>
          <Link href="/studio/accounts" className={BAND_BUTTON}>
            <Icon name="link" size={18} />
            {t("accountsLink")}
          </Link>
        </nav>
      </CommandHeader>

      <section
        data-studio-stats
        aria-label={t("statsLabel")}
        className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      >
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            href={tile.href}
            data-studio-stat={tile.key}
            className={`group flex cursor-pointer flex-col rounded-2xl border border-line bg-card p-4 transition-colors duration-200 hover:border-crimson sm:p-5 ${FOCUS}`}
          >
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${tile.tone}`}
            >
              <Icon name={tile.icon} size={20} />
            </span>
            <span className="mt-4 text-3xl font-bold tabular-nums text-foreground">
              {format.number(tile.value)}
            </span>
            <span className="mt-1 text-sm font-semibold text-muted-strong">{tile.label}</span>
            <span className="mt-0.5 hidden text-sm text-muted sm:block">{tile.hint}</span>
          </Link>
        ))}
      </section>

      {!listings.length ? (
        <section
          id="studio-listings"
          data-studio-empty
          className="mt-6 grid scroll-mt-24 gap-4 lg:grid-cols-5 lg:gap-6"
        >
          <div className="rounded-2xl border border-line bg-card p-6 sm:p-8 lg:col-span-3">
            <h2 className="text-xl font-semibold text-foreground">{t("stepsTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{t("empty")}</p>

            <ol className="mt-6 space-y-5">
              {steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-crimson-fill text-base font-bold text-white"
                  >
                    {format.number(i + 1)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-foreground">{step.title}</p>
                    <p className="mt-0.5 text-sm leading-6 text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/listings/new"
                className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-crimson-fill px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-crimson-strong ${FOCUS}`}
              >
                <Icon name="plus" size={18} />
                {t("emptyCta")}
              </Link>
              <Link
                href="/collab/pool"
                className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-crimson hover:text-crimson ${FOCUS}`}
              >
                <Icon name="repeat" size={18} />
                {t("emptyPoolCta")}
              </Link>
            </div>
          </div>

          {/* A sample, not data: every word is a translation string and says so. */}
          <aside
            aria-label={t("sampleTitle")}
            className="rounded-2xl border border-line bg-card p-6 sm:p-8 lg:col-span-2"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-foreground">{t("sampleTitle")}</h2>
              <Badge tone="neutral">{t("sampleBadge")}</Badge>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              <div className="flex aspect-[16/10] flex-col items-center justify-center gap-2 bg-surface px-4 text-center text-muted-strong">
                <Icon name="image" size={40} />
                <span className="text-sm">{t("samplePhoto")}</span>
              </div>
              <div className="space-y-2 border-t border-line p-4 text-sm leading-6 text-foreground">
                <p className="font-semibold">{t("sampleLine1")}</p>
                <p>{t("sampleLine2")}</p>
                <p>{t("sampleLine3")}</p>
              </div>
            </div>

            <p className="mt-5 text-sm font-semibold text-muted-strong">{t("sampleChannels")}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {channels.map((c) => (
                <li
                  key={c}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-sm font-medium text-muted-strong"
                >
                  {c}
                </li>
              ))}
            </ul>
          </aside>
        </section>
      ) : (
        <section id="studio-listings" className="mt-8 scroll-mt-24">
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t("pick")}</h2>
          <div
            data-studio-grid
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
          >
            {listings.map((l) => (
              <Link
                key={l.id}
                href={`/studio/${l.id}`}
                className={`group flex cursor-pointer flex-col rounded-2xl border border-line bg-card p-5 transition-colors duration-200 hover:border-crimson ${FOCUS}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs text-muted">{l.human_readable_id}</span>
                  {l.borrowed && <Badge tone="info">{t("borrowedBadge")}</Badge>}
                </div>
                <h3 className="mt-3 line-clamp-2 text-lg font-semibold leading-snug text-foreground transition-colors duration-200 group-hover:text-crimson-strong">
                  {l.title}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {place({ regency_name: l.regency_name, province_name: l.province_name })}
                </p>
                {l.price !== null && (
                  <p className="mt-2 text-lg font-bold text-crimson-strong">
                    {money(l.currency, l.price, l.rent_period)}
                  </p>
                )}
                <div className="mt-auto pt-4">
                  <span className="flex min-h-11 items-center justify-between gap-2 border-t border-line pt-3 text-sm font-semibold text-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Icon name="sparkles" size={18} className="text-crimson-strong" />
                      {t("open")}
                    </span>
                    <Icon
                      name="arrow-right"
                      size={18}
                      className="text-muted transition-colors duration-200 group-hover:text-crimson-strong"
                    />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </AgentShell>
  );
}
