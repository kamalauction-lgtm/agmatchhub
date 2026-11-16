# Legacy wizard photos: backfill plan (follow-up to P1-b-3)

**Status, 11 Nov 2026.**
- The owner asked for a plan ("Yes, plan backfill"), then approved "Delete and add scan".
- **Done:**
  - the two production orphans were removed and audited (`storage.orphan_removed`, 2 rows); production's `listing-media-public` bucket is now empty;
  - the read-only scan is in [PR #25](https://github.com/kamalauction-lgtm/agmatchhub/pull/25), based on `main`.
- The backfill stays unbuilt.
- The production window is still on option A (ship with the merge), unless the owner says otherwise.

## Question

Since [PR #24](https://github.com/kamalauction-lgtm/agmatchhub/pull/24), new wizard photos are private until the $0 processor cleans them. Photos uploaded before that went straight into the public bucket with whatever metadata the agent's file carried, including GPS and camera data. Do any of those photos exist, and if so, how should they be reprocessed?

## Inventory

Both databases were checked with read-only queries. Every file in the public listing bucket was also downloaded from its public URL and scanned for EXIF, GPS and XMP. No identifiers are listed here.

| | Staging (`aylzekkeurjsudazzxjv`) | Production (`jokyyhvtahiypuzmfydp`) |
|---|---|---|
| Photo rows pointing at the public bucket (legacy wizard) | 20, across 20 listings and 6 agents (published 15, pending 2, draft 1, paused 1, sold 1) | **0**. Production has 30 published listings, the latest created 21 Aug 2026, and none has a photo row. |
| Files in `listing-media-public` | 20, all referenced by those rows | **2 orphans**: JPEGs of about 7 KB each, from 3 Aug 2026. Their listing and owner no longer exist. |
| Files carrying EXIF, GPS or XMP | **0**. They are synthetic PNGs from `seed-staging-demo.mjs`. | **0** |
| Leftover files in the intake bucket | 2 derivative files, about 1 KB in total, left by an earlier test run whose listing was deleted. **Removed on 11 Nov.** Nothing referenced them. | none |

**Conclusion: no published photo carries location or camera data today.** A reprocessing backfill would have nothing to work on. Building one now would spend effort and Images transforms for no gain.

## The real exposure: production still runs the old wizard

Production runs `main` (`2870549`). Its wizard (`apps/hub/src/app/(agent)/listings/actions.ts`) still writes the agent's original file straight to the public bucket. From the first production listing that gets a photo, until P1-b-3 and its prerequisites reach production, every such photo is public with its GPS data. Nobody has uploaded one so far.

P1-b-3 depends on the rest of the stack: migrations `00103`–`00117`, the intake bucket and the processor. It cannot be cherry-picked onto `main` by itself. The options for this window:

| Option | What it does | Cost / risk |
|---|---|---|
| **A. Ship with the merge (recommended)** | No change now. The gap closes when #10–#24 and migrations `00103`–`00117` go to production. Before that deploy and after it, run the scan below. | The gap stays open until the production go-ahead, which is already blocked on the password rotation and the backup/restore evidence. Production has had no photo uploads since August. |
| B. Hotfix on `main`: pause wizard photo uploads in production | A small production change. The wizard accepts a listing without photos and shows a notice, until the 2.0 photo path ships. | It is a production deploy and needs approval. Agents cannot add photos in the meantime. |
| C. Hotfix on `main`: strip metadata on upload | Re-encode the photo before storing it. | Not possible within the $0 limit without the Images binding and processor from the 2.0 stack, so it amounts to shipping part of P0-e early. Not recommended. |

## Recommended steps

1. ~~**Delete the two production orphan files**~~ **Done, 11 Nov.** (`listing-media-public`, 4 Aug 2026 UTC; the inventory above shows the UTC+8 date.) No row, listing or owner refers to them, and they carry no metadata. This is a production data change, so it **needs owner approval**. It would use the service client, delete exactly those two object names, and log the action.
2. ~~**Add the read-only scan to the repo**~~ **Done in #25,** as `packages/db/scripts/scan-public-photo-metadata.mjs`, based on the check used for this inventory. It reports counts only: referenced or orphaned, file type, and EXIF/GPS/XMP present. It prints no paths or identifiers. Run it on production just before and just after the 2.0 photo deploy. This is a gate, not a fix.
3. **Keep the reprocessing backfill designed but unbuilt** (below). Build it only if the scan ever finds a public file with metadata, for example if option A is chosen and agents upload photos in production before 2.0 ships.

## Backfill design (on the shelf)

The script would be `packages/db/scripts/backfill-public-wizard-photos.mjs`. It requires `--env=` and runs on staging first. It defaults to a dry run; `--apply` makes the changes.

**Selection:**
- photo rows whose storage path is in `listing-media-public/`;
- with no provenance row;
- whose file carries EXIF, GPS or XMP. Files that are already clean are skipped, so they cost nothing.

**For each photo, in this order, so a live listing never loses its picture:**
1. Copy the public original into the agent's intake folder as `<agent>/<listing>/src-<hash16>.<ext>`, using the service client and the same naming as 00117.
2. Run the processor's two transforms on that copy through a cron-secret operator task in the hub, because the Images binding exists only in the Worker. The row stays `ready` and keeps showing the old file while this runs.
3. Check from the bytes that each derivative is WebP with no EXIF or XMP. Copy the derivatives to the public bucket. Then, in one update, point `storage_path` at the intake original, point `processed_path` and `thumbnail_path` at the derivatives, and add the provenance row (`agent_upload:wizard`, page `backfill`). Only then delete the old public original. The photo is visible at every step.
4. Audit each photo (`listing.media_backfilled`), plus a summary audit for the run.

**Safety:**
- The run is idempotent: a photo that has provenance or is already clean is skipped.
- It respects the 4,500 cap at 2 transforms per photo, and stops with a "paused" result rather than failing.
- It runs in batches of 25.
- **Rollback:** the original stays in the intake bucket, so a row can be pointed back at it. Nothing is deleted until its replacement has been verified.

**Tests:**
- a staging fixture with a GPS-tagged JPEG in the public bucket;
- after the run, the public file is WebP with no metadata, the listing still shows one photo, and the original is private;
- a second run changes nothing.

## Decisions for the owner

1. **Production orphans:** delete the two files (recommended), or leave them.
2. **The production window:** option A (recommended), B or C.
3. Whether to add the scan script now (recommended, staging-only work) and keep the backfill on the shelf.

## Finding outside this plan: profile photos

The same scan run on production's `agent-profile-public` bucket found 5 files. **2 of them carry EXIF and XMP, with no GPS tag.** These are agents' own profile pictures, not listing photos, and profile uploads do not go through the processor.

They were not changed. Two options:
- route profile uploads through the processor;
- re-encode the 2 files.

Either one is a separate decision for the owner.
