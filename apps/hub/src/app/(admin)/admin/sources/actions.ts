"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Source registry (screen 8, 00127). The database decides who may do what:
 * registering and mapping need a global platform.configure grant; the terms
 * review needs a global legal.publish grant. Every change is audited.
 */
const back = (q: string): never => redirect(`/admin/sources?${q}`);

const registerSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9.\-_]{1,80}$/),
  displayName: z.string().trim().min(2).max(120).regex(/^[^<>]*$/),
  kind: z.enum(["portal", "partner_feed", "agent_file", "other"]),
  countryCode: z.string().regex(/^[A-Z]{2}$/).optional().or(z.literal("")),
});

export async function registerSource(formData: FormData): Promise<void> {
  await requireAdmin();
  const p = registerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!p.success) return back("error=invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.from("listing_sources").insert({
    key: p.data.key, display_name: p.data.displayName, kind: p.data.kind, country_code: p.data.countryCode || null,
  }).select("id").single();
  if (error || !data) return back(/duplicate|unique/i.test(error?.message ?? "") ? "error=exists" : "error=not_permitted");
  await logAudit({ action: "source.registered", entityType: "listing_source", entityId: data.id, next: { key: p.data.key, kind: p.data.kind } });
  revalidatePath("/admin/sources");
  return back("done=registered");
}

const mappingSchema = z.object({ sourceId: z.string().uuid(), mapping: z.string().max(4000) });

export async function saveMapping(formData: FormData): Promise<void> {
  await requireAdmin();
  const p = mappingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!p.success) return back("error=invalid");
  let mapping: unknown;
  try { mapping = JSON.parse(p.data.mapping || "{}"); } catch { return back("error=mapping_json"); }
  // A mapping is source field → platform field, both short identifiers.
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)
      || !Object.entries(mapping as Record<string, unknown>).every(([k, v]) => /^[A-Za-z0-9_.\-]{1,60}$/.test(k) && typeof v === "string" && /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(v))) {
    return back("error=mapping_shape");
  }
  const supabase = await createClient();
  const { data: before } = await supabase.from("listing_sources").select("field_mapping").eq("id", p.data.sourceId).maybeSingle();
  const { data, error } = await supabase.from("listing_sources").update({ field_mapping: mapping }).eq("id", p.data.sourceId).select("id");
  if (error || !(data ?? []).length) return back("error=not_permitted");
  await logAudit({ action: "source.mapping_updated", entityType: "listing_source", entityId: p.data.sourceId, previous: before?.field_mapping ?? null, next: mapping });
  revalidatePath("/admin/sources");
  return back("done=mapping");
}

const termsSchema = z.object({
  sourceId: z.string().uuid(),
  termsStatus: z.enum(["unreviewed", "allowed", "agent_supplied_only", "forbidden"]),
  termsNote: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function setTerms(formData: FormData): Promise<void> {
  await requireAdmin();
  const p = termsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!p.success) return back("error=invalid");
  const supabase = await createClient();
  const { data: before } = await supabase.from("listing_sources").select("terms_status").eq("id", p.data.sourceId).maybeSingle();
  const { data, error } = await supabase.from("listing_sources").update({ terms_status: p.data.termsStatus, terms_note: p.data.termsNote || null }).eq("id", p.data.sourceId).select("id");
  if (error || !(data ?? []).length) return back(/terms_review_requires_legal/.test(error?.message ?? "") ? "error=needs_legal" : "error=not_permitted");
  await logAudit({ action: "source.terms_reviewed", entityType: "listing_source", entityId: p.data.sourceId, previous: { terms_status: before?.terms_status ?? null }, next: { terms_status: p.data.termsStatus }, reason: p.data.termsNote || undefined });
  revalidatePath("/admin/sources");
  return back("done=terms");
}
