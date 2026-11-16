import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/authz";
import { registerSource, saveMapping, setTerms } from "./actions";

/**
 * Source Mapping and Sync (screen 8, P2-a, 00127). The registry of where
 * listings come from, each source's terms review (a legal call) and its field
 * mapping. Sources already seen in imports but not yet registered are listed
 * to register. Re-sync is NOT available: it needs access to each external
 * source and the legal review of its terms (decision D-7).
 */
const STATUSES = ["unreviewed", "allowed", "agent_supplied_only", "forbidden"] as const;
const KINDS = ["portal", "partner_feed", "agent_file", "other"] as const;
type Source = { id: string; key: string; display_name: string; kind: string; country_code: string | null; terms_status: string; terms_note: string | null; terms_reviewed_at: string | null; field_mapping: Record<string, string> };

export const dynamic = "force-dynamic";

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const t = await getTranslations("adminSources");
  const supabase = await createClient();
  const [{ data: sources }, { data: seen }, { data: canConfigure }, { data: canLegal }] = await Promise.all([
    supabase.from("listing_sources").select("id, key, display_name, kind, country_code, terms_status, terms_note, terms_reviewed_at, field_mapping").order("key"),
    supabase.from("import_batches").select("source_portal, source_kind").not("source_portal", "is", null).limit(2000),
    supabase.rpc("has_global_capability", { p_capability: "platform.configure" }),
    supabase.rpc("has_global_capability", { p_capability: "legal.publish" }),
  ]);
  const registered = new Set((sources ?? []).map((s) => s.key));
  const seenCounts = new Map<string, number>();
  for (const b of seen ?? []) { const k = String(b.source_portal).toLowerCase(); seenCounts.set(k, (seenCounts.get(k) ?? 0) + 1); }
  const unregistered = [...seenCounts.entries()].filter(([k]) => !registered.has(k));
  const field = "min-h-9 rounded-lg border border-line bg-background px-2 text-sm";
  const tone = (s: string) => (s === "allowed" ? "bg-success/15 text-success" : s === "forbidden" ? "bg-danger/15 text-danger" : s === "agent_supplied_only" ? "bg-warning/15 text-warning" : "bg-surface text-muted");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-4 max-w-3xl text-sm text-muted">{t("hint")}</p>
      <p className="mb-6 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm" data-resync-blocked="1">{t("resyncBlocked")}</p>
      {sp.done && <p className="mb-4 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success" role="status">{t(`done.${sp.done}` as never)}</p>}
      {sp.error && <p className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{t.has(`errors.${sp.error}` as never) ? t(`errors.${sp.error}` as never) : t("errors.not_permitted")}</p>}

      {unregistered.length > 0 && (
        <section className="mb-8" data-unregistered={unregistered.length}>
          <h2 className="mb-2 font-semibold">{t("seenTitle")}</h2>
          <ul className="space-y-2">
            {unregistered.map(([k, n]) => (
              <li key={k} className="rounded-xl border border-line p-3 text-sm" data-seen-source={k}>
                <p><span className="font-mono">{k}</span> <span className="text-xs text-muted">{t("seenCount", { n })}</span></p>
                {canConfigure && (
                  <form action={registerSource} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="key" value={k} />
                    <input name="displayName" required minLength={2} maxLength={120} defaultValue={k} aria-label={t("displayName")} className={field} />
                    <select name="kind" defaultValue="portal" aria-label={t("kind")} className={field}>{KINDS.map((x) => <option key={x} value={x}>{t(`kinds.${x}`)}</option>)}</select>
                    <input name="countryCode" maxLength={2} placeholder="ID" aria-label={t("country")} className={`${field} w-20`} />
                    <button type="submit" className="min-h-9 cursor-pointer rounded-lg bg-crimson px-3 text-sm font-semibold text-white hover:bg-crimson-strong">{t("register")}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section data-sources={(sources ?? []).length}>
        <h2 className="mb-2 font-semibold">{t("registryTitle")}</h2>
        {!(sources ?? []).length ? <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-muted">{t("empty")}</p> : (
          <ul className="space-y-3">
            {((sources ?? []) as Source[]).map((s) => (
              <li key={s.id} className="rounded-xl border border-line p-4 text-sm" data-source={s.key} data-terms={s.terms_status}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p><span className="font-semibold">{s.display_name}</span> <span className="font-mono text-xs text-muted">{s.key}</span> <span className="text-xs text-muted">· {t(`kinds.${s.kind}` as never)}{s.country_code ? ` · ${s.country_code}` : ""}</span></p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone(s.terms_status)}`}>{t(`terms.${s.terms_status}` as never)}</span>
                </div>
                {s.terms_note && <p className="mt-1 text-xs text-muted">{s.terms_note}</p>}
                {canLegal && (
                  <form action={setTerms} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="sourceId" value={s.id} />
                    <select name="termsStatus" defaultValue={s.terms_status} aria-label={t("termsReview")} className={field}>{STATUSES.map((x) => <option key={x} value={x}>{t(`terms.${x}`)}</option>)}</select>
                    <input name="termsNote" maxLength={1000} defaultValue={s.terms_note ?? ""} placeholder={t("termsNote")} aria-label={t("termsNote")} className={`${field} min-w-0 flex-1`} />
                    <button type="submit" className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-sm hover:border-crimson">{t("saveTerms")}</button>
                  </form>
                )}
                <form action={saveMapping} className="mt-2 flex flex-wrap gap-2">
                  <input type="hidden" name="sourceId" value={s.id} />
                  <input name="mapping" defaultValue={JSON.stringify(s.field_mapping ?? {})} disabled={!canConfigure} aria-label={t("mapping")} className={`${field} min-w-0 flex-1 font-mono text-xs`} />
                  {canConfigure && <button type="submit" className="min-h-9 cursor-pointer rounded-lg border border-line px-3 text-sm hover:border-crimson">{t("saveMapping")}</button>}
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
