-- =============================================================================
-- 00023 — Web-push subscriptions (§40 push readiness → live)
-- =============================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_push_subs_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push subs own" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "push subs own insert" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy "push subs own delete" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
-- sends read them via the service client
