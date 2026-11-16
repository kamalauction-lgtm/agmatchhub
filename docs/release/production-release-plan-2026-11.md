# PropertiGuru 2.0 — production release plan (hub, then marketplace)

Status: **plan for owner approval. Nothing here has been executed.** Written 9 Nov
2026 after PR #2 squash-merged into `main` as `7479261`.

What production runs today: hub Worker version `43964672` (this morning's deploy:
pool security fix 00099–00102, pre-pilot UI). The marketplace has not been redeployed
in this work. Production database: 102 migrations applied, 0 pending; **no migration
is part of this release.**

## 0. Gates before any production command

| # | Gate | Evidence required | Status |
|---|---|---|---|
| G1 | Post-merge CI on `main` green at `7479261` | GitHub Actions run: `checks` and `rls` success | pending at time of writing |
| G2 | Credential rotation complete | owner confirmation (given) + read-only status check PASS (done) | met on confirmation |
| G3 | Encrypted backup in place | owner confirmation (given); location recorded in password manager | met on confirmation |
| G4 | Native BM/ID review | `docs/design/localisation-review-batch-1.md` signed off, or owner accepts drafts for launch | **open** |
| G5 | Four MatchHub views seen with real data | staging requirement + submission created and screenshotted, or owner accepts the gap | **open** |
| G6 | RLS count difference (491 CI vs 492 local) | identified or accepted | **open, low** |
| G7 | Owner approval of this plan | in chat | **open** |
| G8 | Owner approval of the deploy command itself | in chat, separately, at step 3 | **open** |

Release only proceeds with G1–G3 met and G4–G6 either met or explicitly accepted.

## 1. Pre-flight (read-only, assistant)

```bash
git fetch origin && git rev-parse --short origin/main        # expect 7479261
npm run status:production -w @pg/db                           # expect 102 applied, 0 pending
```
- Confirm no dev server is running (a running `next dev` corrupts the build).
- Confirm `apps/hub/.env.production` names project `jokyyhvtahiypuzmfydp` and carries no
  `NEXT_PUBLIC_ENVIRONMENT` (so the staging label cannot appear).

## 2. Build identity

- Check out `main` at `7479261` in a clean tree (`git status` shows only the known
  untracked docs).
- Move `apps/hub/.env.local` aside for the build and restore it afterwards (deploy
  gotcha: `.env.local` outranks `.env.production` and is inlined). The deploy script
  also runs `scripts/verify-build-target.mjs`, which refuses a bundle naming the
  wrong project or containing localhost URLs.

## 3. Hub deploy (owner approval G8, then assistant runs)

```bash
npm run deploy:hub
```
Record: Worker version id, "Build target verified: jokyyhvtahiypuzmfydp".

## 4. Hub smoke test (read-only, assistant)

- `curl -sI https://hub.propertiguru.id/collab/pool` → 307 to `/login`.
- `curl -s -o /dev/null -w "%{http_code}" https://hub.propertiguru.id/login` → 200.
- Owner signs in (never the assistant) and checks: dashboard shows the Astra panel;
  `/ai` shows "36 AI Specialists" and opens one worker dialog; `/collab/pool` shows
  **no** staging label and the real pool (expected empty unless offers exist);
  `/requests`, `/submissions` render.
- Optional: Playwright on the public pages only (login, 307 on protected routes).

## 5. Marketplace deploy (separate decision)

The only `apps/www` change is the CI-only build fallback, inert in a real deploy
because `WWW_CI_PLACEHOLDER_BUILD` is never set there. Deploying `www` is therefore
**optional** for this release. If chosen:

```bash
npm run deploy:www
```
`scripts/deploy-market.mjs` injects the market's env, moves `.env.local` precedence
out of the way, and runs the target verifier. Smoke: `https://www.propertiguru.id/`
→ 200 and the homepage lists real properties (the fallback must not have fired; the
build log must contain no "CI placeholder build" line).

## 6. Rollback

- Cloudflare keeps previous Worker versions. Roll back with
  `npx wrangler rollback --name ag-matchhub` (interactive) or by redeploying from
  `ee9c6d5` with the same procedure. No database rollback is needed: this release has
  no migration.
- Decision rule: roll back if the signed-in dashboard, `/ai` or `/collab/pool` errors,
  or if any confidential field appears where it should not.

## 7. After release

- Delete remote branch `ui/futuristic-pilot` (owner's call).
- Record in the decision log: `main` SHA, Worker version, smoke results, who approved.
- Move backlog items (AI content batch 2, pool-card photos, real-data MatchHub checks,
  BM/ID fixes) into their own approvals.

## 8. Recommendation

- Hub: **GO once G1 is green and G4–G6 are met or accepted**, with a separate approval
  for the deploy command.
- Marketplace: **optional**; no functional change ships; deploy only if you want the
  build safeguard live now.
