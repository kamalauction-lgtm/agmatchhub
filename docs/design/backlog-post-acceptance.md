# Backlog after staging acceptance of Dashboard 2.0, AI Workforce 2.0 and MatchHub 2.0

Status: **backlog only. Nothing here is started.** Each item needs its own owner
approval before implementation. Recorded 9 Nov 2026.

> Added 9 Nov 2026 from the pilot rehearsal (`docs/release/pilot-rehearsal-2026-11-09.md`):
> Malaysian areas and MYR pricing in the listing wizard (Indonesia/IDR only today — owner
> decided MY pilot agents list Indonesian property); UI locale should follow
> `profiles.preferred_language` on first sign-in; Luna draft language should follow the
> agent's language; stale copy on `/listings` ("The co-marketing pool opens soon").

## 1. AI content batch 2 (remaining 30 roles)

Method, as approved for batch 1: verify each role from code, migrations and tests;
write detail copy (what, needs, gives, limits, how it works) in EN/BM/ID; classify as
rule-based · tested, model-powered · routed, or unverified; present an approval table;
store as `aiWorkforce.detail.<role>` translation keys (option A, no database change).

Suggested order (by agent-facing frequency):
1. caption_writer, brochure_writer, social_planner, poster_designer, video_scriptwriter (Studio)
2. duplicate_detector, silence_radar, email_composer, followup_scheduler, reminder_assistant, viewing_coordinator, alternative_finder (Leads, Tasks)
3. quality_auditor, comparables_analyst, photo_checker, refresh_planner, translation_assistant, owner_report_writer, listing_researcher, owner_outreach (Listings)
4. buyer_profiler, offer_summariser, closing_checklist, objection_coach, team_coach, onboarding_guide, performance_reviewer, document_summariser, crossborder_researcher, partner_finder (MatchHub, Training, International)

Precondition for any "tested with AI" wording: a provider key on staging (owner-set
Worker secret), one observed run per feature with its `ai_jobs` row, and a screenshot.

## 2. Four MatchHub 2.0 views not yet seen with real data

| View | Why unverified | What is needed |
|---|---|---|
| Requirement cards and stage strip on `/requests` | staging account owns no requirements | A requirement created by the staging account (or a seeded requesting agent), then screenshots at 375/768/1440 in light and dark |
| Requirement detail band on `/requests/[id]` | same | same |
| Submission cards on `/submissions` | staging account has no submissions | A submission by the staging account via an `r/[token]` link |
| Submission detail band on `/submissions/[sid]` | same | same |

Also outstanding from the storyboard: the per-tab empty message ("Nothing in this
group.") renders only when rows exist outside the selected tab.

## 3. Photos on pool cards — projection change and security review

Today `pool_offer_cards` (00099, recreated in 00101) carries no media column, so the
card shows a typographic price tile. Adding a cover image requires:

1. A migration that recreates the view with one column: the listing's cover image URL
   (from `listing_media`, cover only, published listings only). Staging first, then
   production, each separately approved.
2. A SENTINEL review confirming the column adds no private data: no owner, moderation
   or `*_private` fields; the URL must not encode agent identity.
3. A new RLS test asserting the view still rejects moderation and ownership columns
   and that the media URL belongs to the offer's listing.
4. `OfferCard` reads the new column when present and keeps the tile when absent.

Until then the card design stands as accepted.

## 4. Smaller items carried forward

- Pool filters as chip links instead of selects (storyboard deviation, accepted).
- Dark-mode contrast of the top-bar language buttons (shared header, pre-existing).
- Cosmetic white scrollbar on the AI Workforce chip row in dark mode.
- Native BM/ID review (see `localisation-review-batch-1.md`).
