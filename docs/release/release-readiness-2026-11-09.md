# PropertiGuru 2.0 — release readiness, 9 November 2026

Read-only review. No code, database, configuration or deployment was changed for
this report. Branch `ui/futuristic-pilot` is unchanged at `30a0589`.

## 1. Accepted UI modules (staging scope)

| Module | Commit | Staging version | Accepted |
|---|---|---|---|
| Dashboard 2.0 | a755b8b | 1cb179d0 | yes |
| AI Workforce 2.0 | 2cf95ba | 5cacc007 | yes |
| MatchHub 2.0 | 30a0589 | d13a68f9 | yes |
| Pilot styling: My Listings, Leads, Tasks, Content Studio | 5a9a874 … 38529c2 | (superseded by later deploys) | reviewed |

Current staging build: `d13a68f9` from `30a0589`, target verified as `aylzekkeurjsudazzxjv`.

## 2. Security clearance

| Item | Status |
|---|---|
| Database password rotation | **Pending owner.** Checklist: `docs/security/rotation-dependency-checklist.md`. |
| Owner login password rotation | **Pending owner.** |
| Post-rotation read-only status check | Not yet run; runs after owner confirmation. |
| Encrypted backup storage | **Not confirmed.** Plaintext export still presumed on the laptop. |
| Secrets in Git | Scan of every added line from `origin/main` to `30a0589`: no connection strings, keys, tokens or PEM blocks. |
| Database, RLS, migrations | No file under `packages/db/supabase` changed on the branch. |
| Production env | `apps/hub/.env.production` unchanged. Only `NEXT_PUBLIC_ENVIRONMENT` added to `.env.staging.production`. |
| Confidentiality projections | Pool still reads `pool_offer_cards` only; client view still on `client-safe.ts`; Wanted still the anonymised teaser. |
| Provider keys on staging | Missing (GEMINI, ANTHROPIC). All AI roles run rules-only; no model output verified. |

## 3. BM/ID review

73 keys added, 0 existing keys changed. Side-by-side table with flags:
`docs/design/localisation-review-batch-1.md`. **Native-speaker sign-off: open.** No copy
has been altered pending that review.

## 4. Remaining functional test gaps

- Requirement cards, stage strip and requirement detail band (no requirements on the staging account).
- Submission cards and submission detail band (no submissions on the staging account).
- Model-powered AI paths (no provider key on staging).
- Full `npm test` (staging RLS suite) has not been re-run since the MatchHub UI commits; the UI changes touch no policy, but the run is cheap and should precede any merge.
- Marketplace `apps/www` was not part of this work and not retested.

## 5. Git release readiness

| Check | Result |
|---|---|
| Ancestry | `main` (ee9c6d5) is an ancestor of `ui/futuristic-pilot`; merge-base ee9c6d5 |
| Branch commits ahead of `main` | **18** (earlier reports said 22; that figure was wrong) |
| `main` ahead of `origin/main` (e9797ea) | 9, all local |
| `origin/main` ahead of `main` | 0 — a fast-forward push is possible |
| Files changed on branch | 34 (+2793 / −540): hub pages, 6 components, 1 lib, 3 message files, 2 unit tests, 6 docs, 1 staging env file |
| Known blemish | 8ad94a8 broke the build (misplaced JSX comment); fixed in a04f8f6. Consider squashing on merge. |
| Untracked, left alone, not part of the release | `docs/platform-state-handover.md` (modified), `docs/session-handover-2026-11-08.md`, `apps/hub/src/lib/ai/workforce-status*.ts`, `packages/db/tests/unit/workforce-status.test.ts`, `docs/security/` (runbook and checklist), `docs/design/backlog-post-acceptance.md`, `docs/design/localisation-review-batch-1.md`, this report |

### Proposed push and pull-request sequence (nothing executed)

1. Owner confirms credential rotation (A) and encrypted backup (C).
2. Run `npm test` against staging (read-only, full RLS suite) and record PASS.
3. Push `main` first: `git push origin main` (fast-forward, 9 commits: the pool security fix and pilot foundations).
4. Push the feature branch: `git push -u origin ui/futuristic-pilot`.
5. Open a pull request `ui/futuristic-pilot → main`, title "PropertiGuru 2.0 UI pilot: Dashboard, AI Workforce, MatchHub (staging-accepted)", body listing the three accepted commits, the staging versions, the test results, the localisation table and the four unverified views. Request review; do not enable auto-merge.
6. After review: squash-merge (removes the broken interim commit from history) with a separate owner approval.
7. Production deploy of the hub only after a further explicit approval, with `.env.local` moved aside and the build-target verifier run, as before. The marketplace is a separate deploy.

## 6. Remaining blockers before production

1. Credential rotation not yet performed.
2. Encrypted backup not confirmed.
3. Native BM/ID review not done.
4. Full staging RLS suite not re-run after the UI commits.
5. Four MatchHub views unseen with real data.
6. Pull request not yet opened or reviewed.

## 7. Recommendation

- **Staging:** GO. The three modules are accepted and verified on staging.
- **Push and pull request:** GO once item 4 (RLS suite) passes, with owner approval.
- **Production:** **NO-GO** until blockers 1, 2 and 6 are cleared; 3 and 5 should be
  closed or consciously accepted by the owner before the first production release of
  this UI.
