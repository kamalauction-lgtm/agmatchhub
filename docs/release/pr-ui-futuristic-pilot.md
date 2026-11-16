# Pull request draft — ui/futuristic-pilot → main

Status: **draft text for the owner's approval. Nothing has been pushed or opened.**

## Title

PropertiGuru 2.0 UI pilot: Dashboard, AI Workforce, MatchHub (staging-accepted)

## Body

### What this is

The futuristic UI pilot approved against `docs/design/PropertiGuru_2_0_Futuristic_UI_UX_Master_Spec.md`, built on `main` at `ee9c6d5` and accepted on staging module by module:

| Module | Commit | Staging version |
|---|---|---|
| Dashboard 2.0 | a755b8b | 1cb179d0 |
| AI Workforce 2.0 | 2cf95ba | 5cacc007 |
| MatchHub 2.0 | 30a0589 | d13a68f9 |

Also included: shared `CommandHeader`, `Badge`/`Card`/`Button`/`EmptyState` adoption on My Listings, Leads, Tasks and Content Studio; `StatCluster`, `EnvironmentBadge`, `OfferCard`, `StageStrip`, `AstraBriefPanel`, `WorkforceGallery`; dashboard loading skeleton; six AI roles' approved detail copy as translation keys.

### What did not change

- No database migration, RLS policy or view. `packages/db/supabase` is untouched.
- No pickup, approval, submission or presentation logic; the same server actions and guards.
- No production configuration. One public key, `NEXT_PUBLIC_ENVIRONMENT=staging`, added to `.env.staging.production` only.
- No AI backend logic. Role statuses are computed from existing rows; the headline reads "36 AI Specialists" and no role is called fully operational.

### Verification

- Typecheck, lint (one pre-existing warning in `worker.js`), 220 database-free unit tests, production build: pass at 30a0589.
- Full staging RLS suite (`npm test`): 53 files, 492 tests, pass, 9 Nov 2026.
- Playwright on staging: 375/768/1440, light and dark, EN/BM/ID for every changed page; pool pickup and stop exercised and the test state restored. Screenshots in `.playwright-mcp/` (local, not committed).

### Known gaps

- Four MatchHub views not seen with real data (requirement cards, requirement detail, submission cards, submission detail): the staging account owns none.
- BM and ID strings are drafts; review table in `docs/design/localisation-review-batch-1.md` (not in this PR).
- Pool cards have no photo; needs a projection migration (backlog).
- Pool filters remain selects rather than chip links.

### History note

8ad94a8 broke the build (misplaced JSX comment); a04f8f6 fixed it. **Squash-merge recommended.**

### Not for this PR

Production deploy, which needs a separate approval and the `.env.local`-aside build with the target verifier.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Exact commands (for approval; none run)

```bash
git push origin main
```

```bash
git push -u origin ui/futuristic-pilot
```

```bash
gh pr create --base main --head ui/futuristic-pilot --title "PropertiGuru 2.0 UI pilot: Dashboard, AI Workforce, MatchHub (staging-accepted)" --body-file docs/release/pr-ui-futuristic-pilot.md
```

Notes: the first push is a fast-forward of 9 local commits (the pool security fix and
the pilot foundations). The `gh` command uses this file's body section; the heading
and command block below it should be trimmed from the body before use, or the body
pasted manually. Do not enable auto-merge.
