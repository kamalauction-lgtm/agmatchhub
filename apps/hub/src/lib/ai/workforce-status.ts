import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiKeyEnvName } from "@pg/ai";
import {
  summariseWorkforce,
  type Provider,
  type WorkforceModel,
  type WorkforceRole,
  type WorkforceSummary,
  type AccessContext,
} from "./workforce-status-rules";

/**
 * Loads the two tables the status mapping needs and answers "is this
 * provider's key present in THIS deployment?" from the environment — the same
 * question `runAi` asks before it calls anyone. Nothing about a key is ever
 * returned, only whether one exists.
 */
export const providerKeyPresent = (p: Provider): boolean => !!process.env[apiKeyEnvName(p)];

export async function loadWorkforceModels(supabase: SupabaseClient): Promise<WorkforceModel[]> {
  const { data } = await supabase.from("ai_models").select("feature, provider, fallback_provider, enabled");
  return (data ?? []) as WorkforceModel[];
}

/** The summary a card or a band shows: total · open to you · with AI connected. */
export async function workforceSummary(supabase: SupabaseClient, ctx: AccessContext): Promise<WorkforceSummary> {
  const [{ data: roles }, models] = await Promise.all([
    supabase.from("ai_roles").select("key, status, route, external_url, feature").neq("status", "hidden"),
    loadWorkforceModels(supabase),
  ]);
  return summariseWorkforce((roles ?? []) as WorkforceRole[], models, ctx, providerKeyPresent);
}
