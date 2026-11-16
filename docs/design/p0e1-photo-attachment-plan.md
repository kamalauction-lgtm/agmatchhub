# P0-e-1 photo attachment: plan (read-only)

Prepared 10 Nov 2026 from:
- the media-handoff proposal (`admin-platform-2.0-review-and-proposal.md`, "Media handoff", D5);
- the P0-d-1 flow in PR #14 (`97af7d2`, staging-validated).

**Status:** P0-e-1a is approved and built in [PR #15](https://github.com/kamalauction-lgtm/agmatchhub/pull/15), stacked on #14.
- `00108` is on staging only.
- The staging Hub runs version `88248e0f…`.
- On staging, the `import_photos` flag is on only for `TEST_MYA`.

**P0-c and P0-d-2 stay on hold.**

## Where photos are lost today
1. The portal adapters put up to 12 photo URLs in `import_items.extracted.imageUrls` (`lib/import/adapters.ts:254–390`).
2. The agent's commit merges them into `src` (`commit-actions.ts:127`) and creates the listing (`:190`).
3. It then marks the item imported (`:212`) **without reading `src.imageUrls`**.

Spreadsheet imports carry no photo URLs, because the template has no photo columns. Admin-prepared batches built from links carry them exactly as agent batches do.

## Facts the design must respect
| Fact | Evidence | Consequence |
|---|---|---|
| The only listing-media bucket, `listing-media-public`, is **public**, with no read policy | `storage.buckets` on staging; `M/00036` | Anything stored there can be fetched by anyone who has the link, whatever its processing state. **Imported originals must not go there** until EXIF and GPS are stripped (P0-e-2). |
| `listing_media` lets the owner write any column, including `processing_state` | the `listing media owner` (ALL) policy | An agent's session could mark a photo `ready`. Imported photos must be written through a function that fixes `pending`. |
| `listing_media_source` is admin-only (`admin_sees_media`) | staging `pg_policies` | The agent cannot write provenance directly. It needs a SECURITY DEFINER function that checks ownership. |
| Only `ready` media is public | `public_listings` / `public_listing_media` (`00031`, `00076`) | `pending` photos never appear on www or in Studio. That is safe, and it is also why P0-e-1 alone shows the public nothing. |
| The commit already runs only as the batch's agent, in the agent's session | D15 fix in PR #14 | Ownership is settled before any photo is touched. |

## Design

**1. When photos attach: after the commit, not inside it.**

The commit stays exactly as it is in #14: it creates the listings, then marks each item `media_state = 'pending'` if it has `imageUrls`.

The agent's batch page then works through those items one at a time, the same way it processes items today. For each item it calls `attachItemPhotos(itemId)`. That way:
- no single request fetches more than one item's photos, which keeps within Workers time limits;
- a slow or broken image delays only one item;
- the listing import has already succeeded before any photo is fetched, so **a photo can never fail the import**.

**2. Ownership and country scope.**
- The **ownership check** happens inside `attachItemPhotos`, which runs in the agent's own session. It requires that the item's batch belongs to the caller (`batch.agent_id = auth.uid()`, the D15 rule) and that the item has a `listing_id` the caller owns (`owns_listing`).
- The **database write** goes through one SECURITY DEFINER function, `attach_import_photo(p_item, p_storage_path, p_content_hash, p_image_url, p_width, p_height, p_bytes)`. It checks the same two things again, then inserts:
  - one `listing_media` row with **`processing_state = 'pending'`** and `kind = 'image'`. The first photo stored becomes the cover only if the listing has no cover yet; the existing one-cover index decides.
  - one `listing_media_source` row: `page_url`, `image_url`, `content_hash`, `licence_note` and the consent id (point 4).
- **Storage:** a new **private** bucket, `listing-media-intake`, with:
  - JPEG, PNG and WebP only, 10 MB each;
  - writes only into the uploader's own folder (`<agentId>/…`), the same rule as the other buckets;
  - reads by the owner, and by admins holding `listing.moderate` for the listing's country (the `can_review_agent_folder` pattern from `00104`).

  P0-e-2 later strips EXIF and GPS, writes the processed copy to `listing-media-public`, and sets `ready`.
- **Country scope:** no new country field. The photo inherits the listing → property → agent country. Admin reads of `listing_media` and `listing_media_source` already follow the scope rules from `00105`. **Admins write nothing in P0-e-1.**

**3. Fetching, with the rules we already have.**
- Each URL goes through `assertSafeUrl` and `safe-fetch`: no private addresses, every redirect checked, a hard timeout.
- Only these responses are accepted: `image/jpeg`, `image/png` or `image/webp`, at most 10 MB, with the type confirmed from the file's own first bytes.
- A URL that `isPropertyPhoto` would reject (share cards, logos, watermark paths) is skipped and recorded, never altered.
- A page that blocks automated reading, or demands a CAPTCHA or login, is recorded as `blocked` and **never retried another way**.

**4. Permission and consent evidence recorded per photo.**

Each `listing_media_source` row holds:
- `page_url`: the listing page the photo was found on;
- `image_url`;
- `content_hash`: the SHA-256 of the bytes;
- `downloaded_at`;
- `licence_note`: a short basis code.

It also gains `consent_record_id`, pointing at the agent's acceptance for that batch. Today that acceptance is `listing_import_authority`, which the agent gave personally when they committed.

**Whether that declaration covers copying photos is a counsel question, not a design choice** (P0-c, the proposed `listing_photo_rights` declaration and Q7). The design records the evidence either way. Only the declaration it points at, and the go-live switch, depend on counsel.

**5. Retries without duplicates.**
- **Storage key from the bytes:** `<agentId>/<listingId>/src-<first 16 hex of sha256>.<ext>`, uploaded with `upsert: false`. A retry finds the object already there, treats "already exists" as success, and reuses the path.
- **Database:** a new `listing_media_source.listing_id` column (filled from `listing_media`; the table has 0 rows on staging) and a **unique index on `(listing_id, content_hash)`**. `attach_import_photo` uses `on conflict do nothing` and returns the existing row, so the same photo can never be recorded twice on one listing, even when two portals serve it from different URLs.
- **Per item:** `import_items` gains `media_state` (`none | pending | done | partial | failed`), `media_saved`, `media_attempts` and `media_errors` (a list of `{url_hash, reason}`, never the full URL). A retry processes only items not in `done` and skips hashes the listing already has.

**6. How a failure is reported and retried.**
- The listing exists whatever happens to its photos.
- Each item shows **"8 of 12 photos saved"** together with the reasons for the rest: blocked by site, not an image, too large, timed out, not a property photo, or the source returned an error.
- **Retry photos** appears per item and for the whole batch. It re-runs only what failed, and the attempt counter rises.
- After 3 attempts an item settles at `partial` or `failed`, and the message points the agent to upload their own photos instead.
- Each run is audited as `listing_import.photos_attached`, with the actor (the agent), the item, and the saved and failed counts.

## What can be prepared now, and what waits

| Work | Status |
|---|---|
| Private bucket `listing-media-intake` and its policies | **Can be prepared now**, with owner approval to build |
| `listing_media_source.listing_id`, `consent_record_id` and the unique `(listing_id, content_hash)` index | Now |
| `import_items` media columns; the `attach_import_photo` function | Now |
| `attachItemPhotos`, the batch-page progress, retry and messages (en, id, ms) | Now |
| Tests with synthetic images on staging | Now |
| A feature flag `import_photos` (off by default, through `feature_flags`) that gates `attachItemPhotos` | Now |
| **Turning `import_photos` on for real agents** | **Waits on counsel**: does the import authority cover copying the agent's own portal photos, or is `listing_photo_rights` needed (P0-c), and which sources may be copied (Q7) |
| Making any imported photo public: EXIF and GPS strip, resize, thumbnails, phash, `ready` | **P0-e-2**, which needs your choice of image processor and budget |
| The partner ingest route's broken photo paths (D6) | A separate fix; the same function could serve it later |
| An admin attaching photos for the agent | Not in P0-e-1; it follows P0-d-2, which is on hold |

## Smallest testable slice: P0-e-1a, "private intake with provenance, behind a flag"

It covers only:
- the private bucket;
- the schema additions;
- `attach_import_photo`;
- `attachItemPhotos`, the batch-page progress and retry;
- the `import_photos` flag, **on only for named staging test accounts**.

Photos stay `pending` and private, so nothing new becomes public.

**Acceptance tests.** These are database tests plus HTTP checks against the staging Hub. All images are **synthetic**: generated in the test, uploaded to a fixture folder in the staging public bucket so they have a real public URL, and removed afterwards.

1. An agent commits a link-based batch whose items point at 3 synthetic images. The listings are created first. `attachItemPhotos` then saves 3 `listing_media` rows (`pending`, the first as cover), 3 `listing_media_source` rows (with hash, page URL and consent id), and 3 objects in `listing-media-intake/<agentId>/<listingId>/`.
2. A **synthetic JPEG carrying a fake GPS EXIF tag** is stored only in the private bucket. Its object URL is not readable anonymously, and it does not appear in `public_listing_media` or `public_listings.media_count`.
3. Running `attachItemPhotos` a second time on the same item, and a re-run after a forced mid-run failure, add **no** extra `listing_media`, `listing_media_source` or storage objects.
4. The same synthetic image served from two different URLs becomes one photo on the listing.
5. Failures are recorded and do not fail the listing:
   - an HTML URL → `not_image`;
   - a 404 → `source_error`;
   - an 11 MB synthetic image → `too_large`;
   - a private address → refused by `safe-fetch`;
   - a share-card path → `not_property`.

   The listing still exists, `media_state = 'partial'`, and the reasons are listed.
6. **Retry** re-processes only the failed URLs, and after 3 attempts the item settles with the "upload your own" message.
7. Ownership and scope are refused for everyone but the owning agent:
   - another agent calling `attach_import_photo` or `attachItemPhotos` for the item → `42501`;
   - the preparing admin → refused;
   - writing to `listing_media_source` directly → refused for an agent;
   - an agent setting their imported photo to `ready` through `attach_import_photo` → impossible.
8. A MY `country_admin` holding `listing.moderate` can read MY intake photos and not ID ones. `compliance_admin` follows its `listing.moderate` scope.
9. With the flag **off**, nothing is fetched. Items stay `media_state = 'pending'`, and the batch page says photos are not enabled yet.
10. The audit row `listing_import.photos_attached` records the agent as actor, with saved and failed counts.
11. P0-a, P0-b and P0-d-1 checks still pass. Agent self-import without photos behaves as today.

## Decision needed before implementation

**Approve P0-e-1a as above, built and validated on staging with the `import_photos` flag on only for staging test accounts.** It adds a private intake bucket (a new storage bucket on staging, and on production only when you approve those migrations) and stores photos only as private and `pending`.

Two later gates are noted here and need nothing from you now:
- turning the flag on for real agents waits for counsel's answer on photo rights;
- making photos public waits for your P0-e-2 processor and budget decision.
