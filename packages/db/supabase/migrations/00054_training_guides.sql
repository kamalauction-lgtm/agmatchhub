-- =============================================================================
-- 00054 — Training & guides: the last dashboard module
--
-- DB-driven like every other content surface (legal content set the
-- precedent): guides are rows an admin edits, never markdown files in the
-- repo — content changes must not require a deploy, and every guide needs
-- three locales.
--
-- Shape honours the locked country+language rule: a guide has ONE
-- language-neutral identity (training_guides) with per-locale translations,
-- and progress is keyed to the guide id — an agent who reads a guide in
-- Indonesian and revisits in English has completed it once, not twice.
-- =============================================================================

create table public.training_guides (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in ('platform', 'sales', 'marketing')),
  position     int not null default 0,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_training_guides_list on public.training_guides (is_published, category, position);

create trigger trg_training_guides_updated before update on public.training_guides
  for each row execute function public.set_updated_at();

create table public.training_guide_translations (
  guide_id   uuid not null references public.training_guides(id) on delete cascade,
  locale     text not null check (locale in ('en', 'ms', 'id')),
  title      text not null,
  body       text not null,
  updated_at timestamptz not null default now(),
  primary key (guide_id, locale)
);

create trigger trg_training_translations_updated before update on public.training_guide_translations
  for each row execute function public.set_updated_at();

create table public.training_progress (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  guide_id     uuid not null references public.training_guides(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, guide_id)
);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.training_guides enable row level security;
alter table public.training_guide_translations enable row level security;
alter table public.training_progress enable row level security;

-- Agents read published guides; admins read and manage everything.
create policy "training guides read" on public.training_guides
  for select to authenticated
  using (is_published or public.is_platform_admin());
create policy "training guides admin write" on public.training_guides
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Translations follow their guide's gate. Subquerying ANOTHER table in a
-- policy is fine — rule 4 forbids a table subquerying itself.
create policy "training translations read" on public.training_guide_translations
  for select to authenticated
  using (
    exists (
      select 1 from public.training_guides g
      where g.id = guide_id and (g.is_published or public.is_platform_admin())
    )
  );
create policy "training translations admin write" on public.training_guide_translations
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Progress is the agent's own. Delete allowed — "mark as unread" is harmless
-- and an agent owns their own reading state.
create policy "training progress own read" on public.training_progress
  for select to authenticated using (user_id = auth.uid());
create policy "training progress own insert" on public.training_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy "training progress own delete" on public.training_progress
  for delete to authenticated using (user_id = auth.uid());
