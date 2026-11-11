import "server-only";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadWorkforceModels, providerKeyPresent } from "./workforce-status";
import { buildOffice, type JobRow, type OfficeData, type PersonaRow, type RoleRow, type TaskRow } from "./office-state";

/**
 * Loads everything the Live Office needs AS THE SIGNED-IN AGENT, so RLS
 * scopes jobs and tasks to their own rows. Nothing here can see another
 * agent's jobs, and no prompt or model output is read — only job metadata.
 */
export const OFFICE_CATEGORY_ORDER = [
  "admin_productivity", "leads_crm", "whatsapp_email", "marketing_content", "property_matching", "appointments",
  "listing_research", "property_management", "posters_video_social", "sales_transaction", "team_training", "international",
] as const;

export async function loadOffice(): Promise<OfficeData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const locale = await getLocale();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [{ data: roles }, { data: personas }, models, { data: jobs }, { data: tasks }, { data: profile }, { data: heroLink }] =
    await Promise.all([
      supabase.from("ai_roles").select("key, category, sort, status, route, external_url, feature, name").neq("status", "hidden"),
      supabase.from("ai_role_personas").select("role_key, country_code, name, avatar_path, portrait_path"),
      loadWorkforceModels(supabase),
      supabase
        .from("ai_jobs")
        .select("feature, status, denied_reason, created_at, latency_ms, input_ref_type, input_ref_id")
        .eq("user_id", user.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("agent_tasks")
        .select("id, title, source, status, due_at, kind, lead_id, listing_id")
        .eq("agent_id", user.id)
        .eq("status", "open")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(100),
      supabase.from("profiles").select("agent_status, country_code").eq("id", user.id).maybeSingle(),
      supabase.from("hero_links").select("status").eq("user_id", user.id).maybeSingle(),
    ]);

  return buildOffice({
    roles: (roles ?? []) as RoleRow[],
    personas: (personas ?? []) as PersonaRow[],
    models,
    jobs: (jobs ?? []) as JobRow[],
    tasks: (tasks ?? []) as TaskRow[],
    ctx: { verified: profile?.agent_status === "verified", heroLinked: heroLink?.status === "linked" },
    country: profile?.country_code ?? null,
    locale,
    now: new Date(),
    keyPresent: providerKeyPresent,
    categoryOrder: OFFICE_CATEGORY_ORDER,
  });
}

/**
 * The platform view of the Live Office for /admin/ai/office (screen 12): the
 * same rooms and characters, drawn from the last seven days of job METADATA
 * across all agents (no prompt or output, no agent identity), with no agent
 * tasks. The caller must hold ai.manage; RLS on ai_jobs applies as well.
 */
export async function loadPlatformOffice(): Promise<OfficeData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const locale = await getLocale();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: roles }, { data: personas }, models, { data: jobs }] = await Promise.all([
    supabase.from("ai_roles").select("key, category, sort, status, route, external_url, feature, name").neq("status", "hidden"),
    supabase.from("ai_role_personas").select("role_key, country_code, name, avatar_path, portrait_path"),
    loadWorkforceModels(supabase),
    supabase
      .from("ai_jobs")
      .select("feature, status, denied_reason, created_at, latency_ms")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);
  return buildOffice({
    roles: (roles ?? []) as RoleRow[],
    personas: (personas ?? []) as PersonaRow[],
    models,
    jobs: ((jobs ?? []) as JobRow[]).map((j) => ({ ...j, input_ref_type: null, input_ref_id: null })) as JobRow[],
    tasks: [],
    ctx: { verified: true, heroLinked: true },
    country: null,
    locale,
    now: new Date(),
    keyPresent: providerKeyPresent,
    categoryOrder: OFFICE_CATEGORY_ORDER,
  });
}
