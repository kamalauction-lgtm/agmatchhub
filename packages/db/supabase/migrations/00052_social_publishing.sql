-- =============================================================================
-- 00052 — Content Studio: connected social accounts + scheduled publishing
--
-- Module design (docs/module-content-studio.md) shipped Phase 1 with drafts the
-- agent copies out by hand. This adds the queue behind "post it for me":
--
--   social_accounts        what the agent connected (FB Page / IG Business) —
--                          metadata only, safe for the agent to read
--   social_account_secrets the page access token. RLS enabled with NO
--                          policies: only the service role can touch it
--                          (rule 5 — confidential columns live in a companion
--                          table; a token in the main table would ride along
--                          on every select *)
--   scheduled_posts        the queue. The agent schedules and cancels their
--                          own rows; the publisher (service role, cron) claims
--                          due rows and records the outcome
--
-- The design rule survives intact: nothing here posts by itself. A row only
-- exists because the agent pressed "schedule" on a caption they edited, and
-- the publisher sends exactly that caption, unmodified.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Connected accounts
-- -----------------------------------------------------------------------------

create table public.social_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  platform      text not null check (platform in ('facebook_page', 'instagram_business')),
  external_id   text not null,          -- FB page id / IG business user id
  display_name  text,
  username      text,
  connected_at  timestamptz not null default now(),
  expires_at    timestamptz,            -- long-lived token horizon (~60 days)
  status        text not null default 'active'
                check (status in ('active', 'expired', 'revoked')),
  unique (user_id, platform, external_id)
);

comment on table public.social_accounts is
  'Publish destinations connected via Meta OAuth. Tokens live in social_account_secrets, never here.';

create index idx_social_accounts_user on public.social_accounts (user_id, status);

alter table public.social_accounts enable row level security;

create policy "social accounts own read" on public.social_accounts
  for select to authenticated using (user_id = auth.uid());
create policy "social accounts own disconnect" on public.social_accounts
  for delete to authenticated using (user_id = auth.uid());
-- inserts/updates via the service role only (the OAuth callback), after it has
-- verified the session user — an agent must not be able to forge an account row
-- pointing at someone else's page id.

-- -----------------------------------------------------------------------------
-- Tokens — service role only
-- -----------------------------------------------------------------------------

create table public.social_account_secrets (
  account_id   uuid primary key references public.social_accounts(id) on delete cascade,
  access_token text not null,
  updated_at   timestamptz not null default now()
);

comment on table public.social_account_secrets is
  'Page access tokens. RLS enabled with no policies: service role only. Never joined into any view.';

alter table public.social_account_secrets enable row level security;
-- Deliberately no policies. anon/authenticated can see nothing; the publisher
-- and the OAuth callback use the service client.

-- -----------------------------------------------------------------------------
-- The queue
-- -----------------------------------------------------------------------------

create table public.scheduled_posts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  account_id       uuid not null references public.social_accounts(id) on delete cascade,
  listing_id       uuid references public.listings(id) on delete set null,
  platform         text not null check (platform in ('facebook_page', 'instagram_business')),
  caption          text not null,
  image_url        text,               -- public storage URL; REQUIRED for Instagram
  scheduled_at     timestamptz not null,
  status           text not null default 'scheduled'
                   check (status in ('scheduled', 'publishing', 'published', 'failed', 'canceled')),
  attempt_count    int not null default 0,
  last_error       text,
  external_post_id text,               -- what Meta returned on success
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.scheduled_posts is
  'Agent-scheduled social posts. The caption is exactly what the agent approved in the studio; the publisher never rewrites it.';

create index idx_scheduled_posts_user on public.scheduled_posts (user_id, status, scheduled_at desc);
-- The publisher''s due scan: cheap even as the table grows, because the partial
-- index holds only rows still waiting.
create index idx_scheduled_posts_due on public.scheduled_posts (scheduled_at)
  where status = 'scheduled';

alter table public.scheduled_posts enable row level security;

create policy "scheduled posts own read" on public.scheduled_posts
  for select to authenticated using (user_id = auth.uid());

-- Insert: own rows only, and only against an account the agent actually owns.
-- Subquerying social_accounts here is fine — rule 4 forbids a table subquerying
-- ITSELF in its own policy, not referencing another table.
create policy "scheduled posts own insert" on public.scheduled_posts
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.social_accounts a
      where a.id = account_id and a.user_id = auth.uid()
    )
  );

-- Update: the agent can only touch rows that have not been claimed yet. The
-- server action limits this to cancellation; the status check list here stops
-- an agent from marking their own post 'published'.
create policy "scheduled posts own cancel" on public.scheduled_posts
  for update to authenticated
  using (user_id = auth.uid() and status = 'scheduled')
  with check (user_id = auth.uid() and status in ('scheduled', 'canceled'));

/** updated_at maintenance, SECURITY INVOKER (00039's lesson for guards). */
create or replace function public.guard_scheduled_post_touch()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_scheduled_post_touch
  before update on public.scheduled_posts
  for each row execute function public.guard_scheduled_post_touch();
