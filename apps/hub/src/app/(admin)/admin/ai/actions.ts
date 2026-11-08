"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Admin edits to the AI engine's data: routing, caps, the role catalogue.
 * Every change is audited with its previous value — "when did we move the
 * Secretary to the fallback model" is a question somebody will ask.
 */

const PATH = "/admin/ai";
// A declared function (not a const arrow) so TypeScript narrows after
// `if (!ok) done("invalid")` — control-flow analysis only trusts `never` on
// an explicitly annotated function declaration.
function done(notice: string): never {
  redirect(`${PATH}?notice=${notice}`);
}

const modelSchema = z.object({
  feature: z.string().min(2).max(40),
  provider: z.enum(["gemini", "anthropic", "none"]),
  model: z.string().trim().min(1).max(80),
  fallback_provider: z.enum(["gemini", "anthropic", ""]).default(""),
  fallback_model: z.string().trim().max(80).default(""),
  tier: z.enum(["standard", "premium"]),
  enabled: z.enum(["on"]).optional(),
  max_output_tokens: z.coerce.number().int().min(0).max(8192),
  input_cost_micros_per_1k: z.coerce.number().int().min(0).max(100_000_000),
  output_cost_micros_per_1k: z.coerce.number().int().min(0).max(100_000_000),
});

export async function updateModel(formData: FormData): Promise<void> {
  const actor = await requireCapability("ai.manage");
  const parsed = modelSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) done("invalid");
  const f = parsed.data;

  const supabase = await createClient();
  const { data: before } = await supabase.from("ai_models").select("*").eq("feature", f.feature).maybeSingle();
  if (!before) done("invalid");

  const patch = {
    provider: f.provider,
    model: f.model,
    fallback_provider: f.fallback_provider || null,
    fallback_model: f.fallback_provider ? f.fallback_model || null : null,
    tier: f.tier,
    enabled: f.enabled === "on",
    max_output_tokens: f.max_output_tokens,
    input_cost_micros_per_1k: f.input_cost_micros_per_1k,
    output_cost_micros_per_1k: f.output_cost_micros_per_1k,
    updated_by: actor.id,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("ai_models").update(patch).eq("feature", f.feature);
  if (error) {
    console.error("updateModel failed", error.code, error.message);
    done("failed");
  }
  await logAudit({
    action: "ai.model_route_changed",
    entityType: "ai_model",
    entityId: f.feature,
    previous: { provider: before.provider, model: before.model, enabled: before.enabled, tier: before.tier },
    next: { provider: patch.provider, model: patch.model, enabled: patch.enabled, tier: patch.tier },
  });
  revalidatePath(PATH);
  done("updated");
}

const settingsSchema = z.object({
  enabled: z.enum(["on"]).optional(),
  daily_platform_cap_micros: z.coerce.number().int().min(0),
  monthly_platform_cap_micros: z.coerce.number().int().min(0),
  per_user_daily_cap: z.coerce.number().int().min(0).max(10_000),
  circuit_error_threshold: z.coerce.number().int().min(1).max(100),
  close_circuit: z.enum(["on"]).optional(),
});

export async function updateSettings(formData: FormData): Promise<void> {
  const actor = await requireCapability("ai.manage");
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) done("invalid");
  const s = parsed.data;

  const supabase = await createClient();
  const { data: before } = await supabase.from("ai_settings").select("*").limit(1).maybeSingle();
  const patch: Record<string, unknown> = {
    enabled: s.enabled === "on",
    daily_platform_cap_micros: s.daily_platform_cap_micros,
    monthly_platform_cap_micros: s.monthly_platform_cap_micros,
    per_user_daily_cap: s.per_user_daily_cap,
    circuit_error_threshold: s.circuit_error_threshold,
    updated_by: actor.id,
    updated_at: new Date().toISOString(),
  };
  if (s.close_circuit === "on") patch.circuit_open_until = null;

  const { error } = await supabase.from("ai_settings").update(patch).eq("id", true);
  if (error) {
    console.error("updateSettings failed", error.code, error.message);
    done("failed");
  }
  await logAudit({
    action: "ai.settings_changed",
    entityType: "ai_settings",
    previous: before ? { enabled: before.enabled, daily: before.daily_platform_cap_micros, monthly: before.monthly_platform_cap_micros, per_user: before.per_user_daily_cap } : null,
    next: { enabled: patch.enabled, daily: patch.daily_platform_cap_micros, monthly: patch.monthly_platform_cap_micros, per_user: patch.per_user_daily_cap, circuit_closed: s.close_circuit === "on" },
  });
  revalidatePath(PATH);
  done("updated");
}

const roleSchema = z.object({
  key: z.string().min(2).max(60),
  status: z.enum(["live", "planned", "hidden"]),
});

export async function updateRoleStatus(formData: FormData): Promise<void> {
  const actor = await requireCapability("ai.manage");
  const parsed = roleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) done("invalid");
  const { key, status } = parsed.data;

  const supabase = await createClient();
  const { data: before } = await supabase.from("ai_roles").select("status").eq("key", key).maybeSingle();
  if (!before) done("invalid");
  const { error } = await supabase
    .from("ai_roles")
    .update({ status, updated_by: actor.id, updated_at: new Date().toISOString() })
    .eq("key", key);
  if (error) {
    console.error("updateRoleStatus failed", error.code, error.message);
    done("failed");
  }
  await logAudit({
    action: "ai.role_status_changed",
    entityType: "ai_role",
    entityId: key,
    previous: { status: before.status },
    next: { status },
  });
  revalidatePath(PATH);
  revalidatePath("/ai");
  done("updated");
}
