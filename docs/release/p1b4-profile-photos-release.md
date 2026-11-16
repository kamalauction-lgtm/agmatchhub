# Release and rollback: migration 00118 with the Hub profile-photo upload code (P1-b-4)

**Status: prepared, not approved.** Production release needs the owner's separate approval. It also stays behind the existing NO-GO prerequisites: the password rotation and the backup/restore evidence.

This document covers only the 00118 step inside the 2.0 production release (PRs #10–#26). The order of migrations `00103`–`00117` and the rest of the Hub deploy follow the stack's own release plan.

## Why the order matters

00118 does two things:
- it **drops** the storage policies that let a signed-in agent write to `agent-profile-public`;
- it **adds** a trigger that accepts only `<uid>/avatar-<hash16>.webp` in `profiles.avatar_url`.

| Hub code running | Schema without 00118 | Schema with 00118 |
|---|---|---|
| **Old** (production today): uploads the original with the agent's session and sets `avatar_url = <uid>/photo-<ts>.<ext>` | works | **Outage.** The upload is refused by storage, and the `avatar_url` value is refused by the trigger. |
| **New** (#26): re-encodes, uploads with the service client, and sets `avatar_url = <uid>/avatar-<hash16>.webp` | works (the old policies are simply unused) | works |

The new code works on **both** schemas. The old code works only **without** 00118. So:
- **00118 is applied only after the new Hub is live and verified**;
- on rollback, **00118 is reverted before** the old Hub returns.

There is no moment when the running code and the schema disagree.

The migration runner applies every pending migration by default. #26 adds `--to=NNNNN` to `packages/db/scripts/db-migrate.mjs`, so 00118 can be held. On staging, `--to=00117` reported "1 later migration(s) held by --to"; `--to=117` and an unknown version are both refused.

## Release steps (production, after approval)

**0. Read-only baseline.** These checks write nothing.
- `npm run status:production -w @pg/db`: shows `00102` applied, `00103`–`00118` pending.
- `npm run scan:photos:production -w @pg/db -- --bucket=agent-profile-public`: expect 2 files, both clean (the result after the 11 Nov cleanup).
- Record the current Hub Worker version ID (`npx wrangler deployments list --name ag-matchhub`). This is the rollback target.
- Record Images usage (`media_processing_usage_now()`). It must leave room for verification uploads, well under the 4,500 cap.
- Confirm the production `wrangler.jsonc` has the `IMAGES` binding (it does on the 2.0 branch). Without it, uploads are refused as "paused" rather than stored raw. That would not be an outage, but it would be a failed release check.

**1. Migrations, holding 00118** (staging was already done). Since #27 added 00119, which the new Hub needs **before** it is live, use `--hold` rather than `--to`:
```bash
node scripts/db-migrate.mjs --env=production --hold=00118 --status   # expect 00118 HELD
node scripts/db-migrate.mjs --env=production --hold=00118
```
Expect "… applied. 1 pending migration(s) held by --to/--hold." See also `admin-2.0-release-brief.md` §4. The old Hub still works at this point, as far as profile photos are concerned: the policies are still in place and there is no trigger.

**2. Deploy the Hub** with the 2.0 code, using the documented `deploy:hub` procedure: stop the dev server, run `rm -rf .next`, then run the verifier.

**3. Verify a NEW upload** before 00118.
- The owner, or a pilot agent the owner names, uploads a profile photo in the browser at `hub.propertiguru.id/profile`, using a photo they are happy to publish.
- The assistant does not create production accounts and does not sign in as anyone.
- The assistant then verifies read-only, with counts and shapes only:
  - that agent's `avatar_url` matches `<uid>/avatar-<hash16>.webp`;
  - their folder holds exactly 1 file;
  - the public URL returns 200 with a WebP of at most 512 px and no EXIF/XMP;
  - one `profile.avatar_updated` audit row;
  - Images usage is up by 1;
  - the avatar shows in the Hub shell and on a www page that shows the agent.

**4. Apply 00118** (the only migration still pending):
```bash
node scripts/db-migrate.mjs --env=production
```
Then check read-only:
- `pg_policies` has no "profile media owner write" or "owner update" policy;
- `pg_trigger` has `trg_profiles_avatar_guard` on `public.profiles`.

**5. Verify a REPLACEMENT** after 00118.
- The same person uploads a different photo.
- Verify read-only:
  - `avatar_url` changed and still has the `avatar-<hash16>.webp` shape;
  - the folder still holds exactly 1 file, meaning the previous one was deleted;
  - the public file is clean;
  - a second audit row exists;
  - Images usage is up by 1 again.
- Saving the profile without a photo keeps the avatar.

**6. Close.** Run the scan on both public buckets and expect "no file carries EXIF, GPS or XMP". Record the Worker version, migration status, scan output and approver in the decision log.

**Rollback triggers:**
- the step 3 or step 5 upload fails, apart from an expected `photo_paused` at the cap;
- an avatar stops showing on the Hub or www;
- any file in a public bucket is found with metadata.

## Rollback

**If step 3 fails (00118 not yet applied):** roll the Hub back to the recorded version (`npx wrangler rollback --name ag-matchhub`). The schema without 00118 suits the old code. Migrations `00103`–`00117` follow the stack plan's own rollback.

**If step 5 or later fails (00118 applied):** first revert 00118, then roll back the Hub if needed. Revert in one transaction on production:
```sql
begin;
drop trigger if exists trg_profiles_avatar_guard on public.profiles;
drop function if exists public.guard_profile_avatar();
create policy "profile media owner write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'agent-profile-public' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "profile media owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'agent-profile-public' and (storage.foldername(name))[1] = auth.uid()::text);
delete from supabase_migrations.schema_migrations where version = '00118';
commit;
```
This recreates the two 00002 policies exactly. It runs staging first, as any SQL does.

**Data:** 00118 changes no rows.
- Avatars already cleaned by the new code are valid for the old code too, which accepts any path.
- There is nothing to restore. If the old code returns, new uploads would again be uncleaned originals, so plan the re-release promptly.

## What has been verified so far (staging, version `7d1c4bf4`)

- RLS: 5/5. Direct upload, overwrite, foreign avatar, raw-name avatar and arbitrary-path avatar are all refused; the service role still writes.
- End to end: 16/16.
  - The test photo was a GPS, camera and Canva-XMP JPEG; the result is a 384×512 WebP with no metadata and rotation applied.
  - One file per agent, and no original kept.
  - One transform counted, and the change audited.
  - A replacement deletes the old file.
  - A non-image is refused.
  - There is no bypass.
- Regressions: all six other photo and admin checks still pass.

**Rehearsed on staging, 11 Nov.** I ran the rollback and the second phase:
1. The rollback SQL above restored both policies, removed the trigger and untracked 00118.
2. With 00118 reverted, the **new** upload code passed all 14 upload checks. The only two failures were the expected ones: in that state a direct write and a raw-name avatar are allowed again.
3. `db-migrate --to=00118` re-applied it. The checks returned to **16/16** and the RLS tests to 5/5.

This proves three things: the new code works on both schemas, the rollback SQL is correct, and the held migration applies cleanly afterwards.

The rehearsal briefly reverted 00118 on the **shared** staging database. #26's CI `rls` job ran during that minute, and its two 00118 tests failed. The job was re-run afterwards. **Never rehearse a schema rollback on staging while a CI run is in progress.**

**Not verified:**
- the old Hub against 00103–00117. That belongs to the stack plan;
- upload behaviour at the cap in production.
