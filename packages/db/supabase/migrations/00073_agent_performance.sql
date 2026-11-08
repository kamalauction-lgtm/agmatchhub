-- =============================================================================
-- 00073 — The agent's own performance figures
--
-- The redesigned agent home needs a trend and a set of headline numbers. Both
-- are computed here, per agent, so the page is one round trip instead of a
-- dozen head-counts — and so the definitions live somewhere an operator can
-- read them.
--
-- WHAT IS DELIBERATELY ABSENT: VIEWS AND CTR
--   The design mock has "Total Views" and a click-through rate. Nothing in this
--   database records a listing view: there is no impression table, and the
--   public site holds no service-role key, so it cannot write one without the
--   enqueue path being built first. Inventing the number — deriving it from
--   leads, or seeding it — would put a figure on an agent's home screen that
--   describes nothing, and agents make decisions about price and photos from
--   exactly that figure.
--
--   So the cards show what is measured: listings, leads, first-response
--   performance and appointments. View tracking is a feature, not a metric to
--   be conjured, and belongs in its own piece of work.
--
-- RESPONSE RATE IS SLA-SHAPED, NOT "DID THEY EVER REPLY"
--   `leads.first_response_due` already carries the promise the platform makes.
--   The rate below is answered-before-due over all leads that had a due date,
--   which is the number an agent can actually act on. "Replied eventually" is
--   almost always 100% and tells nobody anything.
--
-- EVERYTHING IS auth.uid()-SCOPED
--   These are SECURITY DEFINER, so they must never take a user parameter. An
--   agent asking for somebody else's leads would be a confidentiality breach
--   (rule 2), and the safest way to make that impossible is to give the caller
--   no way to name a different user.
-- =============================================================================

create or replace function public.my_performance_series(p_days int default 30)
returns table (
  day date,
  leads int,
  listings_published int,
  responses int
)
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series(
      current_date - (greatest(p_days, 1) - 1),
      current_date,
      interval '1 day'
    )::date as day
  )
  select
    d.day,
    (select count(*)::int from public.leads l
      where l.agent_id = auth.uid() and l.created_at::date = d.day),
    (select count(*)::int from public.listings li
      where li.agent_id = auth.uid()
        and li.status = 'published' and li.moderation_state = 'approved'
        and li.published_at::date = d.day),
    (select count(*)::int from public.leads l
      where l.agent_id = auth.uid() and l.first_responded_at::date = d.day)
  from days d
  order by d.day;
$$;

/** Headline numbers for the agent home, current period against the previous. */
create or replace function public.my_performance_summary(p_days int default 30)
returns table (
  listings_active int,
  listings_published int,
  leads_total int,
  leads_new int,
  leads_unanswered int,
  leads_overdue int,
  response_rate int,
  appointments int,
  leads_previous int,
  listings_previous int
)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select
      current_date - (greatest(p_days, 1) - 1) as cur_from,
      current_date                              as cur_to,
      current_date - (greatest(p_days, 1) * 2 - 1) as prev_from,
      current_date - greatest(p_days, 1)        as prev_to
  ),
  mine as (
    select * from public.leads where agent_id = auth.uid()
  )
  select
    (select count(*)::int from public.listings
      where agent_id = auth.uid() and status in ('draft', 'pending_review', 'published')),
    (select count(*)::int from public.listings
      where agent_id = auth.uid() and status = 'published' and moderation_state = 'approved'),
    (select count(*)::int from mine),
    (select count(*)::int from mine where status = 'new'),
    (select count(*)::int from mine
      where first_responded_at is null
        and status not in ('closed_won', 'closed_lost', 'spam')),
    (select count(*)::int from mine
      where first_responded_at is null and first_response_due < now()),
    -- Answered before the promise expired, over everything that carried a
    -- promise. Null denominator reads as 100 rather than 0: an agent with no
    -- leads yet has not missed anything.
    (select case when count(*) filter (where first_response_due is not null) = 0 then 100
       else round(
         100.0 * count(*) filter (
           where first_responded_at is not null and first_responded_at <= first_response_due
         ) / count(*) filter (where first_response_due is not null)
       )::int
     end from mine),
    (select count(*)::int
       from public.viewing_appointments va
       join public.property_submissions ps on ps.id = va.submission_id
      where ps.supply_agent_id = auth.uid()
        and va.status in ('proposed', 'confirmed')),
    (select count(*)::int from mine, bounds b where created_at::date between b.prev_from and b.prev_to),
    (select count(*)::int from public.listings, bounds b
      where agent_id = auth.uid() and status = 'published' and moderation_state = 'approved'
        and published_at::date between b.prev_from and b.prev_to);
$$;

revoke all on function public.my_performance_series(int) from anon;
revoke all on function public.my_performance_summary(int) from anon;
grant execute on function public.my_performance_series(int) to authenticated;
grant execute on function public.my_performance_summary(int) to authenticated;
