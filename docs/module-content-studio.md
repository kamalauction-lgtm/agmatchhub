# Module design — Content Studio

*Design v1, 10 Aug 2026. Phase 1 (WhatsApp + caption, §3 items 1–2) built
10 Aug 2026 — `/studio` picker, `/studio/[listingId]` workspace, writer exports
`writeWhatsappBroadcast` / `writeSocialCaption` / `suggestHashtags`, data layer
in `apps/hub/src/lib/studio/listings.ts`. Story/feed images (§3 item 3) built
11 Aug 2026 — client-canvas posters (`poster-canvas.tsx`), 1080×1080 +
1080×1920, cover photo + badge/price/place/specs/agent, PNG download and
native share-with-file; text-only fallback when the listing has no cover.
Direct publishing & scheduling added same day (§8). Brochure (§3 item 4) built
11 Aug 2026 as a print view — `/studio/[listingId]/brochure`, gallery + specs +
agent card, browser Print/Save-as-PDF, copy in the listing's language. **All
four §3 outputs are now live.** Building it surfaced and fixed a platform bug:
`i18n/request.ts` ignored explicitly requested locales, so every
`getTranslations({locale})` call silently served the cookie language.*

## 1. What it is

Kamal's brief, from the dashboard card that has said "coming soon" since the
platform reframe: **"Ubah satu listing jadi postingan, caption, dan brosur"** —
turn one listing into posts, captions and a brochure.

An agent has a listing. They need to be present on WhatsApp, Instagram and
Facebook today, and they are not a copywriter or a designer. The studio takes
what the platform already knows about a property and produces the assets, in
their language, ready to send.

## 2. What already exists — build on it, do not rebuild

This is most of the work, already done and verified:

| Piece | Where | What it gives us |
|---|---|---|
| Deterministic copy generator | `apps/hub/src/lib/ai/listing-writer.ts` | Headline, hook, spec bullets, facilities, price, location, urgency, contact block — no API key needed |
| Advice rules | `apps/hub/src/lib/ai/listing-advisor.ts` | Title length, ALL CAPS, spam words, missing landmark, phone-in-body detection |
| Share caption + channels | `shareCaption()`, `SharePanel` | WhatsApp / Telegram / Facebook / copy, already on the listings page |
| Listing facts | `public_listings` | Title, price, specs, location, cover image, agent |
| Poster precedent | `win-poster-module` (Indonesia app) | A working example of server-rendered image output |

**The studio is a new surface over existing generators, not a new AI stack.**
The first version should add no model dependency at all.

## 3. Outputs, in the order they earn their place

1. **WhatsApp broadcast text** — the single most-used channel in this market,
   and the one the platform already commits to (`whatsapp-only-messaging`).
   Short, emoji-structured, link at the end.
2. **Instagram / Facebook caption** — longer, hashtag block, line breaks that
   survive the paste.
3. **Story / feed image** — 1080×1080 and 1080×1920, cover photo plus price,
   location and the agent's name.
4. **One-page brochure (PDF)** — gallery, specs, agent card. The thing agents
   currently make badly in Canva.

Ship 1 and 2 first. They are text, they need no rendering pipeline, and they
cover the channel that matters most. 3 and 4 are a second phase.

## 4. Design rules this module must not break

1. **Never invent a fact.** The copy generator may rearrange, emphasise and
   translate what is in the listing. It may not add a school, a travel time, a
   view or a yield that is not in the data. `listing-writer.ts` already works
   this way — urgency lines are true by construction — and that property is the
   reason the output is safe to send to a client.
2. **The agent edits before anything leaves.** Generated text is a draft in a
   textarea, never auto-posted and never sent on the agent's behalf.
3. **No phone numbers in generated body text.** The advisor already flags this:
   a number in the copy bypasses lead capture and the response SLA. The studio
   generates the CTA, not a bypass.
4. **Borrowed listings are the marketing agent's to promote**, and the assets
   must carry the borrower's contact and the borrower's landing-page link — the
   same contact swap as the agent landing page. Getting this wrong sends the
   original agent's details out under someone else's name.
5. **All strings in `messages/*`, all three locales.** The output language
   follows the listing's `language` column, not the UI locale — an agent
   browsing in English still wants Indonesian copy for an Indonesian buyer.

## 5. Shape

```
/studio                     pick a listing (own + borrowed, same source as
                            the agent landing page: public_agent_listings)
/studio/[listingId]         the workspace
```

The workspace is tabs over one listing:

- **WhatsApp** — generated text, editable, character count, "Send on WhatsApp"
  (reuses `SharePanel`'s wa.me handoff)
- **Caption** — longer form, hashtag suggestions derived from property type,
  city and category. Hashtags come from data, not from a model.
- **Images** *(phase 2)*
- **Brochure** *(phase 2)*

Each tab: **Generate** → editable draft → **Copy** / **Share**. No save needed
in v1; if agents ask for saved drafts, that is a `content_drafts` table later,
not now.

## 6. What NOT to build in v1

- No scheduling or auto-posting. That needs platform API credentials, review
  processes and a queue, and it converts a helpful tool into an outbound
  messaging system with compliance obligations.
- No LLM call. The deterministic writer already produces good Indonesian copy.
  Add a model later for voice variation, behind a flag, with the deterministic
  version as the fallback — the same pattern as the listing wizard's AI step.
- No analytics on shares. `whatsapp_clicks` already exists on the listing stats
  if that question comes up.

## 7. Where to start

`apps/hub/src/app/(agent)/studio/page.tsx`, a listing picker reading
`public_agent_listings` filtered to the current agent — the query is already
written in `apps/www/src/lib/listings.ts` (`getAgentListings`) and needs porting,
including its **agent-field rewrite for borrowed listings**, which is the part
that is easy to miss and expensive to get wrong.

Then the WhatsApp tab, calling `listing-writer.ts` with a new `whatsappBroadcast`
export alongside the existing description generator.

The dashboard card at `apps/hub/src/app/(agent)/dashboard/page.tsx` becomes a
`ModuleCard` pointing at `/studio` — replacing the `SoonCard`, exactly as the
co-marketing and landing-page cards were.

## 8. Direct publishing & scheduling (added 11 Aug 2026)

Built as a revision of §6's "no auto-posting": posting is still never
automatic *on the platform's initiative* — a queue row exists only because the
agent pressed **Schedule** on a caption they edited, and the publisher sends
that text unmodified. Three layers:

1. **Intents & the native share sheet** (live for everyone, no setup):
   WhatsApp/Telegram/X prefill; Instagram and Facebook block prefilled text by
   policy, so those buttons copy the caption first, then open the app. On
   phones, `navigator.share` opens the OS share sheet into any installed app.
2. **Scheduling queue**: migration `00052` — `social_accounts` (metadata,
   owner-readable), `social_account_secrets` (page tokens, RLS with **no
   policies** — service role only), `scheduled_posts` (owner schedules and
   cancels; the publisher claims rows with a conditional update, so
   overlapping sweeps cannot double-post). UI: schedule panel on the caption
   tab, `/studio/scheduled` queue, `/studio/accounts` connections.
3. **Publisher**: `POST /api/social/publish-due` guarded by
   `SOCIAL_CRON_SECRET`, called every few minutes by an external cron (a
   one-line Cloudflare cron worker, or curl for testing). FB Pages get a
   photo/feed post; IG Business gets container → publish. IG **requires** a
   public image URL — enforced at schedule time, in the UI, and at publish.

### What Kamal must do before real publishing works

1. Create an app at **developers.facebook.com** (type: Business), add
   **Facebook Login for Business**.
2. Set OAuth redirect URI: `https://hub.propertiguru.id/api/social/oauth/callback`.
3. Request via App Review: `pages_show_list`, `pages_read_engagement`,
   `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`,
   `business_management` — needs Business Verification and a screencast of the
   connect + schedule flow.
4. `wrangler secret put META_APP_ID / META_APP_SECRET / SOCIAL_CRON_SECRET`.
5. Point a cron at the publish endpoint (5-minute interval is plenty).

Until then the connect page explains itself and everything else works. Meta
constraint worth remembering: only **FB Pages** and **IG Business/Creator
accounts linked to a Page** can be published to via API — personal profiles
cannot, and no platform can grant that.
