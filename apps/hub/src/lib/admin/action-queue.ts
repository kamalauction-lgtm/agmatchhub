import "server-only";
import { createClient } from "@/lib/supabase/server";
import { rankQueue, type QueueItem } from "./queue-score";

/**
 * Collects the Command Centre's action queue (screen 1). Each source is read
 * only if the admin holds its capability, with the admin's own session, so
 * the existing RLS policies keep every row inside the admin's countries.
 * No buyer or client contact data is read: titles are listing titles, agent
 * display names and references.
 */

const LIMIT = 30;

export async function loadActionQueue(nowIso: string) {
  const supabase = await createClient();
  const caps = ["listing.moderate", "agent.verify", "media.review", "request.manage", "agent.invite"] as const;
  const held = Object.fromEntries(await Promise.all(caps.map(async (c) => {
    const { data } = await supabase.rpc("has_capability", { p_capability: c });
    return [c, !!data] as const;
  }))) as Record<(typeof caps)[number], boolean>;

  const items: QueueItem[] = [];
  const tasks: Promise<void>[] = [];

  if (held["listing.moderate"]) {
    tasks.push((async () => {
      const { data } = await supabase.from("listings").select("id, title, created_at").eq("status", "pending_review").order("created_at").limit(LIMIT);
      for (const l of data ?? []) items.push({ kind: "listing_review", id: l.id, title: l.title, href: "/admin/listings", since: l.created_at });
    })());
    tasks.push((async () => {
      const { data } = await supabase.from("listing_reports").select("id, reason_code, created_at, listings (title)").eq("status", "open").order("created_at").limit(LIMIT);
      for (const r of data ?? []) {
        const t = (Array.isArray(r.listings) ? r.listings[0] : r.listings) as { title?: string } | null;
        items.push({ kind: r.reason_code === "scam_or_fraud" ? "report_scam" : "report", id: r.id, title: t?.title ?? "", href: "/admin/listings/reports", since: r.created_at });
      }
    })());
    tasks.push((async () => {
      const { data } = await supabase.from("listing_change_requests").select("id, answered_at, listings (title)").eq("status", "answered").order("answered_at").limit(LIMIT);
      for (const c of data ?? []) {
        const t = (Array.isArray(c.listings) ? c.listings[0] : c.listings) as { title?: string } | null;
        if (c.answered_at) items.push({ kind: "change_answered", id: c.id, title: t?.title ?? "", href: "/admin/handover", since: c.answered_at });
      }
    })());
  }
  if (held["agent.verify"]) {
    tasks.push((async () => {
      const { data } = await supabase.from("profiles").select("id, display_name, created_at, agent_profiles (submitted_at)").eq("agent_status", "under_review").limit(LIMIT);
      for (const p of data ?? []) {
        const ap = (Array.isArray(p.agent_profiles) ? p.agent_profiles[0] : p.agent_profiles) as { submitted_at?: string | null } | null;
        items.push({ kind: "agent_review", id: p.id, title: p.display_name ?? "", href: `/admin/agents/${p.id}`, since: ap?.submitted_at ?? p.created_at });
      }
    })());
  }
  if (held["media.review"]) {
    tasks.push((async () => {
      const { data } = await supabase.from("listing_media").select("id, listing_id, created_at, listings (title)").eq("processing_state", "failed").order("created_at").limit(LIMIT);
      for (const m of data ?? []) {
        const t = (Array.isArray(m.listings) ? m.listings[0] : m.listings) as { title?: string } | null;
        items.push({ kind: "photo_failed", id: m.id, title: t?.title ?? "", href: `/admin/media?listing=${m.listing_id}&view=attention`, since: m.created_at });
      }
    })());
  }
  if (held["request.manage"]) {
    tasks.push((async () => {
      const { data } = await supabase.from("leads").select("id, human_readable_id, first_response_due, listings (title)").is("first_responded_at", null).lt("first_response_due", nowIso).order("first_response_due").limit(LIMIT);
      for (const l of data ?? []) {
        const t = (Array.isArray(l.listings) ? l.listings[0] : l.listings) as { title?: string } | null;
        if (l.first_response_due) items.push({ kind: "lead_overdue", id: l.id, title: `${l.human_readable_id}${t?.title ? ` · ${t.title}` : ""}`, href: "/admin/leads", since: l.first_response_due });
      }
    })());
    tasks.push((async () => {
      const { data } = await supabase.from("property_requests").select("id, human_readable_id, title, updated_at").in("status", ["pending_admin_approval", "resubmitted"]).order("updated_at").limit(LIMIT);
      for (const r of data ?? []) items.push({ kind: "request_review", id: r.id, title: `${r.human_readable_id} · ${r.title ?? ""}`, href: `/admin/requests/${r.id}`, since: r.updated_at });
    })());
  }
  if (held["agent.invite"]) {
    tasks.push((async () => {
      const soon = new Date(Date.parse(nowIso) + 2 * 86_400_000).toISOString();
      const { data } = await supabase.from("agent_invitations").select("id, full_name, created_at, expires_at").eq("status", "pending").gt("expires_at", nowIso).lt("expires_at", soon).limit(LIMIT);
      for (const i of data ?? []) items.push({ kind: "invite_expiring", id: i.id, title: i.full_name ?? "", href: "/admin/agents/invitations", since: i.created_at });
    })());
  }
  await Promise.all(tasks);
  return rankQueue(items, nowIso);
}
