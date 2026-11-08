import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { ToolHeader } from "@/components/ai/tool-header";

/**
 * Partner Finder — verified agents in the OTHER market whose categories
 * overlap the agent's, ranked by overlap, then by live pool offers. Reads
 * only what each agent's public profile already shows (00098
 * `my_partner_candidates`). Contact goes through the public card, never a
 * phone number from here.
 */
type Row = {
  id: string; public_slug: string | null; display_name: string; avatar_url: string | null; country_code: string; agency_name: string | null; city: string | null;
  markets_served: string[] | null; property_categories: string[] | null; published_listing_count: number; pool_offers: number; shared_categories: string[];
};

export default async function PartnersPage() {
  const user = await requireUser();
  const t = await getTranslations("aiTools.partners");
  const tc = await getTranslations("requests.form.categories");
  const supabase = await createClient();
  const [{ data: rows }, { data: me }] = await Promise.all([
    supabase.rpc("my_partner_candidates", { p_limit: 30 }),
    supabase.from("agent_profiles").select("property_categories").eq("user_id", user.id).maybeSingle(),
  ]);
  const list = (rows ?? []) as Row[];
  const cat = (c: string) => (tc.has(c as never) ? tc(c as never) : c);

  return (
    <AgentShell wide>
      <ToolHeader roleKey="partner_finder" title={t("title")} intro={t("intro")} userId={user.id} />
      {!me?.property_categories?.length && (
        <p className="mb-4 rounded-lg bg-warning/10 px-4 py-3 text-sm text-warning">{t("noCategories")} <Link href="/profile" className="font-semibold underline">{t("editProfile")}</Link></p>
      )}
      {!list.length ? (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">{t("empty")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((a) => (
            <article key={a.id} className="rounded-xl border border-line bg-card p-4 shadow-card">
              <div className="flex items-center gap-3">
                {a.avatar_url ? <Image src={a.avatar_url} alt="" width={44} height={44} unoptimized className="h-11 w-11 rounded-full object-cover" /> : <span className="grid h-11 w-11 place-items-center rounded-full bg-surface text-lg">👤</span>}
                <div className="min-w-0">
                  <p className="truncate font-semibold">{a.display_name}</p>
                  <p className="truncate text-xs text-muted">{[a.agency_name, a.city, a.country_code].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
              {a.shared_categories.length > 0 && (
                <p className="mt-3 flex flex-wrap gap-1">{a.shared_categories.map((c) => <span key={c} className="rounded-full bg-indigo-soft px-2 py-0.5 text-[11px] font-semibold text-indigo">{cat(c)}</span>)}</p>
              )}
              <p className="mt-3 text-xs text-muted">{t("listings", { count: a.published_listing_count })} · {t("poolOffers", { count: a.pool_offers })}</p>
              <div className="mt-3 flex gap-2">
                {a.public_slug && <Link href={`/c/${a.public_slug}`} className="rounded-lg bg-crimson px-3 py-1.5 text-xs font-semibold text-white hover:bg-crimson-strong">{t("viewCard")}</Link>}
                {a.pool_offers > 0 && <Link href="/collab/pool" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface">{t("seePool")}</Link>}
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="mt-6 text-[11px] text-muted">{t("privacy")}</p>
    </AgentShell>
  );
}
