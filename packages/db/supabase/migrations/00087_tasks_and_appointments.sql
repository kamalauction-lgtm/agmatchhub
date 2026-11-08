-- =============================================================================
-- 00087 — Task & Appointment Assistant (Stage B, E7 · 7 Nov 2026)
--
--   agent_tasks           the agent's own to-do list: proposed by the AI
--                         Manager / Secretary / extractor, or typed by hand;
--                         confirmed one by one; nothing is created silently.
--   viewing_appointments  EXTENDED, not duplicated: a viewing can now be
--                         anchored to a marketplace lead instead of a MatchHub
--                         submission. Exactly one anchor per row. The MatchHub
--                         policies are untouched — they key on submission_id,
--                         which is null for lead rows, so a supply agent can
--                         never see a lead-anchored viewing.
-- =============================================================================

create table public.agent_tasks (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid not null references auth.users(id) on delete cascade,
  title            text not null check (length(title) between 2 and 160),
  notes            text,
  due_at           timestamptz,
  kind             text not null default 'other' check (kind in ('call', 'message', 'viewing', 'document', 'follow_up', 'other')),
  source           text not null default 'manual' check (source in ('manual', 'ai_manager', 'secretary', 'task_extract')),
  lead_id          uuid references public.leads(id) on delete set null,
  listing_id       uuid references public.listings(id) on delete set null,
  request_id       uuid references public.property_requests(id) on delete set null,
  status           text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  done_at          timestamptz,
  reminder_sent_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index agent_tasks_agent_due on public.agent_tasks (agent_id, status, due_at);
create trigger agent_tasks_updated_at before update on public.agent_tasks
  for each row execute function public.set_updated_at();

alter table public.agent_tasks enable row level security;
create policy "tasks own read"   on public.agent_tasks for select to authenticated using (agent_id = auth.uid() or public.is_platform_admin());
create policy "tasks own insert" on public.agent_tasks for insert to authenticated with check (agent_id = auth.uid());
create policy "tasks own update" on public.agent_tasks for update to authenticated using (agent_id = auth.uid()) with check (agent_id = auth.uid());
create policy "tasks own delete" on public.agent_tasks for delete to authenticated using (agent_id = auth.uid());
revoke all on public.agent_tasks from anon;

-- ---------------------------------------------------------------------------
-- Viewings for marketplace leads
-- ---------------------------------------------------------------------------
alter table public.viewing_appointments
  alter column submission_id drop not null,
  add column if not exists lead_id uuid references public.leads(id) on delete cascade,
  add column if not exists listing_id uuid references public.listings(id) on delete set null,
  add column if not exists reminder_sent_at timestamptz;

alter table public.viewing_appointments
  add constraint viewing_appointments_one_anchor
  check ((submission_id is not null and lead_id is null) or (submission_id is null and lead_id is not null));

create index if not exists viewing_appointments_lead on public.viewing_appointments (lead_id) where lead_id is not null;

/** The agent assigned to the lead a viewing is anchored to. */
create or replace function public.owns_lead(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.leads l where l.id = p_lead_id and l.agent_id = auth.uid());
$$;
revoke execute on function public.owns_lead(uuid) from public, anon;

create policy "viewings lead owner read"   on public.viewing_appointments for select to authenticated
  using (lead_id is not null and public.owns_lead(lead_id));
create policy "viewings lead owner insert" on public.viewing_appointments for insert to authenticated
  with check (lead_id is not null and proposed_by = auth.uid() and public.owns_lead(lead_id));
create policy "viewings lead owner update" on public.viewing_appointments for update to authenticated
  using (lead_id is not null and public.owns_lead(lead_id)) with check (lead_id is not null and public.owns_lead(lead_id));

update public.ai_roles set status = 'live', route = '/tasks', updated_at = now()
 where key in ('task_planner', 'viewing_coordinator', 'reminder_assistant', 'followup_scheduler');

comment on table public.agent_tasks is 'Agent to-do list. AI proposes (source), the agent confirms; reminders by the cron (reminder_sent_at).';
