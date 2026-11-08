-- =============================================================================
-- 00051 — Tell the marketing agents when the listing changes under them
--
-- Found while building the agent landing pages (00050): listing LST-2026-910004
-- sits in `pending_review` while three agents hold live co-marketing
-- engagements on it. The public views filter it out correctly, so it silently
-- vanished from their pages and none of them was told.
--
-- Module design §6.4 names the two events that actually matter to a
-- collaborating agent, out of everything that could be signalled:
--
--   PRICE CHANGED       — quoting a stale price in front of a client is the
--                         fastest way for an agent to look unprofessional.
--   NO LONGER AVAILABLE — showing a client a dead property is worse than
--                         showing them nothing.
--
-- And it says to stop there, because notification fatigue is real. This
-- migration implements exactly those two and adds nothing else.
--
-- A TRIGGER rather than application code, deliberately: a listing can leave
-- `published` by an agent editing it, by an admin moderating it, by an
-- expiry sweep, or by a support script. Every one of those paths owes the
-- marketing agents a notice, and only the database sees all of them.
--
-- Engagements are NOT ended when a listing is un-published. An un-publish is
-- often temporary — back to moderation, then live again — and ending the
-- engagement would force every agent to find and pick the listing up again for
-- what may be an hour's absence. The listing simply stops appearing on their
-- page until it returns. Archiving is different and is handled as such.
-- =============================================================================

/**
 * Notify every agent marketing this listing.
 *
 * SECURITY DEFINER because it writes notifications for OTHER users, which no
 * RLS policy on `notifications` permits and should not. It reads and writes
 * nothing else, takes no user input, and is not callable in a way that lets a
 * caller choose the recipients — the recipients are derived from the engagement
 * rows for this listing.
 *
 * Payload carries public listing facts only (§40): the human id, the title and
 * the price. No commission terms, no floor price, no counterparty confidences.
 */
create or replace function public.notify_comarketing_agents(
  p_listing_id uuid,
  p_kind text,
  p_payload jsonb
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
begin
  insert into public.notifications (user_id, kind, payload, href)
  select e.marketing_agent_id, p_kind, p_payload, '/listings'
  from public.comarketing_engagements e
  join public.comarketing_offers o on o.id = e.offer_id
  where o.listing_id = p_listing_id
    and e.status = 'active';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.notify_comarketing_agents(uuid, text, jsonb) from public, anon, authenticated;

/**
 * The two §6.4 events, and only those.
 *
 * SECURITY INVOKER — the trigger runs as whoever made the change (00039's
 * lesson); the privileged part is the helper it calls, which is scoped to one
 * insert.
 */
create or replace function public.guard_listing_comarketing_notice()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'listing_id',        new.id,
    'human_readable_id', new.human_readable_id,
    'title',             new.title
  );

  -- No longer available: it was on the marketplace, now it is not.
  if old.status = 'published' and new.status <> 'published' then
    perform public.notify_comarketing_agents(
      new.id, 'comarketing_listing_unavailable', v_payload
    );

  -- Archived while published is the same message; the branch above already
  -- caught it if the status moved too.
  elsif old.archived_at is null and new.archived_at is not null then
    perform public.notify_comarketing_agents(
      new.id, 'comarketing_listing_unavailable', v_payload
    );

  -- Price changed on a live listing. Only while published: a price edited
  -- during a draft or a moderation round is not something anyone is quoting yet.
  elsif new.status = 'published' and old.status = 'published'
        and new.price is distinct from old.price then
    perform public.notify_comarketing_agents(
      new.id,
      'comarketing_price_changed',
      v_payload || jsonb_build_object(
        'old_price', old.price,
        'new_price', new.price,
        'currency',  new.currency
      )
    );
  end if;

  return new;
end;
$$;

create trigger trg_listing_comarketing_notice
  after update of status, price, archived_at on public.listings
  for each row execute function public.guard_listing_comarketing_notice();

comment on function public.guard_listing_comarketing_notice() is
  'Module design §6.4: price changed and no longer available. Deliberately no other co-marketing notifications — notification fatigue is real.';
