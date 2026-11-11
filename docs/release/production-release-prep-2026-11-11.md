# Admin 2.0 production release: preparation and go/no-go (11 Nov 2026)

**Status: prepared, not released. Verdict: NO-GO until the owner items in section 2 (G1, G3, G4, G5) are closed.** G6 (`CRON_SECRET`) was closed on 11 Nov.

Nothing in production was changed while preparing this sheet. Every check was read-only, and the bundle was built locally and not deployed. Sections 4 to 7 of `admin-2.0-release-brief.md` give the full procedure, with the reason for each step.

## 1. Baseline (read-only, 11 Nov)

| Item | Value |
|---|---|
| Code to release | `main` at `bd37733`. It includes everything through #42; the app code is the same as staging's `3d6c67a` plus scripts and docs. |
| Production database | `jokyyhvtahiypuzmfydp`, at **00102** (102 applied). |
| Migration plan with `--hold=00118,00123` | **23 to apply**: 00103–00117, 00119–00122 and 00124–00127. 00118 and 00123 are HELD. This matches the brief. |
| Hub Worker `ag-matchhub` (rollback target) | **`5ebd2fb1-cde6-45e3-ad8b-50e1a8e6154f`** (11 Nov, 13:40 UTC): the same code as `a8833c9b` (10 Nov), plus `CRON_SECRET`. Roll back to this version, not to `a8833c9b`, because the older one has no `CRON_SECRET`. |
| Marketplace `propertiguru-www` (rollback target) | `86a4c983-149f-4658-935a-7990872b2489` (10 Nov) |
| Marketplace `propertiguru-www-my` (no custom domain) | `486ec94a-6002-4be1-8923-5791c669e7d7` |
| Hub bundle | Built from `bd37733` in the `propertiguru-p0a` worktree (no `.env.local`). Verifier: **"Build target verified: jokyyhvtahiypuzmfydp"**. Not deployed. |
| Hub config | `wrangler.jsonc` has the `IMAGES` binding, crons `*/15` and daily, and `APP_BASE_URL` set to `https://hub.propertiguru.id`. |
| Hub Worker secrets (names only) | `CRON_SECRET` (added 11 Nov), `LISTING_INGEST_AGENT_ID`, `LISTING_INGEST_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_SIGNING_SECRET`, `VAPID_PRIVATE_KEY` |

## 2. Gates

| # | Gate | Status | What closes it | Who |
|---|---|---|---|---|
| G1 | Owner approves the production release | **Open** | Your explicit "release to production". | Owner |
| G2 | Production database password rotated | PASS (9 Nov) | — | — |
| G3 | Owner Hub login password rotated | **Needs evidence** | The date of the password-manager entry, plus one sign-in at hub.propertiguru.id with the new password. Record the date, never the value. | Owner |
| G4 | Encrypted backup; plaintext copy removed | **Not met** | The plaintext 9 Nov export (105 files, containing personal data) is **still in your local backups folder**. Delete it once the encrypted backup below is verified. | Owner |
| G5 | Fresh backup immediately before migrating | **Required on release day** | Run `node backup-full.mjs <path-to-packages/db/.env.production> <encrypted-drive-folder>` in your backups folder's `tools` directory. You type the passphrase at a hidden prompt. It writes one AES-256-GCM file, with nothing unencrypted on disk. Then run `verify-restore.mjs` on that file. | Owner runs it |
| G6 | **`CRON_SECRET` on the production Hub** | **PASS (11 Nov)**. Set with your approval and generated randomly; never printed. A copy is in the git-ignored `packages/db/.env.production` for the post-release cron check. Before setting it I confirmed nothing was pending that the old Hub's jobs would send: 0 task reminders, 0 overdue leads, 0 scheduled posts, and no confirmed upcoming viewings. Verified: a manual cron call without the secret gets 401; with it, `payment_expire` returns `expired: 0`; login returns 200. | `worker.js` drops every scheduled tick without it. Today, and after the release, that stops photo processing, payment expiry, the 90-day prospect clean-up and the other cron tasks. Set it before or with the deploy (`npx wrangler secret put CRON_SECRET --name ag-matchhub` in `apps/hub`, with a newly generated random value). | Owner, or me on your explicit approval |
| G7 | Images quota split (D-8) | Decision | Recommended: `MEDIA_TRANSFORM_CAP=4000` on production and `500` on staging. Without it, the app cap stays at 4,500 and the 5,000 free quota is shared by both Workers. | Owner |
| G8 | Holds stay off | OK | `import_photos` is off for real agents; counsel holds D-1 and D-2; location holds; partner photos need a per-country agreement reference first. None of them blocks the release. | — |

Optional, not a gate: a restore test into a throwaway project (not shared staging). It is recommended before relying on the backup.

## 3. Release-day sequence (after G1–G6)

1. **Baseline again:** `npm run status:production -w @pg/db` should show 102 applied. Re-read both Workers' versions.
2. **Fresh encrypted backup (G5).** Record the file name, size and the `verify-restore` result.
3. **Rebuild the Hub bundle** from `main` in the worktree, then run the verifier. Do not deploy yet.
4. **Migrate,** from `packages/db`:
   ```bash
   node scripts/db-migrate.mjs --env=production --hold=00118,00123 --status   # 23 pending, 00118 and 00123 HELD
   node scripts/db-migrate.mjs --env=production --hold=00118,00123
   ```
5. **Deploy the prebuilt Hub straight away** (`npx opennextjs-cloudflare deploy` in the worktree's `apps/hub`), with `CRON_SECRET` already set.
6. **Deploy the marketplace** with `npm run deploy -w @pg/www`, which builds, verifies and deploys the Indonesian market. Also redeploy the MY market with `npm run deploy:my -w @pg/www` if it should get the "Report this listing" form.
7. **Phase 1 checks** (brief 4.5): Hub login and the admin screens, the marketplace home and a listing, the inquiry and report functions, `/api/cron?only=photo_processing`, and one profile-photo upload.
8. **Apply 00118 and 00123** (`node scripts/db-migrate.mjs --env=production`), then the phase 2 checks (brief 4.6–4.7).
9. **Record** the Worker versions, the migration status, the scan output and the approver in the decision log.

**Rollback:** `npx wrangler rollback --name ag-matchhub` (back to `5ebd2fb1`) and `--name propertiguru-www` (back to `86a4c983`). After step 8, revert 00118 first, using `p1b4-profile-photos-release.md`. The migrations add tables, columns, functions and policies only; no user data is rewritten.

## 4. What the release turns on, and what stays off

**On** for admins:
- invite agents (country-scoped and audited);
- the acquisition pipeline, locked until you set each country's retention period (D-6);
- prepare imports from portal links and spreadsheets and hand them to the agent;
- Agent 360, with suspend and restore;
- moderation with buyer reports;
- leads, sources and the handover report.

**Off** until you decide:
- agents finishing activation (D-1);
- the admin committing imports for the agent (D-2);
- copying portal photos (D-3);
- the AI provider (D-4);
- portal re-sync (D-7).
