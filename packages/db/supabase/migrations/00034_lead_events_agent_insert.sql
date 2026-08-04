-- =============================================================================
-- 00034 — lead_events: let the assigned agent write to their own lead's trail
--
-- Found by E2E verification, not by review: 00033 gave lead_events a SELECT
-- policy only, so the hub's status-change and responded events were silently
-- swallowed by RLS (PostgREST reports the denial, but the action treated the
-- trail as fire-and-forget). The status updates themselves succeeded, which is
-- exactly why a missing trail is dangerous — everything looks fine until a
-- dispute needs the history.
--
-- The insert is constrained to what an agent can honestly claim: an event on
-- a lead assigned to them, attributed to themselves, with a kind from the
-- agent-actions vocabulary. System kinds (inquiry.submitted, ghl.*) stay
-- definer/service-only.
-- =============================================================================

create policy "lead events agent insert" on public.lead_events
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and kind in ('status.changed', 'lead.responded', 'note.added')
    and exists (select 1 from public.leads l
                where l.id = lead_id and l.agent_id = auth.uid())
  );
