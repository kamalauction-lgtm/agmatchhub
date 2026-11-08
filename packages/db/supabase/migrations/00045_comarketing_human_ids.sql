-- =============================================================================
-- 00045 — Nobody could create an offer or pick one up
--
-- 00040 declared `human_readable_id text not null unique` on both
-- comarketing_offers and comarketing_engagements, documented the intended shape
-- in a trailing comment (CMO-2026-000001, CME-2026-000001) — and never assigned
-- it. No default, no trigger. Its own seed script passes the value explicitly,
-- which is why the gap survived: every row that existed had been inserted by a
-- script that happened to supply one.
--
-- The first insert from the application failed with:
--   null value in column "human_readable_id" ... violates not-null constraint
--
-- A column default is the right fix rather than another trigger. It fires for
-- every writer — app, script, admin, future migration — and it cannot be
-- forgotten at a call site the way an explicit assignment can. next_human_id()
-- is the same allocator every other human-facing identifier in the schema uses
-- (COM, CON, LEAD, REQ).
--
-- These identifiers are display only, never security tokens — they are
-- sequential and guessable by design.
-- =============================================================================

alter table public.comarketing_offers
  alter column human_readable_id set default public.next_human_id('CMO');

alter table public.comarketing_engagements
  alter column human_readable_id set default public.next_human_id('CME');
