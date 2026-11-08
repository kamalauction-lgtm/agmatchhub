-- =============================================================================
-- 00085 — AI Communication Secretary (Stage B, E5 · 7 Nov 2026)
--
-- No new table. The Secretary drafts; the agent sends. What the database needs
-- to know is only that a draft was made and that an e-mail went out, both as
-- lead events — so the agent's timeline and the morning brief can see them.
-- The agent-insert policy on lead_events named its three kinds explicitly
-- (00034); the two new ones join the list. The 15-minute nudge is written by
-- the cron with the service role, which this policy does not govern.
-- =============================================================================

drop policy if exists "lead events agent insert" on public.lead_events;
create policy "lead events agent insert" on public.lead_events
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and kind in ('status.changed', 'lead.responded', 'note.added', 'ai.reply_drafted', 'email.sent')
    and exists (select 1 from public.leads l
                where l.id = lead_id and l.agent_id = auth.uid())
  );

update public.ai_roles set status = 'live', route = '/leads', updated_at = now()
 where key in ('reply_drafter', 'email_composer');
