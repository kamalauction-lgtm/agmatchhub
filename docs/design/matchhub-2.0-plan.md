# MatchHub 2.0 — implementation plan (for owner approval)

Status: **proposal.** No application code has been changed for MatchHub. Read-only
review done on branch `ui/futuristic-pilot` at `2cf95ba`, staging version `5cacc007`.
Storyboard: `docs/design/storyboards/matchhub.html`. Current screenshots:
`.playwright-mcp/mh-current-*.png` (pool, requirements, submissions, wanted; 1440 and 375).

## 1. What exists (inventory)

| Area | Route | Lines | Notes |
|---|---|---|---|
| Co-marketing pool | `(agent)/collab/pool` | 465 | Reads `pool_offer_cards` only (00099–00102). GET filter form. Pickup via `comarketing_engagements` insert guarded by `guard_comarketing_pickup()`. |
| Partners abroad | `(agent)/collab/partners` | 67 | Cross-border partner finder (role `partner_finder`). |
| Client requirements | `(agent)/requests`, `/new`, `/[id]`, `/[id]/edit`, `/[id]/presentation`, `/[id]/s/[sid]` | 84–309 | 23-state status machine. Admin approval, protected link, submissions review, client presentation. |
| My submissions | `(agent)/submissions`, `/[sid]` | 80, 66 | Supply agent's own submissions, table layout. |
| Supply-agent link | `r/[token]`, `r/[token]/submit` | 204, 354 | Password-protected, token-based. |
| Client presentation | `p/[token]`, `p/[token]/compare` | 356, 119 | Uses `lib/projections/client-safe.ts` only. |
| Public Wanted board | `wanted` | — | Anonymised teaser projection; `public_listing = true`; open statuses only. |

Shared components in use: `AgentShell`, `Panel`, and (since the pilot) `CommandHeader`,
`Badge`, `Card`, `Button`, `EmptyState`. Collab components: `collab-panels`,
`commission-panel`, `disclosure-panel`, `offer-summary-button`.

## 2. Security considerations (SENTINEL view)

Rules that the redesign must leave untouched, with where they are enforced:

1. **Pool reads come only from `pool_offer_cards`.** The view lists card columns
   only; moderation, ownership and `*_private` data are absent by construction. The
   redesign draws every card field from this projection and adds none. **No photo**:
   the projection has no media column. Adding one is a migration (view change),
   staging first, separately approved — out of this scope.
2. **Pickup path unchanged.** The "Market this listing" form keeps inserting into
   `comarketing_engagements`; `guard_comarketing_pickup()` and
   `pool_offer_for_pickup()` decide. The UI only restyles the button.
3. **Offer table not read by browsers.** 00102 dropped the pool read policy. The
   page must keep selecting from the view, never from `comarketing_offers`.
4. **Client presentation stays on `client-safe.ts`.** `p/[token]` is in scope for
   styling only; no new field may be added to the projection. Supply-agent identity,
   commission and minimum price never appear there, in HTML, headers or filenames.
5. **Wanted board stays a teaser.** `client_profile_anonymised` at most; no client
   identity, no internal notes, no requesting-agent contact beyond what
   `isPartnerIdentityPublic()` already allows.
6. **Staging label from configuration, not inference.** An `EnvironmentBadge`
   reads a build-time public value (for example `NEXT_PUBLIC_APP_URL` matching the
   staging host, or a new `NEXT_PUBLIC_ENVIRONMENT=staging` set only in
   `.env.staging.production`). It never guesses from data, so it cannot mislabel a
   genuine offer, and it never renders on production because production's env lacks
   the value. The deploy verifier already refuses a bundle wired to the wrong project.
7. **No invented intelligence.** No match score, deal probability, "hot" marker or
   AI label is drawn. The stage strip is a grouping of the existing status enum.
8. **Counts in the band** come from the rows the page already loads (pool size,
   own engagements, request counts by status). No new queries that widen access.

## 3. Regression considerations (ATLAS view)

- The pool filter is a GET form with six params; `ChipFilterBar` must submit the same
  param names so bookmarks and the existing RLS tests' assumptions hold.
- `requests/[id]` has six panels and two server actions (link, presentation); styling
  only, no action signature changes.
- `submissions` and `requests` tables become cards; sort order and columns preserved.
- `wanted` is public and unauthenticated; it must not import `AgentShell`. The public
  variant of `CommandHeader` is the same component with no shell.
- Existing defect found: Wanted hero renders the wordmark navy-on-black (ghost text
  above the headline). Fixed by the band; noted so it is not mistaken for a design
  choice.
- Tests that must still pass unchanged: `rls/comarketing-pool.test.ts`, the MatchHub
  RLS suites, `unit/i18n-parity.test.ts`, `unit/i18n-keys-exist.test.ts`.

## 4. Exact implementation scope (FORGE view)

**In scope (styling and layout, staging only):**
- `(agent)/collab/pool/page.tsx`: CommandHeader with StatCluster; ChipFilterBar over
  the existing form; `OfferCard` component; EnvironmentBadge; EmptyState.
- `(agent)/requests/page.tsx` and `/[id]/page.tsx`: CommandHeader; tabs by status
  group; StageStrip; Badge for exact status; cards instead of table on the list.
- `(agent)/submissions/page.tsx` and `/[sid]`: CommandHeader; cards; EmptyState
  pointing to the Wanted board.
- `wanted/page.tsx`: public CommandHeader variant; chip filters; card rhythm.
- New shared components: `EnvironmentBadge`, `StatCluster`, `ChipFilterBar`,
  `OfferCard`, `StageStrip` under `src/components/collab/` or `src/components/ui/`.
- New strings (EN/BM/ID): stage-group labels (6), band captions (3 pages), environment
  label, "Open Wanted board". ms/id drafted, flagged for native review.
- One new public env key in `.env.staging.production` only (`NEXT_PUBLIC_ENVIRONMENT`).

**Out of scope (needs separate approval):**
- Any migration or view change (photos on pool cards, new projection fields).
- `r/[token]` and `p/[token]` beyond colour and spacing; no field changes.
- Any change to pickup, approval, submission or presentation logic.
- Production deployment, merge, push.

## 5. Sequence and gates

1. Approval of this storyboard and scope.
2. Build shared components + pool page → typecheck, lint, unit tests, build.
3. Requirements list and detail → same gates.
4. Submissions + Wanted → same gates.
5. Commit on `ui/futuristic-pilot`; request **staging deploy approval**.
6. Playwright on staging: 375/768/1440, light and dark, EN/BM/ID; pickup and stop
   buttons exercised on the staging test offer (then ended, as before); RLS suite
   `npm test` against staging.
7. Acceptance report with before/after screenshots; GO/NO-GO for staging acceptance.

## 6. Open decisions for the owner

- Approve the storyboard direction (navy band, chip filters, typographic price tile,
  stage strip, environment label)?
- Approve `NEXT_PUBLIC_ENVIRONMENT=staging` as the environment-label mechanism?
- Confirm photos on pool cards are deferred to a separate, migration-backed phase.
