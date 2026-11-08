# Changelog

## 2026-09-13 — Server-to-server listing ingest (IQI AG Hero)

- `POST /api/listings/ingest` (`src/app/api/listings/ingest/route.ts`): Hero sends an approved agent listing and it becomes a
  DRAFT here — `properties` → `property_private` → `listings` exactly like the import module, `creation_source = 'api'`
  (provenance only), `property_imports` row keyed on `source_url` so a re-send updates the same draft, photos copied into
  `listing-media-public/<agent>/…` with the first as cover, `log_audit('listing.ingested')`. Gated by the shared secret
  `LISTING_INGEST_SECRET`; drafts belong to the verified company profile in `LISTING_INGEST_AGENT_ID` (body `agent_id` may
  override, must be `verified`). Never publishes. Tested end to end from Hero (13 checks) — see
  `ag-warriors-superapp/tools/test_pi_portal_id.py`.

## v1 — Phase 1 foundation (18 Jul 2026)

- Next.js 16 + TypeScript + Tailwind v4 scaffold; Supabase wired
- Migration 00001: roles/user_roles + authz helper fns, profiles +
  users_private (auto-provisioned on signup), append-only audit_logs,
  languages/currencies/countries (MY/ID/AE) seeds, brand_settings +
  brand_assets — RLS on all tables
- Auth: register / verify-email / login / logout / forgot / reset;
  Next 16 `proxy.ts` session refresh + route protection (verified E2E)
- i18n: EN / BM / ID via next-intl (cookie locale)
- Brand system (spec §70): central config, AG monogram extracted from banner
  (dark + light variants), wordmark SVGs, favicon + PWA icons; IQI logo
  placeholder pending official file
- Audit service wrapper, migration runner, CI workflow, repo docs

## Content Studio v1 (10 Aug 2026)

- New `/studio` module (docs/module-content-studio.md): pick a listing →
  generated WhatsApp broadcast + Instagram/Facebook caption, editable before
  anything leaves. Phase 2 (images, brochure) not started.
- `listing-writer.ts` gains `writeWhatsappBroadcast`, `writeSocialCaption`,
  `suggestHashtags` — deterministic, no model, no invented facts; copy follows
  the listing's `language` column (id/en)
- `lib/studio/listings.ts` ports the landing-page query (`public_agent_listings`)
  with the borrowed-listing rewrite: borrowed assets carry the borrower's
  landing-page link, never the marketplace page that names the original agent
- Dashboard card flips from SoonCard to live module; Studio added to nav;
  strings in en/id/ms

## Content Studio v2 — share everywhere + scheduled publishing (11 Aug 2026)

- Caption tab gains one-tap distribution: native share sheet on phones
  (navigator.share → IG/FB/TikTok/anything installed), Telegram + X prefill
  intents, copy-then-open for Instagram and Facebook (Meta blocks prefilled
  text by policy)
- Migration 00052: `social_accounts` + `social_account_secrets` (tokens,
  service-role only) + `scheduled_posts` queue — RLS verified with negative
  tests (anon and a second agent both blocked, 42501 on cross-agent insert)
- Meta OAuth connect flow (`/studio/accounts`, `/api/social/oauth/*`):
  discovers FB Pages + linked IG Business accounts; degrades to an explanation
  until META_APP_ID/SECRET exist and pass App Review
- Schedule panel in the workspace + `/studio/scheduled` queue with statuses,
  failure reasons and cancel; publisher sweeps via
  `POST /api/social/publish-due` (x-cron-secret) — IG container→publish,
  FB photo/feed; race-safe optimistic claiming
- NOT yet live end-to-end: real Meta publishing awaits the developer app
  (see docs/module-content-studio.md §8 for the setup steps)

## Content Studio v3 — story/feed images (11 Aug 2026)

- New Images tab in the studio workspace: 1080×1080 feed and 1080×1920 story
  posters drawn on a client canvas from the listing's cover photo + facts
  (type badge, price, title, location, specs, agent name)
- Accent colour read from the theme's --crimson CSS variable at draw time —
  nothing hard-coded; story preset keeps IG-safe margins top and bottom
- Download PNG + native share-with-file (mobile share sheet → IG/WhatsApp);
  text-only fallback poster when the listing has no cover photo
- Verified: cross-origin cover from Supabase public storage draws without
  tainting the canvas (export works); both presets pixel-checked
- Brochure PDF is now the only unbuilt §3 output

## Content Studio v4 — brochure + locale fix (11 Aug 2026)

- Brochure tab + /studio/[listingId]/brochure: one-page print view (gallery,
  specs grid, facilities, agent card with the sharing agent's landing link —
  borrowed-listing swap intact, no phone numbers). Browser Print / Save as PDF
  is the exporter: zero dependencies, real CSS layout, print:hidden toolbar
- Brochure copy follows the listing's language; toolbar follows the UI locale
- FIX (platform-wide): i18n/request.ts ignored the locale passed to
  getTranslations({locale}) and always resolved from the cookie — explicit
  locale now wins, cookie stays the fallback. Verified: Indonesian brochure
  under an English UI, and normal cookie-based rendering unchanged
- All four studio outputs from the module design §3 are now shipped

## Digital name card (11 Aug 2026)

- Public card at /c/<slug> (noindex): photo, name, verified badge, agency
  (scrubbed while identity is held back), bio, listing count → landing page,
  and the social links the agent set to "Public profile" visibility
- Save contact (generated vCard; phone included only when parseable from a
  published wa.me link) + native share / copy link
- Migration 00053: public_agent_social_links view — public_profile visibility
  only, verified agents only; collaborator/contact-release links stay behind
  00019's policies (verified anonymously: a collaborators-only link does not
  render)
- Card renders in the AGENT's preferred language (their card, their market);
  /card management page shows the identical component as preview + share panel
- Dashboard SoonCard → live module; nav entry under Account; en/id/ms strings

## Training & guides (12 Aug 2026)

- Last SoonCard goes live: /training list (grouped by category, progress bar)
  + /training/[guideId] reader with mark-as-done
- Migration 00054: training_guides (language-neutral identity) +
  training_guide_translations (per-locale title/body) + training_progress —
  progress keyed to the guide, so switching language never resets a checkmark
  (country+language rule). RLS negative-tested: anon sees nothing, a non-admin
  cannot create guides, edit translations, or write another agent's progress
- /admin/training editor (legal-content pattern): create draft, per-locale
  title/body, publish gate requiring at least one language, delete; audited
- seed-training.mjs: 4 starter guides × 3 locales covering listings, lead SLA,
  the Content Studio and co-marketing — run against the dev project
- Dashboard now has ZERO SoonCards — every announced module is live
