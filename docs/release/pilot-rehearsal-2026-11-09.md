# Pilot onboarding rehearsal — staging, 9 Nov 2026

Account: rehearsal slot MY A (verified agent, country MY, language BM) on
`hub-staging.propertiguru.id` (Supabase `aylzekkeurjsudazzxjv`). Walked the Day-2 script
from `pilot-onboarding-checklist.md`. Production untouched.

## What worked

| Step | Result |
|---|---|
| Sign in | OK; sidebar shows display name, "Property agent", "Verified" |
| Profile (`/profile`) | WhatsApp + biography saved, "Profile saved." confirmation |
| New listing (`/listings/new`) | 7-step wizard completed; `LST-2026-000100` created, status **In review** |
| Luna "Help me write it" | Rule-based draft produced; honest label "Drafted without AI — no AI provider is connected yet"; "Check my writing" returned "looks solid" |
| Dashboard | KPIs updated (1 of 300 slots, pipeline 1 in review); Astra brief listed "1 listing is awaiting moderation", labelled Rule-based, 500/500 tasks |
| Co-marketing pool (`/collab/pool`) | 2 staging offers visible; **pickup of LST-2026-900001 succeeded** ("Added to your inventory", counter 1 you market, "Stop marketing" shown) |
| Requests (`/requests`) | Empty state + "New requirement" CTA render |
| Tasks (`/tasks`) | Empty state, Kael "Suggest tasks" button and manual add form render |
| Language switch BM | All pool strings rendered in BM; no missing-key placeholders seen |

## Findings (for the owner before Day 1)

1. **Malaysia listings cannot be created.** The Area selector lists Indonesian provinces and
   cities only, and the price field is **IDR only**. A MY agent can only list Indonesian
   property in IDR. Decide before Day 1: (a) MY agents rehearse with Indonesian listings and
   are told so, (b) MY agents pilot MatchHub/pool only, or (c) treat MY listings as a
   post-pilot feature. This is a scope decision, not a bug fix.
   **Owner decision 9 Nov 2026: option (a).** MY agents list Indonesian property in IDR for
   the pilot and are told so in the invitation; Malaysian areas/MYR go to the post-pilot
   backlog.
2. **UI language does not follow the profile.** Account language is BM but the hub opened
   in EN; the header EN/BM/ID buttons work. Tell agents to click their language once.
3. **Luna drafts in Indonesian** regardless of the agent's language (follows the listing's
   market). Expected while only IDR/Indonesia listings exist; note for reviewers.
4. **Listings need moderator approval** before "publish". The owner (or an admin) must be in
   `/admin` during the Day-2 session, or the agent's listing stays "In review".
5. **Fresh accounts have no leads**, so the Zayn score / Mira draft demo cannot run until a
   buyer inquires. Day-2 option: the owner submits one inquiry from the marketplace on the
   agent's live listing, or the leads walkthrough moves to Day 3.
6. **Stale copy** on `/listings`: "You have not borrowed any listings yet. The co-marketing
   pool opens soon." — the pool is live. Backlog, low priority.

## Not covered in this rehearsal

Photo upload, listing import (`/listings/import`), Kael suggestion result, MatchHub
requirement creation and submission, name card, Content Studio, mobile viewport.

## Data left on staging

Listing `LST-2026-000100` (in review) and one pool engagement for the MY A rehearsal
account. Both are ordinary staging test data.
