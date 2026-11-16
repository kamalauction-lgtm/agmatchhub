# P0-e-2 photo processor: comparison and recommendation (read-only)

Prepared 10 Nov 2026.

**Status:** option A is approved and built as P0-e-2a in [PR #16](https://github.com/kamalauction-lgtm/agmatchhub/pull/16), stacked on #15. **It is staging-validated at `0c87b6b`, with CI green (11 Nov 2026).** The approved budget stays at the Free plan with a $0 cap.
- Migrations `00109` and `00110` are on staging only.
- The staging Hub runs version `7ef827b5…`, with the `IMAGES` binding.
- The end-to-end checks pass 18/18.
- Nothing has been purchased: this is the Images Free plan.

**Holds that stay in place:**
- `import_photos` stays off for real agents until counsel decides photo rights (P0-c).
- P0-c and P0-d-2 are on hold.
- Production migrations and any processor purchase need separate approval.

## What the processor must do

Turn a **private original** in `listing-media-intake` (P0-e-1a, PR #15) into **listing-ready images** with GPS and all other EXIF, XMP and IPTC metadata removed. The original never becomes public, and a failed job never changes the listing.

## Current hosting

| Piece | Where | Evidence |
|---|---|---|
| The Hub | Cloudflare Workers, deployed through OpenNext. The staging Worker uploads 12.7 MiB (2.6 MiB gzip) and already runs cron triggers (`*/15 * * * *`, `0 23 * * *`). | `apps/hub/wrangler*.jsonc`, staging deploy log |
| Workers plan | **Assumed to be Paid**: the Free plan's 10 ms CPU limit per request cannot run this app. **Please confirm in the Cloudflare dashboard.** | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Storage and database | Supabase (Pro), buckets `listing-media-intake` (private) and `listing-media-public` (public) | migrations `00036`, `00108` |

## Verified pricing (official pages, read 10 Nov 2026)

- **Cloudflare Images transformations:**
  - 5,000 unique transformations a month are free.
  - On the Paid plan, beyond that: **$0.50 per 1,000 unique transformations a month**.
  - A unique transformation is one source plus one set of parameters, counted once per calendar month. `format` and `quality` don't create new ones.
  - On the **Free plan, new transformations past 5,000 are not billed. They fail with error `9422`.**
  - Storage ($5 per 100,000 images) and delivery ($1 per 100,000) apply only to images stored in Cloudflare Images. This design doesn't store images there.
  - Source: [Images pricing](https://developers.cloudflare.com/images/pricing/).
- **The Images binding for Workers** (`env.IMAGES`):
  - accepts raw bytes up to 20 MB from any source;
  - `.transform({ width })` then `.output({ format })`;
  - billed as unique transformations.
  - Source: [Images binding](https://developers.cloudflare.com/images/transform-images/bindings/).
- **Metadata:** for JPEG output the default is `copyright`, and `none` removes all EXIF. **For WebP and other non-JPEG output, Cloudflare says all metadata is always discarded.** Rotation and colour profile are still applied. Source: [Transform via URL, the `metadata` option](https://developers.cloudflare.com/images/transform-images/transform-via-url/).
- **Workers Paid:**
  - $5 a month minimum;
  - 10 million requests and 30 million CPU-ms included, then $0.30 per million requests and $0.02 per million CPU-ms;
  - a cron run gets up to 30 s of CPU when the interval is under an hour;
  - Queues: 1 million operations included, then $0.40 per million.
  - Source: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
- **Supabase Storage image transformations:**
  - Pro includes 100 origin images, then **$5 per 1,000 origin images**;
  - output up to 2,500 px, input up to 25 MB and 50 MP;
  - works with private buckets through signed URLs.
  - **The docs don't say whether metadata is stripped.**
  - Source: [Supabase image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations). Supabase uses imgproxy, which can purge metadata ([imgproxy features](https://imgproxy.net/features)), but I couldn't confirm that Supabase enables it.

## The options

| | A. Cloudflare Images binding in the Hub Worker (**recommended**) | B. Supabase image transformations | C. Image codec running inside the Worker (WebAssembly) |
|---|---|---|---|
| How it works | A cron job reads the private original with the service role, pipes it through `env.IMAGES`, writes the WebP derivatives to storage | Images are transformed when someone views them, from the stored original | A cron job decodes, resizes and re-encodes with a WebAssembly library such as jSquash or wasm-vips |
| GPS and metadata removal | **Guaranteed by the documented WebP behaviour**, and checked by our own byte test (below) | **Not documented.** We would have to test it, and Supabase could change its setup without notice. | Guaranteed, because the image is re-encoded from pixels |
| Original stays private | Yes. Only the derivatives are written out. | **No, in practice.** www reads anonymously and cannot sign URLs for a private bucket, so the original would have to sit in the public bucket. | Yes |
| Retries and failed jobs | Runs as a job: per-photo attempts, backoff, a `failed` state. Over-quota (`9422`) is treated as "paused", not as a failure. | No job exists. A failure shows up when someone views the image, so it can't be retried or marked failed. | Runs as a job, but memory and CPU limits kill the isolate on large photos (a 12 MP decode is about 48 MB of pixels), so failures repeat |
| Engineering effort | Small: one binding plus a cron handler | Small, but it fails the privacy requirement | Large: bundling the codec, tuning memory, more risk of slow startup |
| Hard spending cap | **Yes, if it stays on the Images Free plan** (stops at 5,000 a month); a budget alert on Paid | No per-call cap; it is billed per origin image | CPU overage only |

**Option B is disqualified.** It can't keep the original private and doesn't document metadata removal.

**Option C is the cheapest on paper** but the riskiest to operate. Keep it as a fallback.

**Not compared:** external processors such as Cloudinary or imgix. They would add a new vendor that receives agents' original photos, along with that vendor's data-processing terms, which is a counsel question in itself.

## Estimated monthly cost

**Assumptions** (planning inputs, not measured KPIs):
- **A** averages 10 photos per listing (the importer's cap is 12).
- **A and C** produce **2 derivatives per photo**: a 1600 px listing image and a 400 px thumbnail. That is 2 unique transformations per photo.
- **A:** retries of the same photo with the same parameters in the same month are not billed again.
- **C:** about 1.5 s of CPU per photo, which **must be measured before relying on it**.
- **B:** one origin image per photo.
- Supabase storage and egress for the derivatives fall inside the current Pro plan's allowance (about 0.45 MB per photo).
- The Workers Paid $5 base is **already being paid** for the Hub, so it isn't counted again.

| Volume | Photos a month | A. Cloudflare Images | B. Supabase transforms | C. Codec in the Worker |
|---|---|---|---|---|
| Pilot: 200 listings | 2,000 → 4,000 transformations | **$0** (within the 5,000 free) | $9.50 | $0 (3M CPU-ms, within the 30M included) |
| Rollout: 2,000 listings a month | 20,000 → 40,000 | **$17.50** (35,000 × $0.50 per 1,000) | $99.50 | $0 (30M CPU-ms, at the included limit) |
| Larger: 10,000 listings a month | 100,000 → 200,000 | **$97.50** | $499.50 | $2.40 (150M − 30M CPU-ms × $0.02 per million) |

## Recommendation

**Option A: the Cloudflare Images binding, called from a cron job in the existing Hub Worker.**

For the pilot, stay on the **Images Free plan**. That needs no purchase, and it is a hard stop at **5,000 transformations a month**, which is **$0 a month** and about 2,500 photos.

**Pilot spending cap for approval:** $0 on the Free plan, with the processor holding photos as "processing paused" when it reaches 4,500 a month. This applies **only** if you later move to the Paid plan for rollout, which is a separate purchase decision: a **budget alert at $10** and a **cap of $25 a month**, enforced in code as about 55,000 transformations a month.

## Proposed flow

1. **Intake (P0-e-1a, built):** the original is in the private `listing-media-intake` bucket, and `listing_media.processing_state = 'pending'`.
2. **Processing (P0-e-2a):** the cron job runs every 15 minutes in the Hub Worker, using the service role with no user session.
   - It claims up to 20 pending intake photos with a lease (`processing`, `processing_started_at`). Leases older than 10 minutes are claimed again.
   - For each photo: read the original, then `IMAGES.input(original).transform({ width: 1600 }).output({ format: "image/webp", quality: 82 })`, and the same at 400 px.
   - Check each derivative from its bytes: it must be WebP and contain no `EXIF` or `XMP` chunk.
   - Write the derivatives to **`listing-media-intake/derived/<agent>/<listing>/<media>-{1600,400}.webp`**. They stay private.
   - Record `derived_path`, `derived_thumb_path`, width and height, and set the state to **`processed`**.
   - Count transformations against the monthly cap. At the cap, set the state back to `pending` with the reason "paused".
   - On error, increase `processing_attempts`, store `processing_error`, and back off (15 min, then 1 h, then 6 h). After 3 attempts the photo becomes **`failed`**.
   - **The listing's status and other fields are never written.**
3. **Moderation:** the moderation queue shows the processed derivatives through short-lived signed URLs, limited to moderators of that country (the `can_moderate_agent_folder` rule from `00108`). The moderator can also quarantine an individual photo.
4. **Publication:** when a listing is approved, its `processed`, non-quarantined photos are **copied** to `listing-media-public`, and `processed_path`, `thumbnail_path` and `ready` are set. That runs as part of the same moderation action, on the operator path. The public views already show only `ready` photos of published, approved listings. **The original is never copied.**
5. **Retention, a decision for later:** how long to keep originals after publication (for provenance) is a counsel and data-protection question, so nothing is deleted automatically.

Two schema changes would be needed:
- `listing_media.processing_state` gains `processed`;
- `listing_media` gains `derived_path`, `derived_thumb_path`, `processing_attempts`, `processing_error` and `processing_started_at`.

## Tests (synthetic images only)

1. **No GPS in the public derivative:**
   - feed in a synthetic JPEG with a GPS EXIF block, plus a synthetic PNG with an `eXIf` chunk;
   - both derivatives are WebP, parsed chunk by chunk, with **no `EXIF` or `XMP` chunk**;
   - a raw byte search finds no `Exif\0\0` marker and no GPS IFD tag `0x8825`;
   - run against the staging Images binding and recorded per run.
2. **The original stays private:**
   - before approval, the original's and the derivatives' public URLs are not readable, and anonymous and other-agent signed URLs are refused;
   - after approval, the public derivative URL returns 200, while the original's public URL still does not.
3. **A failed job leaves the listing intact:**
   - a corrupt synthetic file (a JPEG header followed by random bytes) fails three times, with backoff, and ends `failed` with its reason;
   - the listing's status, price and other photos are unchanged, the other photos process normally, and the listing can still be moderated and published without the failed photo;
   - the agent sees "this photo could not be processed, please upload a replacement".
4. **Quota pause:** a mocked `9422` from the binding leaves the photo `pending`, marked paused, with no failed attempt counted.
5. **No double processing:** two overlapping cron runs process each photo once, thanks to the lease. Re-running produces no duplicate derivatives.
6. **No shortcuts:** an agent session can't set `processed` or `ready` (the `00108` guard). Only the operator path can.
7. **Moderator scope:** a MY moderator can sign MY derivatives but not ID ones.
8. **Orientation:** a synthetic JPEG with an EXIF orientation tag produces a correctly rotated derivative, even though the metadata itself is gone.
9. **Cap:** with the cap set to 3 in the test, the fourth photo waits as paused.
10. **Regression:** P0-a, P0-b, P0-d-1 and P0-e-1a checks still pass.

## Decision needed

**Approve Option A for a staging build, P0-e-2a.** That means:
- the Cloudflare Images binding on the Hub Worker, on the **Images Free plan**, with no purchase;
- the processing cron, private derivatives, and copying to the public bucket at approval;
- the pilot cap: **$0 a month**, paused at 4,500 transformations;
- **confirming in the Cloudflare dashboard that the account is on Workers Paid.**

Separately, and not needed now:
- moving to Images Paid for rollout, with a $25 cap and a $10 alert;
- the retention period for originals;
- routing the agent wizard's own uploads, which today go to the public bucket unprocessed (`00036`), through the same processor.
