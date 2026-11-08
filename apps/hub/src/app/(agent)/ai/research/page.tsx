import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { ToolHeader } from "@/components/ai/tool-header";
import { ResearchTool } from "@/components/ai/research-tool";
import { AI_REASON_KEYS } from "@/components/ai/ai-status";
import { runResearch } from "../actions";

/**
 * Listing Researcher — comparable published listings and their asking
 * prices around a search. Public facts only (the same ones the marketplace
 * shows), so there is nothing here an agent could not see by browsing.
 */
export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ type?: string; regency?: string; lt?: string; br?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const t = await getTranslations("aiTools.research");
  const tr = await getTranslations("aiTools");
  const tpt = await getTranslations("propertyTypes");
  const supabase = await createClient();

  const [{ data: profile }, { data: countries }, { data: types }, { data: regs }] = await Promise.all([
    supabase.from("profiles").select("country_code").eq("id", user.id).maybeSingle(),
    supabase.from("countries").select("code, name").eq("active", true).order("name"),
    supabase.from("public_facet_property_types").select("property_type, country_code").order("property_type"),
    supabase.from("public_facet_locations").select("regency_name, country_code").order("regency_name"),
  ]);
  const seen = new Set<string>();
  const propertyTypes = ((types ?? []) as { property_type: string; country_code: string }[])
    .filter((x) => !seen.has(`${x.country_code}|${x.property_type}`) && seen.add(`${x.country_code}|${x.property_type}`))
    .map((x) => ({ slug: x.property_type, label: tpt.has(x.property_type as never) ? tpt(x.property_type as never) : x.property_type, country: x.country_code }));
  const seenR = new Set<string>();
  const regencies = ((regs ?? []) as { regency_name: string | null; country_code: string }[])
    .filter((x) => x.regency_name && !seenR.has(`${x.country_code}|${x.regency_name}`) && seenR.add(`${x.country_code}|${x.regency_name}`))
    .map((x) => ({ name: x.regency_name!, country: x.country_code }));
  const country = profile?.country_code ?? countries?.[0]?.code ?? "ID";

  return (
    <AgentShell wide>
      <ToolHeader roleKey="listing_researcher" title={t("title")} intro={t("intro")} userId={user.id} />
      <ResearchTool
        action={runResearch}
        countries={(countries ?? []) as { code: string; name: string }[]}
        propertyTypes={propertyTypes}
        regencies={regencies}
        marketplaceUrl={process.env.NEXT_PUBLIC_MARKETPLACE_URL ?? ""}
        initial={{ country, listingType: sp.lt === "rent" ? "rent" : "sale", propertyType: sp.type ?? "", regency: sp.regency ?? "", bedrooms: sp.br ?? "" }}
        labels={{
          sourceAi: tr.raw("sourceAi") as string, sourceRules: tr("sourceRules"),
          reasons: Object.fromEntries(AI_REASON_KEYS.map((k) => [k, tr(`reason.${k}`)])),
          listingType: t("listingType"), sale: t("sale"), rent: t("rent"), propertyType: t("propertyType"), regency: t("regency"), anyRegency: t("anyRegency"),
          bedrooms: t("bedrooms"), anyBedrooms: t("anyBedrooms"), run: t("run"), working: t("working"), stats: t("stats"), count: t("count"), median: t("median"),
          perSqm: t("perSqm"), range: t("range"), none: t("none"), comparables: t("comparables"), mine: t("mine"), typicalRange: t("typicalRange"),
          drivers: t("drivers"), caution: t("caution"), openListing: t("openListing"), published: t("published"),
        }}
      />
    </AgentShell>
  );
}
