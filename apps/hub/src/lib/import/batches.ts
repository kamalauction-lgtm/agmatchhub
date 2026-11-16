import "server-only";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

/**
 * Where an import batch is created, for whom, and where its pages live.
 *
 * One importer, two doors (00107): an agent importing their own listings, and
 * an admin preparing a batch FOR an agent. Either way the batch belongs to the
 * agent (agent_id); the admin path goes through admin_import_batch_create(),
 * which checks listing.import_assisted for the agent's country and stamps the
 * admin as acting_admin_id. Only the agent can commit it.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type BatchFields = {
  source_kind: "portal_url" | "profile_url" | "excel" | "csv";
  source_portal: string;
  source_label: string;
  status: "processing" | "ready" | "failed";
  error?: string | null;
};

/** The agent a form is preparing for, or null for the caller's own import. */
export function forAgentFrom(formData: FormData): string | null {
  const raw = formData.get("forAgentId");
  if (raw == null || raw === "") return null;
  const parsed = z.string().uuid().safeParse(raw);
  return parsed.success ? parsed.data : "invalid";
}

export function importBase(forAgentId: string | null): string {
  return forAgentId ? "/admin/imports" : "/listings/import";
}

export async function createImportBatch(
  supabase: Supabase,
  callerId: string,
  forAgentId: string | null,
  fields: BatchFields,
): Promise<{ id: string } | null> {
  if (forAgentId) {
    const { data, error } = await supabase.rpc("admin_import_batch_create", {
      p_agent: forAgentId,
      p_source_kind: fields.source_kind,
      p_source_portal: fields.source_portal,
      p_source_label: fields.source_label,
      p_status: fields.status,
      p_error: fields.error ?? null,
    });
    return error || !data ? null : { id: data as string };
  }
  const { data, error } = await supabase
    .from("import_batches")
    .insert({ agent_id: callerId, ...fields })
    .select("id")
    .single();
  return error || !data ? null : { id: data.id as string };
}

/** The agent who owns a batch, and whether the caller is preparing it for them. */
export async function batchOwner(supabase: Supabase, batchId: string, callerId: string) {
  const { data } = await supabase
    .from("import_batches")
    .select("agent_id, acting_admin_id")
    .eq("id", batchId)
    .maybeSingle();
  if (!data) return null;
  return { agentId: data.agent_id as string, assisted: data.agent_id !== callerId };
}
