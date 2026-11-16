# Profile photos: cleaning plan

**Status, 11 Nov 2026: both parts done.** The owner approved "Both parts", with the recommended avatar size of one 512 px WebP.
- **Part 2 (production):** done.
  - 2 avatars were re-encoded locally and repointed.
  - 5 superseded files were deleted.
  - 7 audit rows were written.
  - The scan now reports 2 files, both clean, and a live marketplace page serves the new avatars.
- **Part 1:** built in [PR #26](https://github.com/kamalauction-lgtm/agmatchhub/pull/26), stacked on #24, with `00118` on staging only. It passed 16/16 end to end on staging.

## What exists today

**One upload path:** `apps/hub/src/app/(agent)/profile/actions.ts`, called from `updateTrustProfile`.
- It accepts JPEG, PNG or WebP up to 3 MB. It checks only the type the file **claims**, not its bytes.
- It writes the agent's **original file** to the public bucket `agent-profile-public`, as `<uid>/photo-<timestamp>.<ext>`.
- It sets `profiles.avatar_url` to that path.
- The previous avatar is never deleted, so every past upload stays public.

**Storage policies (00002):** the "profile media owner write" and "profile media owner update" policies let a signed-in agent write to their own folder **directly** through the Storage API, without going through the action. A fix in the action alone is therefore not a guarantee.

**Where avatars are shown:**
- in the Hub: the shell, the profile page, partners, cards, and shared request pages;
- in the public marketplace (`apps/www`), through `public_*` views (`agent_avatar_url`, 00076).

So a profile photo is as public as a listing photo.

## Production inventory (read-only, 11 Nov)

| | Count |
|---|---|
| Profiles | 9 |
| Profiles with an avatar | 2 |
| Files in `agent-profile-public` | 5 |
| Files that are a current avatar | 2 |
| Old files no profile refers to | 3 |
| **Files carrying metadata** | **2**, the same 1.2 MB PNG uploaded twice (one copy is a current avatar) |

**What that metadata holds.** Only tag *names* were inspected here, and none of the values are reproduced in this plan.
- **EXIF:** only basic image tags (orientation, resolution, colour space, dimensions). **No camera, no date taken, no GPS.**
- **XMP:** the export was made with Canva. It carries a design title, an author field, the Canva document and account identifiers, and advertising-attribution fields.

This is low severity: there is no location, and the file is the agent's own chosen avatar. But it does expose the agent's design-account identifiers and an author name in a public file, which the platform should not publish.

The other 3 files are 5.5 KB PNGs with no metadata. One is a current avatar; 2 are old uploads.

Staging's `agent-profile-public` bucket is empty.

## Part 1: the upload fix (build, stacked on #24)

This is the same principle as P1-b-3: **the agent's original never becomes public.**

1. **Clean on upload, synchronously.** Avatars must show straight away, so they cannot wait for the 15-minute processor.
   - The action reads the bytes and checks them with `sniffImage` (JPEG, PNG or WebP, up to 3 MB).
   - It re-encodes the photo through the Worker's existing Cloudflare Images binding into **one WebP derivative**, 512 px on the long side. That is one transform per upload.
   - It checks the derivative's bytes: it must be WebP with no EXIF or XMP (`metadataFound`).
   - It stores **only the derivative**, as `<uid>/avatar-<hash16>.webp`. The original is never stored anywhere.
2. **Stay within the $0 cap.**
   - Before transforming, the action checks `media_processing_usage_now()`, and afterwards it counts the transform with `media_processing_usage_add(1)`. These are the same 4,500 counter and functions the listing processor uses.
   - At the cap, or if the binding is missing, the upload is **refused** with a clear message ("Photo upload is paused, try again later"). The raw file is never stored as a fallback.
3. **Writes only through the action.** A migration (`00118_profile_photo_writes`):
   - drops the "profile media owner write" and "owner update" storage policies, so agents can no longer write to the public bucket directly;
   - the action stores the cleaned derivative with the service client, but only after authenticating the user, and only at `<auth uid>/avatar-…`;
   - adds a `BEFORE UPDATE` trigger on `profiles` (no self-subquery, per hard rule 4). It refuses an `avatar_url` that is not null and not `<own uid>/avatar-<hash16>.webp`, unless the caller is the service role. Today an agent can point their avatar at any path.
   - **This migration and the new action must ship in the same deploy.** Dropping the policies before the new code is live would break profile photo uploads.
4. **The previous avatar is deleted on replace**, using the service client and only within the agent's own folder. The upload is audited (`profile.avatar_updated`) with the old and new paths.
5. **Copy:** the profile page hint says the photo is resized and its hidden data removed (en, id, ms).

**Tests:**
- RLS:
  - an agent can no longer insert or update in `agent-profile-public` (negative);
  - the trigger refuses a foreign or invalid `avatar_url` (negative);
  - the service role can still write.
- End to end on staging:
  - upload a synthetic JPEG with GPS EXIF and a Canva-like XMP block; the public file is a 512 px WebP with no metadata, and the original is nowhere;
  - a second upload removes the first file;
  - a disguised non-image is refused;
  - at the cap, the upload is refused and nothing is stored.
- `scan:photos:staging --bucket=agent-profile-public` reports clean.
- **Regressions:** the avatar still shows in the Hub shell and profile page, partners, cards and shared request pages, and on www agent and listing pages.

## Part 2: cleaning the existing production files (separate approval)

This can run **now**, independently of the 2.0 stack and at no cost. It would be a one-off script using `sharp` locally, which strips metadata by default and makes no Images transforms. It is a production data change, so it needs its own approval.

1. A dry run, with guards. It proceeds only if exactly 5 files exist, exactly 2 current avatars match, and exactly 3 old files match. Otherwise it stops.
2. For the **2 current avatars**:
   - download, re-encode to a 512 px WebP with no metadata, and check the bytes;
   - upload as `<uid>/avatar-<hash16>.webp`;
   - point `avatar_url` at it.

   One of the two is already clean but is converted too, so that both match the new path rule in Part 1.
3. Delete the **3 old files** and the 2 replaced originals: 5 deletions in all.
4. Audit each change (`profile.avatar_cleaned` and `storage.orphan_removed`), giving the reason and the plan's name.
5. **Check afterwards:**
   - the scan reports `agent-profile-public` as 2 files, both clean;
   - both avatars load on the Hub and on www.

**Order:** Part 2 can come before Part 1. Until Part 1 ships, a new upload could reintroduce metadata; the scan would show it, and the script can be re-run.

## Decisions for the owner

1. **Part 1:** build the upload fix, stacked on #24, staging only (recommended).
2. **Part 2:** clean the 2 production avatars and delete the 5 superseded files now (recommended), or wait for the merge.
3. **Avatar size:** one 512 px WebP (recommended: 1 transform per upload), or two sizes (512 and 128: 2 transforms per upload).
