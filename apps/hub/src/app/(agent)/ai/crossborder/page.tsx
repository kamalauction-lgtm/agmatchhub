import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { ToolHeader } from "@/components/ai/tool-header";
import { CrossborderTool } from "@/components/ai/crossborder-tool";
import { AI_REASON_KEYS } from "@/components/ai/ai-status";
import { runCrossborder } from "../actions";

const TOPICS = ["eligibility", "minimum_price", "restrictions", "title_types", "taxes_buying", "taxes_selling", "financing", "process", "holding_costs", "visas"] as const;

/** Cross-border Researcher — what a buyer from the other market needs to know, from verified facts only. */
export default async function CrossborderPage() {
  const user = await requireUser();
  const t = await getTranslations("aiTools.crossborder");
  const tr = await getTranslations("aiTools");
  const supabase = await createClient();
  const [{ data: profile }, { data: countries }, { data: mine }] = await Promise.all([
    supabase.from("profiles").select("country_code").eq("id", user.id).maybeSingle(),
    supabase.from("countries").select("code, name").eq("active", true).order("name"),
    supabase.from("listings").select("id, title, status, properties (country_code)").eq("agent_id", user.id).eq("status", "published").order("created_at", { ascending: false }).limit(60),
  ]);
  const listings = ((mine ?? []) as unknown as { id: string; title: string; properties: { country_code: string } | { country_code: string }[] | null }[]).map((l) => {
    const p = Array.isArray(l.properties) ? l.properties[0] : l.properties;
    return { id: l.id, title: l.title, country: p?.country_code ?? "" };
  });
  const k = ["listingCountry", "buyerCountry", "listing", "noListing", "run", "working", "facts", "draft", "verified", "draftBanner", "headline", "nextSteps", "mustCheck", "copy", "copied", "source"] as const;
  return (
    <AgentShell wide>
      <ToolHeader roleKey="crossborder_researcher" title={t("title")} intro={t("intro")} userId={user.id} />
      <CrossborderTool
        action={runCrossborder}
        countries={(countries ?? []) as { code: string; name: string }[]}
        listings={listings}
        initialListingCountry={profile?.country_code ?? countries?.[0]?.code ?? "MY"}
        labels={{
          sourceAi: tr.raw("sourceAi") as string, sourceRules: tr("sourceRules"),
          reasons: Object.fromEntries(AI_REASON_KEYS.map((x) => [x, tr(`reason.${x}`)])),
          topics: Object.fromEntries(TOPICS.map((x) => [x, t(`topics.${x}`)])),
          ...(Object.fromEntries(k.map((x) => [x, t(x)])) as Record<(typeof k)[number], string>),
        }}
      />
    </AgentShell>
  );
}
