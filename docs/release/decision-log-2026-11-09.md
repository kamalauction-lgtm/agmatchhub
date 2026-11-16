# Decision log — 9 November 2026 (PropertiGuru 2.0 release)

Recorded by the assistant from this session's tool results. Approvals were given by
the owner in chat; no credential values appear here.

## Production state after today

| Component | Version / ref | Note |
|---|---|---|
| `main` | `7479261` | squash of PR #2 (`ui/futuristic-pilot` at `4d04e8c`, 18 commits) |
| Hub Worker `ag-matchhub` | `5620b3ff-7e2b-4fec-a929-83de0aba9d08` (08:51 UTC) | previous `43964672` kept for rollback |
| Marketplace Worker `propertiguru-www` | `12825369-9a85-441a-b926-a608b5de2af0` | build-time fallback did not fire (0 log lines) |
| Production database | 102 migrations applied, 0 pending | no migration in this release |
| Staging hub | `d13a68f9` from `30a0589` | |

## Timeline

1. 00099–00102 pool security fix applied to staging, then production (owner ran the
   production migration); hub redeployed as `43964672`.
2. Futuristic UI pilot built on `ui/futuristic-pilot`; Dashboard 2.0 (`a755b8b`),
   AI Workforce 2.0 (`2cf95ba`), MatchHub 2.0 (`30a0589`) accepted on staging.
3. Owner rotated the database and owner-login passwords and confirmed the encrypted
   backup; read-only production status check PASS.
4. `main` (9 commits) and the branch pushed; PR #2 opened.
5. CI: pre-existing marketplace build failure fixed with a CI-only fallback that
   fails closed in release builds; `rls` job made to fail when secrets are missing;
   secret scan made exact. Owner added 14 staging secrets to the repository.
6. CI green at `4d04e8c`: `checks` pass; `rls` 53 files, 491 tests against staging.
7. PR #2 squash-merged → `7479261`; CI on `main` green (491 RLS tests).
8. Hub deployed; smoke: pool and dashboard 307→login, login 200, no staging label.
9. Marketplace deployed; smoke: `/` and `/en` 200 with six real listing links.
10. Remote and local `ui/futuristic-pilot` deleted after confirming its tree equals
    `main`'s for `apps`, `packages` and `.github`.

## Approvals given by the owner (in chat)

Storyboard direction · each staging deploy · Dashboard 2.0, AI Workforce 2.0 and
MatchHub 2.0 acceptance · AI content option A · rotation runbook · push and PR ·
squash-merge · production release plan with gates G4–G6 accepted · hub deploy ·
marketplace deploy · branch deletion.

## Gaps accepted for launch (still open)

- Native BM/ID review of 73 strings: `docs/design/localisation-review-batch-1.md`.
- Four MatchHub views unseen with real data (requirement cards and detail,
  submission cards and detail).
- RLS test count: 491 in CI vs 492 locally; one conditional test, not investigated.
- Owner's signed-in production check of dashboard, `/ai`, pool, requests, submissions.

## Backlog (separate approvals)

`docs/design/backlog-post-acceptance.md`: AI content batch 2; pool-card photos
(projection migration + security review); chip filters; dark-mode language buttons;
AI chip-row scrollbar. Also: provider keys on staging before any "tested with AI"
claim; commit of the runbook and these release docs when the owner reviews them.

## Housekeeping noted, not done

Stale local branches remain: `feat/propertiguru-next-foundation` (also on origin),
`fix/marketplace-url-and-dashboard-scope`, `redesign/phase-1-foundations`. Left for
the owner to prune.

## Addendum — patch 01 (9 Nov 2026, 09:52–09:58 UTC)

- PR #3 squash-merged → `main` `3fc2fb0`: sidebar/partners avatar resolved through `profilePhotoUrl()` with an initials fallback (`ProfileAvatar`); dashboard AI tile reworded (EN; BM/ID drafts).
- Hub deployed from `3fc2fb0` as Worker `a151e61d-0dd7-40b9-9d40-d71bd77dde98`; build target verified `jokyyhvtahiypuzmfydp`; `.env.local` restored.
- Smoke: pool 307→login, login 200, no staging label; signed-in sidebar photo now loads (1024×1536) from the public bucket URL, no broken images; tile text correct.
- 503 prefetch finding closed as a browser-extension labelling artefact (Worker tail: zero 5xx).
- Branch `fix/avatar-fallback-and-ai-wording` left on origin, content identical to `main`.
