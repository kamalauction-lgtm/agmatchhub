# Release brief: Admin Platform 2.0 PR stack

**Status, 11 Nov 2026:** #10, #12–#24 and #26–#35 are **merged into `main` as `12cbfab`** (owner-approved). CI on `main` is green. **Nothing is in production.** [PR #36](https://github.com/kamalauction-lgtm/agmatchhub/pull/36), for screens 2, 8 and 14 with migrations 00126 and 00127, is open. If it is merged before the release, its migrations join the `--hold=00118,00123` run: they only add tables and policies, and the old Hub never touches them.
- Every merge and the production release need the owner's approval.
- This brief covers the stacked Admin PRs only.
- PR #25 (photo metadata scan) is separate; see the last section.

## 1. Scope

| Order | PR | Head | Slice | Migrations | CI |
|---|---|---|---|---|---|
| 1 | #10 | `b4ae846` | P0-a: admin RPC guards, verification docs scope | 00103, 00104 | ✓ checks, ✓ rls |
| 2 | #12 | `19afdcb` | P0-a2: admin RLS country scope | 00105 | ✓ ✓ |
| 3 | #13 | `c23e29f` | P0-b: agent invitations | 00106 | ✓ ✓ |
| 4 | #14 | `97af7d2` | P0-d-1: assisted import (admin prepares, agent commits) | 00107 | ✓ ✓ |
| 5 | #15 | `14180fa` | P0-e-1a: private photo intake | 00108 | ✓ ✓ |
| 6 | #16 | `0c87b6b` | P0-e-2a: photo processor ($0 cap), `IMAGES` binding | 00109, 00110 | ✓ ✓ |
| 7 | #17 | `ae58f4b` | P0-d-1b: country-correct listing creation | 00111 | ✓ ✓ |
| 8 | #18 | `c0417b0` | P0-d-1c: copy follows language, currency, unit | — | ✓ ✓ |
| 9 | #19 | `4ad18ec` | P0-e-3a: gallery editor | 00112 | ✓ ✓ |
| 10 | #20 | `0980e78` | P0-e-3b: partner photos (D6) | 00113 | ✓ ✓ |
| 11 | #21 | `c9e064f` | P1-a: moderation and photo quality | 00114 | ✓ ✓ |
| 12 | #22 | `f5feb23` | P1-b: Handover, change requests, email rebrand | 00115 | ✓ ✓ |
| 13 | #23 | `585af5e` | P1-b-2: change-request photos | 00116 | ✓ ✓ |
| 14 | #24 | `9cab3c7` | P1-b-3: wizard photos | 00117 | ✓ ✓ |
| 15 | #26 | `75384ac` | P1-b-4: profile photos, plus `db-migrate --to` | **00118** | ✓ ✓ |
| 16 | #27 | `bb337ca` | P1-b-5: handover lock, plus `db-migrate --hold` | **00119** | ✓ ✓ |
| 17 | #28 | `4e6e5be` | P1-c-1: Batch Review inline bulk editing (screen 6) | — | ✓ ✓ |
| 18 | #29 | `15f83f2` | P1-c-2: buyer reports and flag queue (D9); **first PR to change `apps/www`** | 00120 | ✓ ✓ |
| 19 | #30 | `11a0a01` | P1-c-3: lead response-time view (screen 10) | — | ✓ ✓ |
| 20 | #31 | `174c07f` | P1-d-1: Agent 360, with suspend and restore (screen 4) | 00121 | ✓ ✓ |
| 21 | #32 | `61058fe` | P1-e-1: Command Centre action queue and nine-workspace nav (screen 1) | — | ✓ ✓ |
| 22 | #33 | `0a8bbb1` | P1-f-1: permissions and security (screen 13): D14, audit, search scope | 00122, **00123**, 00124 | ✓ ✓ |
| 23 | #34 | `f906eeb` | P1-g-1: create and edit agencies (screen 11) | 00125 | ✓ ✓ |
| 24 | #35 | `00aed85` | P1-h-1: AI Workforce Office view in admin; costs shown only when real (screen 12) | — | ✓ ✓ |

- The CI results above were read from GitHub on 11 Nov.
- Every Admin PR's `rls` job ran the full suite against staging; for example, 77 of 78 files at #26 before the documented rehearsal re-run, then green.
- **The stack merges cleanly into `main`.** I checked with `git merge-tree` up to #26. Re-checked through #29 on 11 Nov: still clean.

## 2. Release gates (all must be true before step 4)

1. The owner approves the merges and the production release.
2. The existing NO-GO prerequisites are closed: the password rotation and the backup/restore evidence. Record a fresh backup or PITR point immediately before migrating.
3. Staging is at `00120`, with every PR's CI green against it (the full suite ran on staging after `00119`; #29's CI covers `00120`).
4. Production configuration:
   - `wrangler.jsonc` carries the `IMAGES` binding (from #16);
   - `CRON_SECRET` exists, as today;
   - `MEDIA_TRANSFORM_CAP` may be left unset (the default is 4,500);
   - `EMAIL_FROM` has a code fallback, but set it if a verified sender is wanted for invitation and notification emails.
5. Holds stay as they are, and none of them blocks this release:
   - `import_photos` stays **off** for real agents;
   - the counsel holds (P0-c, P0-d-2: the admin committing on the agent's authority) are not in this stack;
   - the location decisions are held;
   - partner photos need the per-country agreement reference on `/admin/countries` before any partner photo is stored, and none is until it is set.

## 2a. Gate evidence (checked 11 Nov 2026)

### Credentials and backup (gate 2)

| Item | Evidence on file | Status | Outstanding action | Owner |
|---|---|---|---|---|
| Production database password rotated | Owner statement, plus the assistant's read-only `status:production` check after rotation (`pilot-readiness-checklist.md`, 9 Nov) | **PASS** | none | — |
| Owner Hub login password rotated | Owner statement only | **Needs evidence** | A dated password-manager entry for the Hub login, and one sign-in with the new password. Record the date in the decision log, never the value. | Owner |
| Encrypted backup of production | Owner statement only, for the 9 Nov export (`credential-rotation-and-backup-runbook.md` §6) | **Needs evidence** | The encrypted container's name and path, the file count and row count confirmed in the copy, and the plaintext copy deleted. | Owner |
| **Fresh** backup immediately before migrating | none | **Required at release** | Take a new export, or confirm the Supabase daily backup time, just before 4.3. The 9 Nov export predates the 11 Nov avatar cleanup, the latest production change. | Owner, with the assistant running the export script if asked |
| Restore test | none | **Not done** | Restore the backup into a **throwaway** project, not the shared staging database. Staging carries every PR's CI and the 2.0 schema, and loading production personal data into it needs the owner's own approval. | Owner decision; the assistant can script it |

### Production Images readiness (gate 4)

These checks are read-only and authorised:
- **One Cloudflare account** holds both Hub Workers, `ag-matchhub` (production) and `ag-matchhub-staging`, according to `wrangler whoami` and `wrangler deployments list`.
- The staging Worker on that account already runs real transformations through the `IMAGES` binding: 95 used by 11 Nov, and every processing, profile and wizard check passed. So the account's Images (Free plan) entitlement works.
- The production `wrangler.jsonc` on the stack declares `"images": { "binding": "IMAGES" }`.
- The current production Worker is `a8833c9b` (10 Nov), which is the rollback target. It has no binding today, because `main`'s configuration has none.

**Finding: the quota is shared.**
- Cloudflare's free 5,000 transformations a month are counted **per account**, while the app's 4,500 cap (`media_processing_usage_now()`) is counted **per database**.
- Staging and production together can therefore reach Cloudflare's limit before either app cap trips.
- The $0 commitment still holds: the Free plan stops rather than bills, and the processor pauses on Cloudflare error 9422 instead of failing.
- But photos could pause earlier than the app shows.
- **Recommendation:** set `MEDIA_TRANSFORM_CAP=500` on the staging Worker and `4000` on production, keeping the combined total at 4,500 or below.

  This changes the approved 4,500 figure for production, so it is **an owner decision**. The staging value can be set at any time.

**Verifiable only after deployment:**
- the binding is attached to the new production Worker version;
- the first real transform succeeds (`photo_processing` cron result, or the profile-photo check in 4.5);
- the production counter starts at 0 and increments;
- the account's month-to-date Images usage. It is visible only in the Cloudflare dashboard, which the assistant's token cannot read.

## 3. Merge order

Merge in the order of the table, **with merge commits, not squash**. Each PR's base is the previous branch, so squash-merging a lower PR would make every PR above it show the same commits again and conflict.

- After a base merges, GitHub retargets the next PR to `main`.
- Let CI run on `main` after each merge, or at least after #16, #22 and the last one.
- **#26 and #27 must be merged together with the rest.** The code they carry is matched to the migration sequence below; see 4.3.

## 4. Migration and deploy sequence (production)

### 4.1 Read-only baseline
Run `npm run status:production -w @pg/db` and record the following:
- applied through `00102`, with `00103`–`00125` pending;
- the current Hub Worker version (`npx wrangler deployments list --name ag-matchhub`), which is the rollback target;
- the marketplace Worker version, the rollback target for the marketplace deploy;
- the photo scan for both public buckets: listing photos 0 files; profile photos 2 files, both clean.

### 4.2 Build the Hub first, without deploying
From the merged `main`, build and verify the bundle using the deploy procedure's build steps: stop the dev server, run `rm -rf .next`, then run the target verifier. Do not deploy yet. This keeps the window between migration and deploy to minutes.

### 4.3 Migrate everything except 00118
```bash
node scripts/db-migrate.mjs --env=production --hold=00118,00123 --status   # expect 00118 and 00123 HELD; 00125 pending
node scripts/db-migrate.mjs --env=production --hold=00118,00123
```
- This applies `00103`–`00117`, `00119`–`00122`, `00124` and `00125`. I ran `--status --hold=00118` read-only against production on 11 Nov and it listed exactly the plan of that time; re-run it with both holds.
- **Why hold 00118 and 00123:**
  - the new Hub pages read `import_batches.agent_review_state`, so 00119 must exist before the new Hub is live;
  - 00118 removes the agents' direct writes to the profile bucket, which the **old** Hub's profile upload still uses. It must come after the deploy.
  - 00123 revokes clients' `log_audit`, which the **old** Hub uses for every audit row. The new Hub writes through `log_audit_as` and falls back to the session path only while `log_audit_as` does not exist. So 00123 also follows the deploy, and no audit row is lost.
  - The new Hub works with or without 00118 and 00123.

### 4.4 Deploy the Hub
Deploy the prebuilt bundle immediately.
- **Window:** for the minutes between 4.3 and 4.4, the old Hub runs on the new schema. **This was rehearsed on staging on 11 Nov and passed 6/6;** see section 7.
- **The marketplace is redeployed** right after the Hub (`npm run deploy -w @pg/www`, with the market verifier). #29 adds the "Report this listing" form, which calls `submit_listing_report` (00120, applied in 4.3). Until that deploy, the old marketplace simply has no report form. 00111 redefines `submit_public_inquiry` with the same nine-argument signature and anon grant, so the inquiry form works before and after.

### 4.5 Post-deploy checks, phase 1
The owner signs in; the assistant checks read-only.

**Hub:**
- `/login` returns 200;
- the dashboard loads;
- each 2.0 admin screen loads for the owner: `/admin/listings`, `/admin/media`, `/admin/handover`, `/admin/imports`, `/admin/invitations` and `/admin/countries`.

**Marketplace:**
- `/` and `/en` return 200 and list real listings;
- a listing page returns 200 and shows the cleaned avatar;
- `submit_public_inquiry(text×7, uuid, text)` and `submit_listing_report(text×5)` exist, and anon may execute both (a catalogue query, with no submission);
- a listing page shows "Laporkan listing ini", and opening it shows the form.

**Cron:**
- `/api/cron?only=photo_processing` with the secret returns a result: `claimed: 0`, or a processed count.

**Profile photo, new upload:** the owner, or a pilot agent the owner names, uploads one.
- `avatar_url` is `<uid>/avatar-<hash16>.webp`;
- the folder holds 1 file;
- the public file is a WebP of at most 512 px with no EXIF or XMP;
- there is one `profile.avatar_updated` audit row;
- Images usage is up by 1.

### 4.6 Apply 00118 and 00123
```bash
node scripts/db-migrate.mjs --env=production
```
Only 00118 and 00123 should be pending. Then check read-only:
- the two "profile media owner" policies are gone;
- the `trg_profiles_avatar_guard` trigger exists;
- `log_audit` is not executable by `anon` or `authenticated`; `log_audit_as` is executable by `service_role` only;
- the newest Hub audit rows carry a real `actor_id` (the `log_audit_as` path).

### 4.7 Post-deploy checks, phase 2
- **Profile photo replacement:**
  - `avatar_url` changed;
  - the folder still holds exactly 1 file;
  - the public file is clean;
  - a second audit row exists.
- **Saving a profile without a photo** keeps the avatar.
- **Scan** of both public buckets: "no file carries EXIF, GPS or XMP".
- **Record** the Worker version, migration status, scan output and approver in the decision log.

## 5. Rollback

**Decision rule.** Roll back if any of these happen:
- a 2.0 admin screen errors for an authorised admin;
- the marketplace home or a listing page errors;
- a confidential field appears where it should not;
- a profile upload fails, other than an expected `photo_paused` at the cap.

| Failure point | Action |
|---|---|
| Marketplace after its deploy | `npx wrangler rollback --name propertiguru-www` to the recorded version. 00120 can stay: the old marketplace never calls it. |
| During 4.3 | Each migration runs in its own transaction, so a failing one leaves nothing half-applied. The runner stops; fix forward or restore. |
| After 4.4, before 4.6 | `npx wrangler rollback --name ag-matchhub` to the recorded version. The schema then has 00103–00117 and 00119 under the old Hub, the same state as the 4.3–4.4 window. |
| After 4.6 | **First** revert 00118 with the SQL in `docs/release/p1b4-profile-photos-release.md` (it restores the two policies and drops the trigger; rehearsed on staging on 11 Nov). **Then** roll the Hub back if needed. |
| Schema rollback beyond 00118 | Each migration's header carries its rollback. Prefer fixing forward. A full rollback means restoring the backup recorded in gate 2. |

**Data:** the migrations add tables, columns, functions and policies, and backfill only derived values (`agent_review_state`). No user data is rewritten. The production avatar cleanup on 11 Nov was a separate, already-audited action.

## 6. Owner checks after release, by screen
- **3, Agent invitations:** send one invitation to a test address and open the link.
- **5, Import Workbench:** prepare a small spreadsheet batch for a pilot agent and hand it over.
- **10, Lead response:** `/admin/leads` loads with the last 30 days.
- **14, Handover:** the agent handles both items, sees "You are now in control", and the batch shows "Agent in control".
- **9, Moderation:** approve or reject one listing, using a second admin for anything they prepared. Open "Reported (n)". If the owner sends one test report from the marketplace, dismiss it.
- **6, Batch Review:** set the type on two selected items of a prepared batch.
- **7, Photo Quality Centre:** the queue loads; with `import_photos` off it is mostly empty.

## 7. Known risks and what was not verified

- **The old Hub on the new schema: rehearsed on staging on 11 Nov.**
  - Staging was put into the exact pre-deploy state: `00103`–`00117`, `00119` and `00120` applied, with 00118 reverted using the rollback SQL. `origin/main`'s Hub (`2870549`) was deployed to the staging Worker as version `6dc3f434`.
  - **Result 6/6:**
    - 12 agent pages and 10 admin pages load;
    - the old wizard creates a listing with its photo (an Indonesian agent; `main`'s wizard is Indonesian-only until #17);
    - the old profile upload works;
    - the old moderation screen approves the listing;
    - the **old marketplace** (`main`, dev server against staging) submits an inquiry through the redefined `submit_public_inquiry`, and the consent is filed in the listing's country.
  - **Then 00118 was applied with the old Hub still live: 5/6.** Only the old profile upload fails (`upload_failed`). This confirms that 00118 must follow the Hub deploy.
  - Staging was then returned to the stack: the Hub was redeployed and 00118 re-applied through the runner.
- **Final rehearsal, 11 Nov, against the final pre-deploy schema:** `00103`–`00117`, `00119`–`00122`, `00124` and `00125` applied, with **00118 and 00123 held** (both reverted with their rollback SQL, which re-granted `log_audit` exactly as before). `main`'s Hub was deployed as staging version `0237b083`.
  - **Passed:** 12 agent pages and 10 admin pages; the old profile upload; old moderation approving a listing; the old marketplace inquiry, with the consent filed in the listing's country.
  - **Wizard:** not exercised over HTTP this time. The deployed bundle's action id for the old wizard could not be resolved: it differs from the local build manifest and is not in the page or its chunks. A harness limitation, recorded as such. Instead the old wizard's exact database writes (property, listing, the old session `log_audit` call) were replayed as an Indonesian agent on this schema, and all succeeded. The photo-row path is unchanged since the first rehearsal passed it.
  - **Result: 5/6, with database evidence for the wizard step.** Staging was then restored: 00118 and 00123 were re-applied through the runner, the 2.0 Hub was redeployed (version `69d58f88`), and the result was checked. Schema is at `00125` with 23 stack migrations, `anon` cannot execute `log_audit`, and the profile-photo check passes 16/16.
  - **Still to do, at the next controlled staging rehearsal:** submit the old wizard **through its real form in a browser**, with a photo, as an Indonesian agent, against the same pre-deploy schema.
    - If it fails, record the exact error from the Worker log (`wrangler tail`) and its effect on the release order.
    - If the old wizard cannot create listings while 00103–00117, 00119–00122, 00124 and 00125 are applied, the 4.3 to 4.4 window becomes a short **listing-creation outage**. The mitigation would then be to apply 4.3 and deploy 4.4 back to back with a pre-built bundle (already the plan), or to pause agent listing creation for those minutes.
- **Production Images behaviour:** the account entitlement is proven through staging, which uses the same Cloudflare account. The production binding, the first transform and the shared-quota headroom can only be verified after deployment; see section 2a.
- **Shared staging:**
  - each PR's CI `rls` job runs against the shared staging database. Rehearsals that change the schema must not overlap a CI run; one did on 11 Nov and was re-run;
  - every PR based on `main` (such as #25) fails `rls` until the stack is merged, because staging is ahead of `main`.

## 8. PR #25 (separate)

- #25 adds a read-only scan script and two npm aliases. It has no dependency on the stack, and the stack has none on it.
- Its `rls` failure is staging drift. Three capabilities (`agent.invite` from 00106, `listing.import_assisted` from 00107 and `media.review` from 00114) exist on staging but not in `main`'s expectations.
- It was validated against a database whose schema matches its branch: production, at `00102`.
- **Merge it after the stack.** Its `rls` job should then pass on a re-run. The scan is used in 4.1 and 4.7 from the merged stack, which also contains it.
- If the owner wants it before the stack, it can be merged on its green `checks` job, with the `rls` failure explained. It changes no schema.
