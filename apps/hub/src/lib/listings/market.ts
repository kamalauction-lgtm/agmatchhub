import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asMarketCountry, type MarketCountry, type SizeUnit } from "./vocabulary";

/**
 * The agent's market, read from their own profile and the `countries` row
 * (D8, P0-d-1b). Country, currency, unit and listing language are never taken
 * from a form: an agent's listing belongs to the agent's market.
 *
 * Returns null for an agent whose country is not a live listing market, so
 * callers refuse rather than guess.
 */
export type AgentMarket = {
  country: MarketCountry;
  currency: string;
  language: string;
  unit: SizeUnit;
};

export async function getAgentMarket(supabase: SupabaseClient, userId: string): Promise<AgentMarket | null> {
  const { data } = await supabase
    .from("profiles")
    .select("country_code, countries(default_currency, default_language, measurement_unit, active)")
    .eq("id", userId)
    .maybeSingle();
  const country = asMarketCountry((data?.country_code as string | null) ?? null);
  if (!country) return null;
  const row = (Array.isArray(data?.countries) ? data?.countries[0] : data?.countries) as
    | { default_currency: string | null; default_language: string | null; measurement_unit: string | null; active: boolean | null }
    | null
    | undefined;
  if (!row || row.active === false || !row.default_currency || !row.default_language) return null;
  return {
    country,
    currency: row.default_currency,
    language: row.default_language,
    unit: row.measurement_unit === "sqft" ? "sqft" : "sqm",
  };
}
