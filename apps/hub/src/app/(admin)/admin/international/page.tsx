import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { Panel } from "@/components/admin/panel";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { GuideLink } from "@/components/help/guide-link";
import { CountryTag } from "@/components/international/listing-visual";
import { countryName, isCountryCode, waDigits } from "@/lib/international/countries";
import { formatFigure } from "@/lib/international/price";
import { deleteContact, saveContact, setContactActive, setEnquiryStatus, setListingStatus } from "./actions";

/**
 * International — the super admin's side of the overseas listings section.
 *
 * Four tabs on one address (`?tab=`), because they are four views of one job:
 * who answers for each country, what is on show, who asked, and what the
 * converted prices are based on. Everything is read with the admin's own
 * session, so the policies of 00134 decide what comes back — a person without
 * a global platform.configure grant sees empty tables, never an error page.
 *
 * Listings arrive from the weekly partner sync; this screen does not edit
 * their content, it only decides whether each one is on show.
 */

export const dynamic = "force-dynamic";

const TABS = ["contacts", "listings", "enquiries", "rates"] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, string> = { contacts: "users", listings: "building", enquiries: "inbox", rates: "trending-up" };

const STATUSES = ["draft", "published", "withdrawn"] as const;
const STATUS_TONE: Record<string, BadgeTone> = { draft: "neutral", published: "success", withdrawn: "warning" };
const ENQUIRY_TONE: Record<string, BadgeTone> = { new: "info", contacted: "success", closed: "neutral" };

const DONE = [
  "contact_added", "contact_saved", "contact_activated", "contact_deactivated", "contact_deleted",
  "listing_published", "listing_withdrawn", "enquiry_contacted", "enquiry_closed",
];
const ERRORS = ["invalid", "phone", "coverage", "country_code", "save_failed", "coverage_failed", "not_found"];

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue";
const INPUT = `mt-1 h-11 w-full rounded-lg border border-line bg-background px-3 text-sm outline-none transition-colors duration-150 focus:border-blue ${FOCUS}`;
const LABEL = "block text-sm font-semibold text-foreground";
const HINT = "mt-1 block text-xs font-normal leading-5 text-muted";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-crimson-btn px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-crimson-btn-strong ${FOCUS}`;
const BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line-strong bg-card px-4 text-sm font-semibold text-foreground transition-colors duration-150 hover:border-crimson hover:text-crimson-strong ${FOCUS}`;
const BTN_DANGER = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line-strong bg-card px-4 text-sm font-semibold text-danger transition-colors duration-150 hover:border-danger ${FOCUS}`;
const TH = "px-4 py-3 font-semibold";
const TD = "px-4 py-3 align-top";

type Contact = {
  id: string;
  display_name: string;
  phone: string;
  email: string | null;
  role_label: string | null;
  all_countries: boolean;
  active: boolean;
  sort_order: number;
  country_contact_countries: { country_code: string }[] | null;
};

type ListingRow = {
  id: string;
  slug: string;
  title: string;
  country_code: string;
  city: string | null;
  region: string | null;
  currency: string;
  price_min: number | null;
  price_max: number | null;
  status: string;
  is_featured: boolean;
  last_synced_at: string | null;
};

type Embedded<T> = T | T[] | null;
type EnquiryRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  message: string | null;
  status: string;
  created_at: string;
  international_listings: Embedded<{ title: string; slug: string; country_code: string }>;
  country_contacts: Embedded<{ display_name: string }>;
};

/** PostgREST returns a to-one embed as an object; older shapes as a one-row array. */
function one<T>(v: Embedded<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function AdminInternationalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; done?: string; error?: string; edit?: string; country?: string; status?: string }>;
}) {
  await requireCapability("platform.configure");
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "contacts";
  const t = await getTranslations("adminInternational");
  const locale = await getLocale();
  const format = await getFormatter();
  const supabase = await createClient();

  const when = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : t("never");
  const day = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  // Needed by every tab: which countries the catalogue holds (for pickers and
  // filters) and how many enquiries are waiting (for the tab's badge).
  // A page at a time: one request returns at most 1,000 rows and the catalogue is larger.
  const readCodes = async () => {
    const rows: { country_code: string; status: string }[] = [];
    for (let from = 0; from < 20_000; from += 1000) {
      const { data } = await supabase.from("international_listings").select("country_code, status").order("id").range(from, from + 999);
      rows.push(...((data ?? []) as { country_code: string; status: string }[]));
      if ((data ?? []).length < 1000) break;
    }
    return rows;
  };
  const [codeRows, { count: newEnquiries }] = await Promise.all([
    readCodes(),
    supabase.from("international_enquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  const totals = new Map<string, { all: number; published: number }>();
  for (const r of codeRows) {
    const e = totals.get(r.country_code) ?? { all: 0, published: 0 };
    e.all += 1;
    if (r.status === "published") e.published += 1;
    totals.set(r.country_code, e);
  }
  const byName = (a: string, b: string) => countryName(a, locale).localeCompare(countryName(b, locale), locale);
  const catalogueCodes = [...totals.keys()].sort(byName);

  const tabHref = (k: Tab) => `/admin/international?tab=${k}`;

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        {t("title")} <GuideLink slug="international-admin" />
      </h1>
      <p className="mb-6 mt-2 max-w-3xl text-sm leading-6 text-muted">{t("intro")}</p>

      {sp.done && DONE.includes(sp.done) && (
        <p role="status" className="mb-6 rounded-lg bg-success-soft px-4 py-3 text-sm font-medium text-success-ink">
          {t(`done.${sp.done}` as never)}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="mb-6 rounded-lg bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {t(`error.${ERRORS.includes(sp.error) ? sp.error : "save_failed"}` as never)}
        </p>
      )}

      <nav aria-label={t("tabsLabel")} className="mb-6 border-b border-line">
        <ul className="-mb-px flex flex-wrap gap-x-1 gap-y-1">
          {TABS.map((k) => {
            const on = k === tab;
            return (
              <li key={k}>
                <Link
                  href={tabHref(k)}
                  aria-current={on ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-t-lg border-b-2 px-4 text-sm font-semibold transition-colors duration-150 ${FOCUS} ${
                    on ? "border-crimson text-crimson-strong" : "border-transparent text-muted-strong hover:border-line-strong hover:text-foreground"
                  }`}
                >
                  <Icon name={TAB_ICON[k]} size={18} />
                  {t(`tab.${k}` as never)}
                  {k === "enquiries" && (newEnquiries ?? 0) > 0 && (
                    <span className="rounded-full bg-crimson-btn px-2 py-0.5 text-xs font-bold tabular-nums text-white">
                      {format.number(newEnquiries ?? 0)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "contacts" && (await ContactsTab())}
      {tab === "listings" && (await ListingsTab())}
      {tab === "enquiries" && (await EnquiriesTab())}
      {tab === "rates" && (await RatesTab())}
    </div>
  );

  /* ---------------------------------------------------------------------
   * People in charge
   * ------------------------------------------------------------------ */
  async function ContactsTab() {
    const { data } = await supabase
      .from("country_contacts")
      .select("id, display_name, phone, email, role_label, all_countries, active, sort_order, country_contact_countries(country_code)")
      .order("sort_order")
      .order("created_at");
    const contacts = (data ?? []) as Contact[];
    const nameOf = new Map(contacts.map((c) => [c.id, c.display_name]));
    const codesOf = (c: Contact) => (c.country_contact_countries ?? []).map((x) => x.country_code).sort(byName);

    // Who a buyer reaches, per country that has something on show — asked of
    // the same function the enquiry form uses, not re-derived here.
    const publishedCodes = catalogueCodes.filter((c) => (totals.get(c)?.published ?? 0) > 0);
    const coverage = await Promise.all(
      publishedCodes.map(async (code) => {
        const { data: id } = await supabase.rpc("country_contact_for", { p_country: code });
        return { code, contactId: (id as string | null) ?? null };
      }),
    );
    const uncovered = coverage.filter((c) => !c.contactId);

    const editing = contacts.find((c) => c.id === sp.edit) ?? null;
    const editingCodes = editing ? codesOf(editing) : [];
    const pickable = [...new Set([...catalogueCodes, ...editingCodes])].sort(byName);

    return (
      <div className="space-y-6">
        {/* Coverage ------------------------------------------------------ */}
        <Panel title={t("coverageTitle")} hint={t("coverageHint")}>
          {publishedCodes.length === 0 ? (
            <p className="text-sm text-muted">{t("coverageEmpty")}</p>
          ) : (
            <>
              {uncovered.length > 0 && (
                <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-sm font-medium leading-6 text-warning-ink">
                  <Icon name="alert-triangle" size={18} className="mt-0.5" />
                  {t("coverageWarning", { count: uncovered.length })}
                </p>
              )}
              <ul data-intl-coverage className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {coverage.map(({ code, contactId }) => (
                  <li
                    key={code}
                    className={`rounded-xl border p-4 ${contactId ? "border-line bg-card" : "border-warning bg-warning-soft"}`}
                  >
                    <p className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                      <CountryTag code={code} name={countryName(code, locale)} />
                      <span className="shrink-0 text-xs font-medium text-muted-strong">
                        {t("listingCount", { count: totals.get(code)?.published ?? 0 })}
                      </span>
                    </p>
                    {contactId ? (
                      <p className="mt-2 flex items-center gap-2 text-sm text-foreground">
                        <Icon name="user" size={16} className="text-muted-strong" />
                        <span className="truncate">{nameOf.get(contactId) ?? t("unknownContact")}</span>
                      </p>
                    ) : (
                      <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-warning-ink">
                        <Icon name="alert-triangle" size={16} />
                        {t("noContact")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        {/* The list ------------------------------------------------------ */}
        <Panel title={t("contactsTitle")} hint={t("contactsHint")}>
          {contacts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center text-sm text-muted">{t("contactsEmpty")}</p>
          ) : (
            <ul className="grid gap-4 xl:grid-cols-2">
              {contacts.map((c) => {
                const wa = waDigits(c.phone);
                const codes = codesOf(c);
                return (
                  <li key={c.id} data-intl-contact className={`rounded-xl border border-line p-4 sm:p-5 ${c.active ? "bg-card" : "bg-surface"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-crimson-soft text-base font-bold text-crimson-strong">
                          {c.display_name.trim().charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-foreground">{c.display_name}</p>
                          {c.role_label && <p className="truncate text-sm text-muted-strong">{c.role_label}</p>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={c.active ? "success" : "neutral"}>{c.active ? t("active") : t("inactive")}</Badge>
                        <span className="text-xs text-muted">{t("orderValue", { n: c.sort_order })}</span>
                      </div>
                    </div>

                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-xs font-medium text-muted">{t("whatsapp")}</dt>
                        <dd className="mt-0.5">
                          {wa ? (
                            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-8 items-center gap-1.5 rounded font-semibold text-blue hover:underline ${FOCUS}`}>
                              <Icon name="message-circle" size={16} />
                              {c.phone}
                            </a>
                          ) : c.phone}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-medium text-muted">{t("email")}</dt>
                        <dd className="mt-0.5 break-all text-foreground">{c.email ?? "—"}</dd>
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <dt className="text-xs font-medium text-muted">{t("covers")}</dt>
                        <dd className="mt-1.5 flex flex-wrap gap-1.5">
                          {c.all_countries ? (
                            <Badge tone="info"><Icon name="globe" size={12} />{t("allCountries")}</Badge>
                          ) : codes.length ? (
                            codes.map((code) => (
                              <span key={code} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-foreground">
                                <CountryTag code={code} name={countryName(code, locale)} />
                              </span>
                            ))
                          ) : (
                            <span className="text-sm font-medium text-warning-ink">{t("coversNothing")}</span>
                          )}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-line pt-4">
                      <Link href={`/admin/international?tab=contacts&edit=${c.id}#contact-form`} className={BTN}>
                        {t("edit")}
                      </Link>
                      <form action={setContactActive}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                        <button type="submit" className={BTN}>{c.active ? t("deactivate") : t("activate")}</button>
                      </form>
                      {/* Two presses to delete, with no script: open, then confirm. */}
                      <details className="group">
                        <summary className={`${BTN_DANGER} list-none [&::-webkit-details-marker]:hidden`}>{t("delete")}</summary>
                        <form action={deleteContact} className="mt-2 max-w-xs rounded-lg border border-line bg-surface p-3">
                          <input type="hidden" name="id" value={c.id} />
                          <p className="text-sm leading-6 text-foreground">{t("deleteConfirm", { name: c.display_name })}</p>
                          <button type="submit" className={`${BTN_PRIMARY} mt-3 w-full`}>{t("deleteYes")}</button>
                        </form>
                      </details>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Add / edit ---------------------------------------------------- */}
        <Panel
          title={editing ? t("formEditTitle", { name: editing.display_name }) : t("formAddTitle")}
          hint={t("formHint")}
          className="scroll-mt-24"
          action={editing ? <Link href={tabHref("contacts")} className={BTN}>{t("cancelEdit")}</Link> : undefined}
        >
          {/* `key` resets the uncontrolled fields when switching between people. */}
          <form id="contact-form" key={editing?.id ?? "new"} action={saveContact} className="grid max-w-4xl scroll-mt-24 gap-5 sm:grid-cols-2">
            <input type="hidden" name="id" value={editing?.id ?? ""} />

            <label className={LABEL}>
              {t("fieldName")}
              <input name="displayName" required minLength={2} maxLength={120} defaultValue={editing?.display_name ?? ""} autoComplete="off" className={INPUT} />
            </label>
            <label className={LABEL}>
              {t("fieldRole")}
              <input name="roleLabel" maxLength={80} defaultValue={editing?.role_label ?? ""} autoComplete="off" className={INPUT} />
              <span className={HINT}>{t("fieldRoleHint")}</span>
            </label>
            <label className={LABEL}>
              {t("fieldPhone")}
              <input name="phone" type="tel" inputMode="tel" required maxLength={40} defaultValue={editing?.phone ?? ""} autoComplete="off" className={INPUT} />
              <span className={HINT}>{t("fieldPhoneHint")}</span>
            </label>
            <label className={LABEL}>
              {t("fieldEmail")}
              <input name="email" type="email" maxLength={200} defaultValue={editing?.email ?? ""} autoComplete="off" className={INPUT} />
            </label>

            <fieldset className="sm:col-span-2">
              <legend className={LABEL}>{t("fieldCoverage")}</legend>
              <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-foreground">
                <input type="checkbox" name="allCountries" defaultChecked={editing?.all_countries ?? false} className="h-5 w-5 accent-crimson" />
                {t("fieldAllCountries")}
              </label>
              <span className={HINT}>{t("fieldAllCountriesHint")}</span>

              {pickable.length > 0 && (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {pickable.map((code) => (
                    <li key={code}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 text-sm text-foreground hover:border-line-strong">
                        <input type="checkbox" name="countries" value={code} defaultChecked={editingCodes.includes(code)} className="h-5 w-5 shrink-0 accent-crimson" />
                        <CountryTag code={code} name={countryName(code, locale)} />
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              <label className={`${LABEL} mt-4 max-w-sm`}>
                {t("fieldExtra")}
                <input name="extraCountries" maxLength={60} autoCapitalize="characters" autoComplete="off" pattern="[A-Za-z]{2}([\s,;]+[A-Za-z]{2})*" className={`${INPUT} uppercase`} />
                <span className={HINT}>{t("fieldExtraHint")}</span>
              </label>
            </fieldset>

            <label className={LABEL}>
              {t("fieldOrder")}
              <input name="sortOrder" type="number" min={0} max={9999} defaultValue={editing?.sort_order ?? 100} className={INPUT} />
              <span className={HINT}>{t("fieldOrderHint")}</span>
            </label>
            <div className="flex items-end">
              <label className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-foreground">
                <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} className="h-5 w-5 accent-crimson" />
                {t("fieldActive")}
              </label>
            </div>

            <div className="sm:col-span-2">
              <button type="submit" className={BTN_PRIMARY}>{editing ? t("saveChanges") : t("addContact")}</button>
            </div>
          </form>
        </Panel>
      </div>
    );
  }

  /* ---------------------------------------------------------------------
   * Listings
   * ------------------------------------------------------------------ */
  async function ListingsTab() {
    const country = isCountryCode((sp.country ?? "").toUpperCase()) ? (sp.country as string).toUpperCase() : "";
    const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as string) : "";

    let query = supabase
      .from("international_listings")
      .select("id, slug, title, country_code, city, region, currency, price_min, price_max, status, is_featured, last_synced_at")
      .order("country_code")
      .order("title")
      .limit(300);
    if (country) query = query.eq("country_code", country);
    if (status) query = query.eq("status", status);
    const { data } = await query;
    const rows = (data ?? []) as ListingRow[];

    const priceText = (r: ListingRow) => {
      const min = r.price_min === null ? null : Number(r.price_min);
      const max = r.price_max === null ? null : Number(r.price_max);
      if (min === null && max === null) return "—";
      const p = formatFigure({ currency: r.currency, min, max, estimate: false }, locale);
      return p.kind === "range" ? t("priceRange", { min: p.min, max: p.max })
        : p.kind === "from" ? t("priceFrom", { value: p.value })
        : p.kind === "upTo" ? t("priceUpTo", { value: p.value })
        : p.value;
    };

    return (
      <Panel title={t("listingsTitle")} hint={t("listingsHint")} bodyClassName="px-0! py-0!">
        <form action="/admin/international" className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:flex-wrap sm:items-end">
          <input type="hidden" name="tab" value="listings" />
          <label className={`${LABEL} sm:w-60`}>
            {t("filterCountry")}
            <select name="country" defaultValue={country} className={INPUT}>
              <option value="">{t("filterAllCountries")}</option>
              {catalogueCodes.map((code) => (
                <option key={code} value={code}>
                  {countryName(code, locale)} ({format.number(totals.get(code)?.all ?? 0)})
                </option>
              ))}
            </select>
          </label>
          <label className={`${LABEL} sm:w-52`}>
            {t("filterStatus")}
            <select name="status" defaultValue={status} className={INPUT}>
              <option value="">{t("filterAllStatuses")}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}
            </select>
          </label>
          <button type="submit" className={BTN}>{t("applyFilter")}</button>
          <p className="text-sm text-muted-strong sm:ml-auto" aria-live="polite">{t("listingsShown", { count: rows.length })}</p>
        </form>

        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted">{t("listingsEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-left text-sm">
              <thead className="bg-surface text-xs uppercase text-muted-strong">
                <tr>
                  <th scope="col" className={TH}>{t("colTitle")}</th>
                  <th scope="col" className={TH}>{t("colCountry")}</th>
                  <th scope="col" className={TH}>{t("colCity")}</th>
                  <th scope="col" className={TH}>{t("colPrice")}</th>
                  <th scope="col" className={TH}>{t("colStatus")}</th>
                  <th scope="col" className={TH}>{t("colSynced")}</th>
                  <th scope="col" className={`${TH} text-right`}>{t("colAction")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className={`${TD} max-w-xs`}>
                      <span className="font-semibold text-foreground">{r.title}</span>
                      {r.is_featured && <Badge tone="warning" className="ml-2"><Icon name="star" size={12} />{t("featured")}</Badge>}
                      <span className="mt-0.5 block truncate font-mono text-xs text-muted">{r.slug}</span>
                    </td>
                    <td className={TD}><CountryTag code={r.country_code} name={countryName(r.country_code, locale)} /></td>
                    <td className={TD}>{[r.city, r.region].filter(Boolean).join(", ") || "—"}</td>
                    <td className={`${TD} tabular-nums`}>{priceText(r)}</td>
                    <td className={TD}><Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{t(`status.${r.status}` as never)}</Badge></td>
                    <td className={`${TD} whitespace-nowrap text-muted-strong`}>{when(r.last_synced_at)}</td>
                    <td className={`${TD} text-right`}>
                      <form action={setListingStatus} className="inline-block">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="to" value={r.status === "published" ? "withdrawn" : "published"} />
                        <input type="hidden" name="country" value={country} />
                        <input type="hidden" name="status" value={status} />
                        <button
                          type="submit"
                          aria-label={t(r.status === "published" ? "withdrawNamed" : "publishNamed", { title: r.title })}
                          className={r.status === "published" ? BTN : BTN_PRIMARY}
                        >
                          {r.status === "published" ? t("withdraw") : t("publish")}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    );
  }

  /* ---------------------------------------------------------------------
   * Enquiries
   * ------------------------------------------------------------------ */
  async function EnquiriesTab() {
    const { data } = await supabase
      .from("international_enquiries")
      .select("id, full_name, phone, email, message, status, created_at, international_listings(title, slug, country_code), country_contacts(display_name)")
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as unknown as EnquiryRow[];

    return (
      <Panel title={t("enquiriesTitle")} hint={t("enquiriesHint")} bodyClassName="px-0! py-0!">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted">{t("enquiriesEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-left text-sm">
              <thead className="bg-surface text-xs uppercase text-muted-strong">
                <tr>
                  <th scope="col" className={TH}>{t("colName")}</th>
                  <th scope="col" className={TH}>{t("colPhone")}</th>
                  <th scope="col" className={TH}>{t("colListing")}</th>
                  <th scope="col" className={TH}>{t("colCountry")}</th>
                  <th scope="col" className={TH}>{t("colPic")}</th>
                  <th scope="col" className={TH}>{t("colTime")}</th>
                  <th scope="col" className={TH}>{t("colStatus")}</th>
                  <th scope="col" className={`${TH} text-right`}>{t("colAction")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const listing = one(r.international_listings);
                  const pic = one(r.country_contacts);
                  const wa = waDigits(r.phone);
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <td className={`${TD} max-w-xs`}>
                        <span className="font-semibold text-foreground">{r.full_name}</span>
                        {r.email && <span className="block break-all text-xs text-muted-strong">{r.email}</span>}
                        {r.message && <span className="mt-1 line-clamp-3 block whitespace-pre-line text-xs leading-5 text-muted-strong">{r.message}</span>}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        {wa ? (
                          <a
                            href={`https://wa.me/${wa}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t("whatsappNamed", { name: r.full_name })}
                            className={`inline-flex min-h-11 items-center gap-1.5 rounded font-semibold text-blue hover:underline ${FOCUS}`}
                          >
                            <Icon name="message-circle" size={16} />
                            {r.phone}
                          </a>
                        ) : r.phone}
                      </td>
                      <td className={`${TD} max-w-xs`}>{listing?.title ?? "—"}</td>
                      <td className={TD}>
                        {listing ? <CountryTag code={listing.country_code} name={countryName(listing.country_code, locale)} /> : "—"}
                      </td>
                      <td className={TD}>
                        {pic?.display_name ?? <span className="font-medium text-warning-ink">{t("noContact")}</span>}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-muted-strong`}>{when(r.created_at)}</td>
                      <td className={TD}><Badge tone={ENQUIRY_TONE[r.status] ?? "neutral"}>{t(`enquiryStatus.${r.status}` as never)}</Badge></td>
                      <td className={`${TD} text-right`}>
                        <div className="flex justify-end gap-2">
                          {r.status === "new" && (
                            <form action={setEnquiryStatus}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="to" value="contacted" />
                              <button type="submit" className={`${BTN_PRIMARY} whitespace-nowrap`}>{t("markContacted")}</button>
                            </form>
                          )}
                          {r.status !== "closed" && (
                            <form action={setEnquiryStatus}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="to" value="closed" />
                              <button type="submit" className={BTN}>{t("close")}</button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    );
  }

  /* ---------------------------------------------------------------------
   * Exchange rates (read-only)
   * ------------------------------------------------------------------ */
  async function RatesTab() {
    const { data } = await supabase.from("fx_rates").select("currency, per_usd, as_of, source, updated_at").order("currency");
    const rows = (data ?? []) as { currency: string; per_usd: number; as_of: string; source: string; updated_at: string }[];
    const currencyName = (code: string) => {
      try {
        return new Intl.DisplayNames([locale], { type: "currency", fallback: "code" }).of(code) ?? code;
      } catch {
        return code;
      }
    };

    return (
      <div className="space-y-6">
        <p className="flex items-start gap-2 rounded-lg bg-blue-soft px-4 py-3 text-sm leading-6 text-foreground">
          <Icon name="help" size={18} className="mt-0.5 text-blue" />
          {t("ratesNote")}
        </p>
        <Panel title={t("ratesTitle")} hint={t("ratesHint")} bodyClassName="px-0! py-0!">
          {rows.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-muted">{t("ratesEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="bg-surface text-xs uppercase text-muted-strong">
                  <tr>
                    <th scope="col" className={TH}>{t("colCurrency")}</th>
                    <th scope="col" className={`${TH} text-right`}>{t("colPerUsd")}</th>
                    <th scope="col" className={TH}>{t("colAsOf")}</th>
                    <th scope="col" className={TH}>{t("colSource")}</th>
                    <th scope="col" className={TH}>{t("colUpdated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.currency} className="border-t border-line">
                      <td className={TD}>
                        <span className="font-mono font-bold text-foreground">{r.currency}</span>
                        <span className="ml-2 text-muted-strong">{currencyName(r.currency)}</span>
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{format.number(Number(r.per_usd), { maximumFractionDigits: 6 })}</td>
                      <td className={`${TD} whitespace-nowrap`}>{day(r.as_of)}</td>
                      <td className={`${TD} text-muted-strong`}>{r.source}</td>
                      <td className={`${TD} whitespace-nowrap text-muted-strong`}>{when(r.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    );
  }
}
