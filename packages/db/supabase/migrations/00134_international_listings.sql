-- =============================================================================
-- 00134 — International listings and the person in charge per country
-- (owner, 21 Nov 2026)
--
-- The owner markets overseas inventory from a partner catalogue and wants it
-- shown on the marketplace and the Hub as an "International" section, with a
-- named person in charge (PIC) per country. Decisions taken that day:
--
--   * shown on both the public marketplace and the Hub;
--   * an enquiry is a short form that records the lead and then opens WhatsApp
--     to the country's PIC (WhatsApp only — hard rule 11);
--   * photos are copied into our own storage;
--   * the catalogue is synced weekly by a worker;
--   * prices show IDR first, then the listing's own currency, then USD.
--
-- Why new tables and not `properties` / `listings`: those carry Indonesian
-- property-type and tenure vocabularies, need an owning agent profile, and feed
-- co-broke, commission and moderation. An overseas project launch is none of
-- that. Keeping it apart also means nothing here can reach MatchHub data.
--
--   1. country_contacts + country_contact_countries — the PIC list a super
--      admin maintains. A contact covers named countries, or every country
--      (`all_countries`). Country codes are ISO 3166-1 alpha-2 text, not an FK
--      to `countries`: that table drives agent sign-up and must not grow a row
--      for every country a project happens to be in.
--   2. international_listings + _private + _media. The private companion holds
--      what must never be public: the source URL, the raw source record and
--      any commission terms (hard rules 2 and 5).
--   3. fx_rates — units of each currency per one USD, with the date of the
--      rate, so a price can be shown in IDR and USD as an estimate.
--   4. international_enquiries — written only by submit_international_enquiry()
--      (validation, consent, rate limit), never directly.
--   5. Public read surface: three SECURITY DEFINER views. The marketplace has
--      no other window onto these tables (hard rule 1).
--
-- Writes need a GLOBAL platform.configure grant (00122). Reads of the base
-- tables are admin only. Contact changes are audited by trigger; sync and
-- publish actions are audited by the code that performs them.
-- No policy subqueries its own table (hard rule 4).
--
-- Rollback: drop the three views, the three functions, the trigger function,
-- and the seven tables (enquiries, media, private, listings, contact
-- countries, contacts, fx_rates).
-- =============================================================================

-- 1. Person in charge --------------------------------------------------------
create table public.country_contacts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 2 and 120),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),      -- E.164, WhatsApp
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_label text check (role_label is null or length(role_label) <= 80),
  all_countries boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.country_contact_countries (
  contact_id uuid not null references public.country_contacts(id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  primary key (contact_id, country_code)
);
create index idx_country_contact_countries_code on public.country_contact_countries (country_code);

create trigger trg_country_contacts_updated before update on public.country_contacts
  for each row execute function public.set_updated_at();

alter table public.country_contacts enable row level security;
alter table public.country_contact_countries enable row level security;

create policy "country contacts admin read" on public.country_contacts
  for select to authenticated using (public.is_platform_admin());
create policy "country contacts configure" on public.country_contacts
  for all to authenticated
  using (public.has_global_capability('platform.configure'))
  with check (public.has_global_capability('platform.configure'));

create policy "country contact countries admin read" on public.country_contact_countries
  for select to authenticated using (public.is_platform_admin());
create policy "country contact countries configure" on public.country_contact_countries
  for all to authenticated
  using (public.has_global_capability('platform.configure'))
  with check (public.has_global_capability('platform.configure'));

create or replace function public.audit_country_contact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.log_audit('country_contact.deleted', 'country_contact', old.id::text,
      jsonb_build_object('display_name', old.display_name, 'phone', old.phone), null, null);
    return old;
  end if;
  perform public.log_audit(
    case when tg_op = 'INSERT' then 'country_contact.created' else 'country_contact.updated' end,
    'country_contact', new.id::text,
    case when tg_op = 'UPDATE' then jsonb_build_object('display_name', old.display_name,
      'phone', old.phone, 'email', old.email, 'all_countries', old.all_countries, 'active', old.active) end,
    jsonb_build_object('display_name', new.display_name, 'phone', new.phone, 'email', new.email,
      'all_countries', new.all_countries, 'active', new.active), null);
  return new;
end;
$$;
create trigger trg_country_contacts_audit after insert or update or delete on public.country_contacts
  for each row execute function public.audit_country_contact();

/**
 * The PIC for a country: an active contact that names the country, else an
 * active contact that covers every country. Lowest sort_order wins.
 */
create or replace function public.country_contact_for(p_country text)
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.country_contacts c
  where c.active
    and (c.all_countries or exists (
      select 1 from public.country_contact_countries cc
      where cc.contact_id = c.id and cc.country_code = upper(p_country)))
  order by (not exists (
      select 1 from public.country_contact_countries cc
      where cc.contact_id = c.id and cc.country_code = upper(p_country))),
    c.sort_order, c.created_at
  limit 1;
$$;
revoke all on function public.country_contact_for(text) from public, anon;
grant execute on function public.country_contact_for(text) to authenticated, service_role;

-- 2. International listings ---------------------------------------------------
create table public.international_listings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,160}$'),
  source text not null check (source ~ '^[a-z][a-z0-9_]{1,30}$'),
  external_id text not null check (length(external_id) between 1 and 200),

  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  region text,
  city text,
  area text,

  title text not null check (length(trim(title)) between 3 and 200),
  summary text check (summary is null or length(summary) <= 400),
  description text check (description is null or length(description) <= 12000),
  listing_type text not null default 'sale' check (listing_type in ('sale', 'rent')),
  category text not null default 'residential'
    check (category in ('residential', 'commercial', 'industrial', 'land', 'other')),
  -- Free text from the source ("Serviced apartment", "Townhouse"); not the
  -- Indonesian property_type vocabulary.
  property_type_label text,
  developer_name text,
  tenure_label text,
  completion_label text,

  bedrooms_min int check (bedrooms_min >= 0),
  bedrooms_max int check (bedrooms_max >= 0),
  bathrooms_min int check (bathrooms_min >= 0),
  bathrooms_max int check (bathrooms_max >= 0),
  size_min numeric(12,2) check (size_min >= 0),
  size_max numeric(12,2) check (size_max >= 0),
  size_unit text not null default 'sqm' check (size_unit in ('sqm', 'sqft')),

  -- Money is numeric (hard rule 7). The listing's OWN currency; IDR and USD
  -- are derived for display from fx_rates.
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  price_min numeric(18,2) check (price_min >= 0),
  price_max numeric(18,2) check (price_max >= 0),

  highlights text[] not null default '{}',

  status text not null default 'draft' check (status in ('draft', 'published', 'withdrawn')),
  is_featured boolean not null default false,
  published_at timestamptz,
  withdrawn_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);
create index idx_intl_listings_public on public.international_listings (status, country_code, published_at desc);

/** Never public: where it came from, the raw record, commission terms. */
create table public.international_listing_private (
  listing_id uuid primary key references public.international_listings(id) on delete cascade,
  source_url text,
  commission_note text,
  internal_note text,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.international_listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.international_listings(id) on delete cascade,
  -- A path in our own storage. Photos are copied, never hot-linked.
  storage_bucket text not null,
  storage_path text not null,
  position int not null default 0,
  alt text,
  width int,
  height int,
  -- The source's own URL, so a re-sync does not copy the same photo twice.
  -- Not exposed by the public view.
  source_ref text,
  created_at timestamptz not null default now(),
  unique (listing_id, storage_path)
);
create index idx_intl_media_listing on public.international_listing_media (listing_id, position);

create trigger trg_intl_listings_updated before update on public.international_listings
  for each row execute function public.set_updated_at();
create trigger trg_intl_private_updated before update on public.international_listing_private
  for each row execute function public.set_updated_at();

alter table public.international_listings enable row level security;
alter table public.international_listing_private enable row level security;
alter table public.international_listing_media enable row level security;

create policy "intl listings admin read" on public.international_listings
  for select to authenticated using (public.is_platform_admin());
create policy "intl listings configure" on public.international_listings
  for all to authenticated
  using (public.has_global_capability('platform.configure'))
  with check (public.has_global_capability('platform.configure'));

-- The private companion is narrower still: only the configuring admin reads it.
create policy "intl private configure" on public.international_listing_private
  for all to authenticated
  using (public.has_global_capability('platform.configure'))
  with check (public.has_global_capability('platform.configure'));

create policy "intl media admin read" on public.international_listing_media
  for select to authenticated using (public.is_platform_admin());
create policy "intl media configure" on public.international_listing_media
  for all to authenticated
  using (public.has_global_capability('platform.configure'))
  with check (public.has_global_capability('platform.configure'));

-- 3. Exchange rates ------------------------------------------------------------
create table public.fx_rates (
  currency text primary key check (currency ~ '^[A-Z]{3}$'),
  -- How many units of this currency one US dollar buys. USD itself is 1.
  per_usd numeric(20,8) not null check (per_usd > 0),
  as_of date not null,
  source text not null,
  updated_at timestamptz not null default now()
);
create trigger trg_fx_rates_updated before update on public.fx_rates
  for each row execute function public.set_updated_at();
alter table public.fx_rates enable row level security;
create policy "fx rates admin read" on public.fx_rates
  for select to authenticated using (public.is_platform_admin());
create policy "fx rates configure" on public.fx_rates
  for all to authenticated
  using (public.has_global_capability('platform.configure'))
  with check (public.has_global_capability('platform.configure'));

-- 4. Enquiries -----------------------------------------------------------------
create table public.international_enquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.international_listings(id) on delete cascade,
  contact_id uuid references public.country_contacts(id) on delete set null,
  full_name text not null,
  phone text not null,
  email text,
  message text,
  locale text not null,
  -- The exact consent text the person accepted (hard rule 8).
  consent_version_id uuid not null references public.declaration_versions(id),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  handled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_intl_enquiries_listing on public.international_enquiries (listing_id, created_at desc);
create trigger trg_intl_enquiries_updated before update on public.international_enquiries
  for each row execute function public.set_updated_at();
alter table public.international_enquiries enable row level security;
-- No insert policy: the function below is the only way in.
create policy "intl enquiries admin read" on public.international_enquiries
  for select to authenticated using (public.has_global_capability('platform.configure'));
create policy "intl enquiries admin update" on public.international_enquiries
  for update to authenticated
  using (public.has_global_capability('platform.configure'))
  with check (public.has_global_capability('platform.configure'));

/**
 * The public's single write path for an international enquiry. Returns the
 * PIC's WhatsApp number so the page can open the chat — the number is public
 * on the listing anyway, and only after a valid, consented enquiry is stored.
 */
create or replace function public.submit_international_enquiry(
  p_slug text,
  p_full_name text,
  p_phone text,                       -- already normalised to E.164 by the app
  p_email text,
  p_message text,
  p_locale text,
  p_consent_version_id uuid,
  p_ip_hash text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_listing record;
  v_contact record;
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_locale text := case when p_locale in ('id', 'en', 'ms') then p_locale else 'id' end;
  v_recent int;
  v_id uuid;
begin
  if v_name is null or length(v_name) < 2 or length(v_name) > 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  if v_message is not null and length(v_message) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'message_too_long');
  end if;

  select l.id, l.country_code into v_listing
  from public.international_listings l
  where l.slug = p_slug and l.status = 'published';
  if v_listing.id is null then
    return jsonb_build_object('ok', false, 'error', 'listing_not_found');
  end if;

  if not exists (
    select 1 from public.declaration_versions dv
    join public.declarations d on d.id = dv.declaration_id
    where dv.id = p_consent_version_id and d.key = 'buyer_inquiry' and dv.active) then
    return jsonb_build_object('ok', false, 'error', 'consent_required');
  end if;

  -- Same sliding-hour limits and the same counters as submit_public_inquiry.
  select count(*) into v_recent from public.inquiry_rate_limits
   where bucket = 'phone:' || v_phone and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_ip_hash is not null then
    select count(*) into v_recent from public.inquiry_rate_limits
     where bucket = 'ip:' || p_ip_hash and created_at > now() - interval '1 hour';
    if v_recent >= 20 then
      return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
  end if;

  select c.id, c.phone into v_contact from public.country_contacts c
   where c.id = public.country_contact_for(v_listing.country_code);

  insert into public.international_enquiries
    (listing_id, contact_id, full_name, phone, email, message, locale, consent_version_id)
  values (v_listing.id, v_contact.id, v_name, v_phone, v_email, v_message, v_locale, p_consent_version_id)
  returning id into v_id;

  delete from public.inquiry_rate_limits where created_at < now() - interval '2 hours';
  insert into public.inquiry_rate_limits (bucket) values ('phone:' || v_phone);
  if p_ip_hash is not null then
    insert into public.inquiry_rate_limits (bucket) values ('ip:' || p_ip_hash);
  end if;

  return jsonb_build_object('ok', true, 'enquiry', v_id, 'whatsapp', v_contact.phone);
end;
$$;
revoke all on function public.submit_international_enquiry(text, text, text, text, text, text, uuid, text) from public;
grant execute on function public.submit_international_enquiry(text, text, text, text, text, text, uuid, text)
  to anon, authenticated, service_role;

-- 5. Public read surface ---------------------------------------------------------
-- Everything a card or a project page needs, and nothing else. Deliberately
-- absent: source, external id, source URL, raw record, commission and notes.
create view public.public_international_listings with (security_invoker = false) as
select
  l.id, l.slug, l.country_code, l.region, l.city, l.area,
  l.title, l.summary, l.description, l.listing_type, l.category,
  l.property_type_label, l.developer_name, l.tenure_label, l.completion_label,
  l.bedrooms_min, l.bedrooms_max, l.bathrooms_min, l.bathrooms_max,
  l.size_min, l.size_max, l.size_unit,
  l.currency, l.price_min, l.price_max,
  l.highlights, l.is_featured, l.published_at,
  c.display_name as contact_name,
  c.role_label as contact_role,
  c.phone as contact_whatsapp,
  (select m.storage_bucket || '/' || m.storage_path
     from public.international_listing_media m
    where m.listing_id = l.id order by m.position, m.created_at limit 1) as cover_path,
  (select count(*) from public.international_listing_media m where m.listing_id = l.id) as photo_count
from public.international_listings l
-- The PIC is resolved inline, with the same rule as country_contact_for(): a
-- view runs its functions as the CALLER, and anon must not be able to call that
-- function directly.
left join lateral (
  select cc.display_name, cc.role_label, cc.phone
  from public.country_contacts cc
  where cc.active
    and (cc.all_countries or exists (
      select 1 from public.country_contact_countries x
      where x.contact_id = cc.id and x.country_code = l.country_code))
  order by (not exists (
      select 1 from public.country_contact_countries x
      where x.contact_id = cc.id and x.country_code = l.country_code)),
    cc.sort_order, cc.created_at
  limit 1
) c on true
where l.status = 'published';

create view public.public_international_media with (security_invoker = false) as
select m.id, m.listing_id, m.storage_bucket, m.storage_path, m.position, m.alt, m.width, m.height
from public.international_listing_media m
join public.international_listings l on l.id = m.listing_id
where l.status = 'published';

create view public.public_fx_rates with (security_invoker = false) as
select currency, per_usd, as_of from public.fx_rates;

revoke all on public.public_international_listings from anon, authenticated;
revoke all on public.public_international_media from anon, authenticated;
revoke all on public.public_fx_rates from anon, authenticated;
grant select on public.public_international_listings to anon, authenticated;
grant select on public.public_international_media to anon, authenticated;
grant select on public.public_fx_rates to anon, authenticated;

comment on view public.public_international_listings is
  'Public read surface for international listings. SECURITY DEFINER by design — the WHERE clause is the visibility rule. Adding a column here publishes it to the anonymous internet; source, commission and notes live in international_listing_private.';
comment on function public.submit_international_enquiry(text, text, text, text, text, text, uuid, text) is
  'The public''s single write path for an international enquiry: validation, consent, rate limiting, PIC resolution.';
