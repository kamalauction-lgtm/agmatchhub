# Stage B — build log and feature-completion report

*Started 7 November 2026 on `APPROVE BUILD` (owner decisions document of the same date). This is the running "feature-completion report with evidence of testing" the directive asks for. Newest entries at the top of each epic. Nothing here touches production until `APPROVE PRODUCTION`.*

Plan of record: [stage-a-ai-workforce-and-hero-blueprint.md](stage-a-ai-workforce-and-hero-blueprint.md). Owner decisions D1–D8 are summarised at the end of this file.

---

## Status board

| Epic | State | Evidence |
|---|---|---|
| E0 Staging & safety | **done** (7 Nov) | staging `aylzekkeurjsudazzxjv`; 77 migrations replayed; suite 350/350 on staging |
| E1 AI foundation (`packages/ai`, 00078–00080, cron, `/admin/ai`) | **built on staging** (7 Nov) — live calls wait for a provider key | 00078–00080 applied to staging; 157 tests incl. 8 new RLS cases; `/admin/ai` rendered and a save audited on staging; typecheck + lint clean |
| E2 AI Manager | **built on staging** (7 Nov) | 00081–00082; dashboard panel + `/ai` directory rendered as a real agent; denial path exercised end to end (ledger row, cached reason); 160 tests |
| E3 Listing Assistant | **built on staging** (7 Nov) | 00083 quality score + comparables (backfilled, trigger-maintained); assistant behind the existing wizard; quality card on edit; 153 tests incl. 4 new |
| E4 Marketing Studio | **built on staging** (7 Nov) | "Write with AI" fills WhatsApp · Instagram · Facebook · TikTok · brochure from one listing; schedule from the Facebook tab too; roles caption/brochure writer live |
| E5 Communication Secretary | **built on staging** (7 Nov) | reply drafts per lead (WhatsApp via wa.me, e-mail via Resend with reply-to the agent), lead-event kinds widened (00085), 12-hourly overdue nudges on the cron; roles reply drafter + e-mail composer live |
| E6 Qualifier & Matcher | **built on staging** (7 Nov) | 00086 `lead_intelligence` + `lead_radar()` + `lead_matches()`; intent with reason, duplicate/silence chips, sort by intent, alternatives from own + open pool (same country); embeddings cron ready for a key; 5 roles live |
| E7 Tasks & Appointments | **built on staging** (7 Nov) | 00087 `agent_tasks` + lead-anchored `viewing_appointments`; `/tasks` with AI suggestions, manual tasks, viewings strip; brief actions + reminders cron; 4 roles live |
| E8 Hero link + benefits | **built on staging** (7 Nov) — live check waits for `HERO_API_KEY` | 00088–00089 `hero_links` + `hero_benefits` + grant/revoke RPCs; profile card, `/admin/hero`, nightly `hero_recheck`; 4 RLS cases + unit; full suite 405/405 |
| E9 Commercial (wallet kinds, families, 3 currencies) | **built on staging** (7 Nov) — `FREE_LAUNCH` unchanged | 00090–00092: `credit_wallets(kind)` + `credit_grant/spend/balance`; `plans.family/product_key`; one current `plan_versions` row per plan per currency (MYR · IDR · USD seeded from D4); `/plan` for agents, per-currency repricing + credit grants for admins; 7 new RLS cases; suite 413/413 |
| E10 Ingest multi-country | **built on staging** (7 Nov) — Hero's adapter still sends ID only (Hero change prepared, not applied) | 00093 `match_location_my()` + `match_location(country, text)`; route takes country from the agent, vocabulary/unit/currency/language per country, ingest agent per country on `/admin/countries`; proven end to end on the staging dev server (ID + MY + re-send + mismatch); suite 423/423 |
| E11 Payments scaffold (Billplz · Midtrans · Stripe adapters, sandbox) | **built on staging** (8 Nov) — every gateway `off`, `payments` flag off, `FREE_LAUNCH` unchanged; sandbox round-trips wait for the owner's sandbox accounts | 00094 `payment_providers` (off/sandbox/live, live refused by trigger unless LIVE_BILLING) + `credit_packs/_prices` + `payment_intents` + `payment_events` + `payment_intent_create/checkout/settle/cancel/expire`; three adapters with verified signature schemes; webhook route; `/plan` checkout behind flag + provider; `/admin/payments`; `payment_expire` cron; 18 unit + 6 RLS cases; signed/tampered/replayed Midtrans webhook proven on the staging dev server; suite 442/442 |
| E12 WhatsApp Cloud API design + scaffold | **designed and built on staging** (8 Nov) — flags `whatsapp_cloud` / `whatsapp_marketing` off, both numbers `off`, no Meta credentials exist; nothing is connected to Meta | [whatsapp-cloud-api-design.md](whatsapp-cloud-api-design.md); 00095–00096 `wa_accounts` (off/test/live + test recipients) · `wa_templates` · `wa_opt_outs` (permanent) · `wa_messages` · `wa_webhook_events` · `wa_send_check()` rules in SQL; webhook GET/POST with app-secret signature; platform door on `/leads`; `/admin/whatsapp`; 7 unit + 6 RLS cases; handshake / signed / tampered / replayed / stranger / STOP proven on the staging dev server; suite 455/455 |

**Readiness report (pre-pilot, 8 Nov):** [production-readiness-report.md](production-readiness-report.md) — verdict *not ready for `APPROVE PRODUCTION` today*; five conditions (C1 commit + push the source — **met 8 Nov, commit `b902bd9` pushed**, C2 pilot, C3 production secrets, C4 residue decision, C5 backup confirmed); production has 19 pending migrations (00078–00096) and none of the Stage B secrets; `ai_features` is globally on in production and should be targeted before any AI key lands.

**Staging URL (8 Nov):** **https://hub-staging.propertiguru.id** — Worker `ag-matchhub-staging` (`apps/hub/wrangler.staging.jsonc`), deployed by `scripts/deploy-staging.mjs` (injects staging values at build time, replaces the `.env.production` OpenNext copies into the bundle — a staging bundle was otherwise carrying production's env file, caught by the build-target check — and refuses any other project ref). Secrets set: service key, ingest secret, cron secret (also in `.env.staging`), signing secret, staging VAPID private key, Resend key. Smoke: `/login` 200, `/` 307, webhook handshake with a wrong token 403, cron with/without secret 200/401. Production Worker and database untouched. Staging Supabase Auth: Site URL = the staging hostname; redirect allow-list = `https://hub-staging.propertiguru.id/**`, `http://localhost:8153/**` (dashboard, 8 Nov; no Management API token exists locally). Note: the staging project sits in a Supabase org named "Staging" on the **Free** plan, not the Pro org as first recorded.

**Blockers owned by Kamal:** AI provider key (Gemini via `wrangler secret put GEMINI_API_KEY` in `apps/hub`, or an Anthropic key) · Hero partner key, scope `rens:status` · GitHub secrets for the CI staging job (`STAGING_DATABASE_URL`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_SERVICE_ROLE_KEY`, `TEST_*`) · **gateway sandbox accounts** for E11's sandbox round-trips (Billplz sandbox: API key + collection + X Signature key; Midtrans sandbox: server key; Stripe test: secret key + webhook signing secret) — into `packages/db/.env.staging` for the staging dev server; production values only as Worker secrets, only with `APPROVE PRODUCTION` · **Meta WhatsApp Cloud API** (E12): Business verification, an app with the WhatsApp product, a system-user permanent token (`WHATSAPP_ACCESS_TOKEN`), the app secret (`WHATSAPP_APP_SECRET`), a verify token of your choosing (`WHATSAPP_VERIFY_TOKEN`), the test number's `phone_number_id` + `waba_id` for `/admin/whatsapp`, and the five pilot phones as test recipients — see the design doc §6.

---

## E0 — Staging & safety (7 Nov 2026)

### What exists now
- **Staging project** `propertiguru-staging` (`aylzekkeurjsudazzxjv`) in the Kamal AG Pro org — chosen by the owner over a free org to keep one invoice (~US$10/month, hourly prorated). Its pooler is **`aws-0-ap-northeast-2` (Seoul)**, not Mumbai; every other cluster answers "tenant or user not found".
- `packages/db/.env.staging` (git-ignored) holds the connection string, the `sb_publishable_` key, the secret key and the five standing test accounts. `--env=staging` is a loader alias and **refuses to run if the file resolves to the production ref**.
- **All 77 migrations replayed, first attempt, zero edits.** Object counts identical to production: 103 tables · 10 views · 102 functions · 222 policies · 233 indexes · 64 triggers · 4 buckets · same 8 extensions.
- Reference data identical (70 countries, 4 plans, 46 plan entitlements, 12 entitlement definitions, 10 capabilities, 25 role capabilities, 14 flags, 15 reward rules, 6 declarations). Geography seeded: ID 7,763 rows, MY 262 rows.
- Standing accounts `ra|sa|la|ma|admin@seed.propertiguru.test` created by `seed-test-users.mjs`; generated passwords written into the env file, never printed. The `.test` domain is deliberate — the teardown sweeps `@fixture.propertiguru.invalid`.
- `seed-staging-scenario.mjs` lays down the rows sixteen tests *read* (REQ-2026-900001 → SUB-2026-900001, COM-2026-900001 accepted both sides, one disclosure, consents, LST/CMO-2026-900001 open-pool offer). Idempotent; 9000xx ids cannot collide with minted ones.

### Test harness
- Tests read **one** variable, `PG_ENV_FILE`, set only by `scripts/test.mjs --env=<target>`. `npm test` → staging. `npm run test:production` adds `--i-mean-production`. Bare `vitest` throws in `tests/env.ts` before any client exists. Four hard-coded `.env.production` reads removed (`setup.ts`, `global.ts`, `teardown.ts`, `referral-wiring.test.ts`).
- `seed-admin.mjs` had been reading `.env.legacy` (the retired project) — moved to the shared loader.
- CI `rls` job now writes `packages/db/.env.staging` from secrets and runs `npm test`; it still skips loudly when the secrets are absent.
- README environment table corrected: it still described the retired project as "Production" and the production file as "Staging".

### Evidence
| Run | Result |
|---|---|
| `node scripts/test.mjs --env=staging tests/unit` | 139/139 |
| full suite, before scenario seed | 334 passed · **16 failed** — every failure an empty-table read (`subs![0].id` undefined, `agency_name` null, `request_links` zero rows); no policy regression |
| full suite, after scenario seed | 349/350 — `identity.test.ts` asserted RA sees ≤ 2 profiles, a number true only of a dataset with no open-pool offers; the open-pool lister policy (00044) correctly shows LA. Rewritten as inclusion/exclusion (must see self + SA, must not see admin or MA) |
| `lifecycle.test.ts` | was leaving one cancelled `TSTREQ` requirement per run (agents cannot delete) — 32 on production, 4 on staging. Now fixture-marked, deleted in its own `afterAll` with the service role, and the sweep knows the old title |
| full suite, final | **350/350, exit 0, sweep found nothing** |

### Found on the way (not changed — production)
- Production carries test residue from earlier suite runs: **32** cancelled `TSTREQ-…` requirements ("Lifecycle test requirement", country MY) and the three `kamal.auction+mhtest*` accounts (0 fixture-domain users, 0 `[fixture]` profiles). Removal is a production data change and waits for authorisation; the sweep now recognises the title, so an authorised `npm run test:production` would clear the 32 rows.

---

## E1 — AI foundation (7 Nov 2026)

### What exists now
- **Migrations 00078–00080** (staging only): `ai_settings` (one row: on/off, daily/monthly platform caps in micro-USD, per-agent daily cap, circuit breaker), `ai_models` (provider/model/fallback/costs/tier per feature, 10 seeded rows, Gemini `gemini-3.8-flash` first with Anthropic fallback — Decision 1), `ai_prompts` (versioned, per locale, one current), `ai_jobs` (append-only ledger — references and hashes, never text; `ai_jobs_append_only` trigger blocks update/delete for everyone, purge only with a session flag), `ai_briefs` (E2 fills), `ai_roles` (the **36-role catalogue** as data, all `planned`, each pointing at an existing route or a Hero deep link), entitlement keys `ai.poster_exports_monthly`, `ai.credits_monthly`, `ai.roles` (tier ladder extended with core/workforce), capability `ai.manage` on super_admin + admin. RPCs: `ai_quota_status`, `ai_record_job` (the only insert path), `ai_note_provider_failure`, `ai_admin_daily`, `ai_admin_by_feature`; every one revoked from anon and self-or-admin guarded.
- **`packages/ai`** (`@pg/ai`, TypeScript source, zod only): `generate()` / `embed()` over plain `fetch` for Gemini (REST, `thinkingBudget: 0` — Hero's lesson) and Anthropic (Messages API); `redact()` for MY/ID phones, e-mails, IC, NIK, wa.me links; `parseJsonOutput()` (fence/preamble tolerant, schema-validated, `bad_output` otherwise); `costMicros()` from the route's own prices; `sha256Hex`/`canonical` via WebCrypto.
- **Hub engine** `apps/hub/src/lib/ai/engine.ts` — `runAi(feature, input, schema, ctx)`: flag `ai_features` → verified agent → `ai_quota_status` (disabled / circuit / platform cap / daily cap / monthly quota, in that order) → route + key from env → DB prompt or code default (`lib/ai/prompts.ts`, version 0) → redacted, hashed input → call, one fallback, breaker on failure → exactly one ledger row per attempt. Returns `ok` / `denied(reason)` / `failed(kind)`; never throws to a feature.
- **Cron**: `apps/hub/worker.js` wraps the OpenNext worker with a `scheduled()` handler that invokes `/api/cron` **in-process** (no self-fetch — Workers refuse their own domain); `wrangler.jsonc` `main` → `worker.js`, `triggers.crons` `*/15 * * * *` and `0 23 * * *` (07:00 MYT/WIB). `/api/cron` is a task registry gated by `CRON_SECRET` (falls back to `SOCIAL_CRON_SECRET`); first task `social_publish_due` — the Studio scheduler that had never fired.
- **`/admin/ai`** (capability `ai.manage`, rail → Platform): which provider keys this deployment carries (presence only), 30-day KPIs with sparklines, calls-per-day chart (answered/denied/errors), by-feature table, editable model routing, caps + breaker with reset, the 36-role catalogue with live/planned/hidden, last 50 ledger rows. Three audited actions. Strings in en/ms/id.
- `npm run dev:staging -w @pg/hub` (port 8153) runs the hub against staging; `.claude/launch.json` entry `hub-staging`.

### Evidence
| Check | Result |
|---|---|
| `tsc --noEmit` packages/ai, apps/hub; eslint on new files | clean |
| `tests/unit/ai-core.test.ts` (redaction, JSON parsing, cost, hashing) | 11/11 |
| `tests/rls/ai-foundation.test.ts` (anon blocked; agent reads routing not prompts; agent cannot edit; quota self-only; record self-only; owner/admin read; append-only even for admin; admin RPCs refuse agents; tier ladder) | 8/8 |
| whole unit suite after the i18n change | 149/149 |
| `/admin/ai` on staging in the browser | renders; all three keys shown **missing**; model save → `notice=updated`, `audit_logs` row `ai.model_route_changed` |
| `/api/cron` without / with wrong secret | 401 / 401 |

### Found on the way
- `growth.entitlement.*` message keys contained dots (`listing.active_limit`), which next-intl rejects — every page render on the hub logged `INVALID_KEY`. Renamed to underscores and the one reader (`/growth`) maps the key. Pre-existing, unrelated to E1.
- Not yet proven: a real provider call. No key is reachable on this machine; the first live call happens the moment `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`) exists in `apps/hub/.env.local` for dev and as a Worker secret for staging/production.

---

## E2 — AI Manager (7 Nov 2026)

### What exists now
- **00081** `ai_upsert_brief` / `ai_clear_brief` (self-or-admin-or-service guarded), `ai_brief_audience(p_days)` (verified · signed in within N days · flag on; service/admin only), and the `ai_manager` role flipped to **live** → `/dashboard`. **00082** adds `ai_briefs.reason` so a cached miss still explains itself.
- **`lib/ai/brief.ts` → `getAiBrief()`**: hashes today's ranked actions; returns the cached row when the hash matches; skips the model entirely when nothing is waiting; otherwise `runAi("brief")` with the translated action labels and counts → caches `ai` (paragraph + model) or `rules` (+ reason). One ledger row per agent per day at most, never one per page view.
- **`lib/dashboard/brief.ts`** gained an optional `{ client, agentId }` scope so the cron can compute any agent's counts with the service client; the dashboard now passes its own scope explicitly (an admin-agent was being shown platform-wide counts through the admin read policies).
- **Dashboard panel** "AI Manager — today's brief": the paragraph (when there is one) above the unchanged ranked list; footer with the source/reason, "{remaining} of {total} AI tasks left this month" and **Write it again** (`regenerateBrief` → `ai_clear_brief` → re-render).
- **`/ai` — AI Workforce directory**: the 36 roles from `ai_roles` grouped into the twelve directive categories, in the agent's language; live roles link to their surface, planned ones say so, Hero-hosted ones are labelled and unlinked until E8. Nav item + dashboard module card. en/ms/id.
- **Cron task `ai_daily_brief`** (daily cadence): audience from `ai_brief_audience(14)`, counts per agent via the scoped `getDashboard`, labels via `getTranslations({ locale })`, capped at 200 agents per tick.

### Evidence
| Check | Result |
|---|---|
| typecheck · eslint | clean |
| `tests/rls/ai-manager.test.ts` (own brief write/read/clear; forged user refused; audience admin-only; role live) + full unit + ai-foundation | 160/160 |
| Browser, signed in as the RA test agent on staging | panel shows "Finish 1 draft listing" (seeded `LST-2026-900002`), quota **500 of 500**, `/ai` shows **1 live** (AI Manager) and 35 planned in their categories |
| Ledger after the render | one `brief · denied · no_provider` row per user, one `ai_briefs` row per user — the cache held across reloads |

### Found on the way
- Next dev does **not** hot-reload `messages/*.json`; a restart is needed after adding keys (nav showed `nav.aiWorkforce` until then).
- Admin-as-agent dashboards counted everyone's listings — fixed by explicit owner scope.

---

## E3 — AI Listing Assistant (7 Nov 2026)

### What exists now
- **00083** — `listing_quality_scores` (existed since 00030, never filled) is now **computed deterministically** by `compute_listing_quality(id)`: completeness · photos · title · description · price vs comparables · location depth · verification · freshness · duplicate risk · agent responsiveness, weighted to 100, with **ordered recommendation keys** (`add_photos`, `describe_more`, `title_location`, `price_above/below_comparables`, `possible_duplicate`, `refine_location`, `remove_phone`, `add_field`). Triggers on `listings`, `listing_media` and `properties` keep it current (depth-guarded, column-listed so the stamp on `listings.quality_score` cannot re-fire). Backfilled every listing. `listing_comparables(country, type, kind, regency, bedrooms)` returns count/median/median-per-m² of **published listings in the same country only**. Roles `listing_copywriter`, `comparables_analyst`, `quality_auditor` → live.
- **`lib/ai/listing-assistant.ts` → `draftListing()`**: deterministic writer + advisor first (unchanged files), comparables from the catalogue, then `runAi("listing_copy")` fed with the structured fields + comparables + the deterministic draft; model output (3 titles, description, selling points, notes for the agent) replaces the draft when it arrives, otherwise the draft stands with the reason. Nothing is written to a listing.
- **Wizard** (`components/listings/listing-wizard.tsx`): the description step shows where the draft came from (✦ AI · model, or "from your fields" + the reason), the comparables line, the assistant's notes, and **selling-point chips** the agent can remove; kept chips are saved to `listings.key_selling_points` (schema bounded: ≤ 6 × 120 chars).
- **Edit page**: `QualityCard` — score out of 100, six sub-bars, and the recommendations in words (en/ms/id).

### Evidence
| Check | Result |
|---|---|
| migration on staging; backfill | `LST-2026-900001` (published, 0 photos) → 60/100; `LST-2026-900002` (draft) → 51/100; both recommend `add_photos ×5`, `describe_more`, `title_location`, `refine_location` |
| `tests/rls/listing-quality.test.ts` (owner reads own score, stamp matches; other agent cannot read or recompute; description change recomputes via trigger; comparables answer for ID and return 0 for MY) | 4/4 — unit + quality 153/153 |
| typecheck · eslint | clean |
| Browser, RA on staging | edit page shows **51/100** with six sub-bars and seven worded fixes; wizard description step → "Help me write it" → badge *From your fields*, reason *no AI provider is connected yet*, comparables line *1 similar published listing in this regency · median IDR 3.500.000.000*; ledger row `listing_copy · denied · no_provider · listing_draft` |

### Found on the way
- Two wizard strings are filled on the client, so they must not be ICU placeholders (`{n}`) — next-intl tries to fill them when the label dictionary is built and returns the key path instead. They now carry `[n]`/`[median]`/`[model]` tokens.
- `text[] || 'literal'` in PL/pgSQL is parsed as an array literal — the first apply failed on `"furnishing"`; `array_append()` is the unambiguous form.

---

## E4 — AI Marketing Studio (7 Nov 2026)

### What exists now
- **`studio/ai-actions.ts` → `draftStudioCopy(listingId)`**: owner-scoped (`getStudioListing`), builds the same facts the deterministic writers use (`lib/studio/input.ts`, shared and unit-tested), asks `runAi("studio_copy")` for Facebook, Instagram, TikTok script, WhatsApp broadcast and brochure blurb in one call; falls back to the deterministic WhatsApp/caption with the reason.
- **Workspace** (`components/studio/studio-workspace.tsx`): a status bar with **✦ Write with AI**, the source/reason line and the monthly quota; two new tabs (**Facebook**, **TikTok script**); the brochure tab gains an editable blurb; scheduling now works from the Facebook tab as well as Instagram, and the queue still receives exactly the text in the tab. Reset returns to the deterministic draft. Phone-number guard extended to Malaysian numbers.
- **00084**: roles `caption_writer`, `brochure_writer` → live (`/studio`). `social_planner` stays planned.
- Strings in en/ms/id; the client-filled strings use `[model]`/`[remaining]`/`[total]` tokens (lesson from E3).

### Evidence
| Check | Result |
|---|---|
| typecheck · eslint (studio, lib/studio) | clean |
| `tests/unit/studio-input.test.ts` + full unit suite | 152/152 |
| Browser, LA on staging, `/studio/LST-2026-900001` | status bar + six tabs render; **Write with AI** → *Written without AI — no AI provider is connected yet*, quota 500/500; ledger `studio_copy · denied · no_provider · listing` |

---

## E5 — AI Communication Secretary (7 Nov 2026)

### What exists now
- **`lib/ai/secretary-rules.ts`** (pure, tested): a courteous first reply in id/en/ms from the lead and the listing — first name only, the listing's own price, no promised terms, signed by the agent. **`lib/ai/secretary.ts` → `draftReply()`** asks `runAi("secretary_reply")` for better, with the deterministic reply as the floor; the enquirer's phone/e-mail never reach the model (engine redaction; only the first name is passed).
- **`leads/ai-actions.ts`**: `draftLeadReply(leadId, channel)` (RLS-scoped load with contact + listing + property facts; records `lead_events · ai.reply_drafted` with channel/source, never the text) and `sendLeadEmail` (Resend through the existing `sendEmail`, now with **reply-to the agent's own address**; stamps `first_responded_at` if first; `lead_events · email.sent`; audited `lead.email_sent` with the recipient's domain only).
- **`components/leads/reply-panel.tsx`** on every lead card: *Draft WhatsApp reply* / *Draft e-mail reply* → editable text (+ subject for e-mail), source/reason line, next step and questions worth asking, **Open WhatsApp with this text** (wa.me — the agent presses send on their phone; Decision 8 keeps the Cloud API for a later phase) or **Send e-mail**, copy, monthly quota.
- **00085**: the `lead_events` agent-insert policy now admits `ai.reply_drafted` and `email.sent` (still never `nudge.sent`); roles `reply_drafter`, `email_composer` → live.
- **Cron `lead_nudges`** (15-minute cadence): leads past their first-response deadline, unanswered, under a week old → one notification to the agent (`lead_overdue`, in-app + push + e-mail via the existing fan-out) at most every 12 hours per lead, recorded as `nudge.sent` by the service role.
- Test harness: `laClient()` / `maClient()` in `tests/rls/setup.ts`; the scenario seed now creates `CON-2026-900001` (Siti Rahma, `.test` e-mail) and `LEAD-2026-900001` (viewing request on LA's published listing).

### Evidence
| Check | Result |
|---|---|
| typecheck · eslint | clean |
| `tests/unit/secretary-rules.test.ts` (language, first name, price only when given, signature, unknown locale) | 5/5 |
| `tests/rls/secretary.test.ts` (LA records draft + e-mail on own lead; RA sees nothing and cannot write; cron-only kind refused) | 3/3 |
| Browser, LA on staging, `/leads` | lead card shows the panel; *Draft WhatsApp reply* → Indonesian reply greeting Siti by first name, the viewing-request line, next step + two questions, **Open WhatsApp with this text** carries the edited reply in the `wa.me` link; reason line *no AI provider is connected yet* |
| Not exercised live | `sendLeadEmail` (would send a real e-mail through Resend from the dev machine) and the `lead_nudges` cron (dev server has no cron secret) — both covered by inspection and the policy test; the e-mail path gets its live check in the pilot |

### Found on the way
- `lib/email.ts` still carries a hard-coded "IQI AG MatchHub" header in its HTML and an "onboarding@resend.dev" default sender — fine for internal notifications, wrong for a buyer-facing reply. Noted for the brand pass (rule 12), not changed here.

---

## E6 — Lead Qualifier & Property Matcher (7 Nov 2026)

### What exists now
- **00086** — `lead_intelligence` (intent 1–5 **with its reason**, signals, suggested action, source/model; RLS via the lead's agent; written only by `lead_intel_upsert()` — owner, service or AI admin). `lead_radar()`: per lead of the caller, how many other leads share the phone number and how many hours since anyone (not the cron) touched it; cold = open and silent > 72 h. `lead_matches(lead, n)`: published listings in the **same country**, same sale/rent, from the agent's own stock or **active open-pool offers**, excluding the enquired listing, scored on area (40) · type (20/10) · price band (20/10) · bedrooms (10) · embedding similarity (≤ 10 when both exist, via `operator(extensions.<=>)`), with reason keys. Five roles → live.
- **Qualifier**: `lib/ai/qualifier-rules.ts` (pure floor from enquiry type + wording, reason in id/en/ms) and `qualifier.ts` (`runAi("lead_qualify")` over it). `qualifyLead()` action stores the result; the list can be **sorted by intent** (`?sort=intent`) — it is never filtered by it.
- **Matcher**: `findLeadMatches()` action → up to three alternatives, each with price, area, bedrooms, size, *Yours/Pool* badge and the reasons in words, linking to the marketplace page.
- **Embeddings**: `lib/ai/embeddings.ts` + cron task `listing_embeddings` (15-minute cadence, 20 per tick, once per text version by source hash, ledger row per listing's agent); Gemini adapter now requests `outputDimensionality: 1536` to fit the existing `vector(1536)` column. Idle until a key exists; the matcher works without it on structured facts alone.
- **UI**: `components/leads/intel-panel.tsx` (dots + reason + next step, Qualify / Re-qualify, Find alternatives, match cards) above the Secretary panel; radar chips *Same number on N other leads* / *Quiet for N days* beside the SLA badges; sort toggle in the header. en/ms/id.
- Seed: MA's published `LST-2026-900003` (Pondok Indah) in open-pool `CMO-2026-900002` as a match candidate.

### Evidence
| Check | Result |
|---|---|
| typecheck (`@pg/ai`, hub) · eslint | clean |
| `tests/unit/qualifier-rules.test.ts` | 3/3 |
| `tests/rls/lead-intelligence.test.ts` (own-lead write/read, forged write refused, radar scoped, matches from pool excl. enquired listing, other agent refused) | 3/3 — whole run 163/163 |
| Browser, LA on staging, `/leads` | **Intent 5/5** · *Enquiry asks to view, talks about price or payment, mentions a timeframe* · *Next: Offer two viewing slots today* (rules; ledger `lead_qualify · denied · no_provider`); **Find alternatives** → *Rumah 4 kamar Pondok Indah* · Pool · IDR 3.800.000.000 · 4 BR · 190 m² · *same area · same type · similar price · similar size*; sort toggle Newest / By intent |

---

## E7 — Task & Appointment Assistant (7 Nov 2026)

### What exists now
- **00087** — `agent_tasks` (title, kind, source `manual|ai_manager|secretary|task_extract`, due, anchors to lead/listing/request, status, `reminder_sent_at`; owner-only RLS). **`viewing_appointments` extended, not duplicated**: `submission_id` nullable, `lead_id` + `listing_id` + `reminder_sent_at` added, a check that exactly one anchor is set, new owner policies through `owns_lead()`; the MatchHub policies are untouched and cannot see lead rows. Roles `task_planner`, `viewing_coordinator`, `reminder_assistant`, `followup_scheduler` → live.
- **`/tasks`**: Overdue · Today · Upcoming · Recently done; Done / Reopen / Dismiss; manual task form; **suggestions** (`TaskSuggestions`) from one enquiry or from today's brief — a checklist the agent edits and adds in one go (`createTasksBulk`, source `task_extract`); **viewings strip** with *Book viewing* for the lead in context (`proposeLeadViewing` → confirmed on creation, lead → `viewing_confirmed`, first response stamped, timeline + audit) and Completed / Cancelled for lead viewings. Opened from a lead card via *✦ Tasks & viewing*.
- **Task Planner**: `lib/ai/task-rules.ts` (pure floor per enquiry type with due offsets; brief actions → tasks due 17:00) and `lib/ai/tasks.ts` (`runAi("task_extract")` over it, due dates validated).
- **Brief**: `getDashboard` counts open tasks (overdue / due today); new ranked actions `overdueTasks` (danger) and `dueTasks`; dashboard module card with badge.
- **Cron `reminders`** (15-minute cadence): tasks due within the hour → `task_due`; confirmed lead viewings starting within two hours → `viewing_soon`; each once, stamped on the row.
- Nav item; en/ms/id.

### Evidence
| Check | Result |
|---|---|
| typecheck · eslint | clean (the React Compiler's purity rule moved time-bucketing out of render) |
| `tests/unit/task-rules.test.ts` | 3/3 |
| `tests/rls/tasks.test.ts` (own tasks CRUD; other agent sees/changes nothing; cannot insert for another agent; lead viewing visible to lead's agent only; forged insert refused; two anchors refused) | 2/2 — whole run 165/165 |
| Browser, LA on staging, `/tasks?lead=…` | *Suggest tasks from this enquiry* → three proposals (propose slots · confirm viewing · follow up, with due times) → *Add selected (3)* → rows under Upcoming with ✦ Task Planner · Siti Rahma; **Book viewing** 10 Nov 10:00 → `VIEW-2026-000002 · Confirmed`, lead → `viewing_confirmed`, first response stamped, audit `lead.viewing_booked` |

---

## E8 — AG Hero link + launch benefits (7 Nov 2026)

Phase 1 only, as D2 orders: PropertiGuru asks Hero one read-only question
(`POST /api/rens/status`, scope `rens:status`) and never writes to Hero. Hero
stays the authority for IQI AG Group membership; the marketplace stays open to
every agency.

### What exists now
- **00088** — `hero_links` (one row per agent: `status` linked · stale · unlinked, `method` email · phone, `matched_hash` = SHA-256 of the identifier, never the identifier; Hero's `account_created_at` / `first_login_at` / `last_login_at`; Phase 2 columns `hero_country` / `hero_membership_status` filled only when Hero sends them; `last_result`, `last_error`, `linked_at`, `last_checked_at`; own-row read, `commercial.manage` read, writes only through RPCs). **`hero_benefits`** singleton = Decision 3 as data: enabled, 300 active listings, 50 AI text tasks/month, 10 poster exports/month, MatchHub, co-marketing, Content Studio *advanced*, AI Workforce tier *workforce*, **`expires_at` 30 Jun 2027 23:59:59 (KL)**, `review_at` 1 Jun 2027 09:00, `grace_days` 7 — editable, nothing hard-coded. `entitlement_grants.source` gains `hero_benefit`. RPCs (`hero_may_act_for`: self or service, admins through the page's own authz): `grant_hero_benefits` (replaces, never stacks; `effective_until` = the record's expiry), `revoke_hero_benefits(grace)`, `hero_link_record` (found + first login → linked + grants; error → last state kept; not found after linked → stale + grace), `hero_unlink`.
- **00089** — an immediate revoke (unlink, promotion off) sets `revoked_at` as well as clamping `effective_until` (the clamp alone left a clock-skew window the suite caught).
- **`lib/hero/client.ts`** — the one call, server-only, Bearer `HERO_API_KEY`, 10 s timeout, classified failures (auth · rate_limit · upstream · network · bad_response), `configured: false` when the key is absent — the UI then says so instead of pretending. `parseHeroStatus()` is pure and unit-tested against the v1 contract and the Phase 2 fields.
- **`lib/hero/link.ts`** — links by the hub's **own verified identifiers only** (the registration e-mail, then the WhatsApp / mobile number from `users_private`); there is no field an agent could type a colleague's e-mail into. E-mail first, phone second; the outcome goes through `hero_link_record`.
- **Profile → "My AG Hero account"** (`components/profile/hero-card.tsx`): status, what the link gives (live grants with values and the expiry date), deep links to Hero AI Coach · AG Sales Lab · Property Hub once linked, *Link / Re-check / Unlink*, and every outcome explained in the agent's language (linked · found but never used → sign in to Hero once · not found · no identifiers · Hero did not answer).
- **`/ai`** — Hero-hosted roles open in a new tab for linked agents; unlinked agents still see "available through AG Hero".
- **`/admin/hero`** (capability `commercial.manage`, nav group Commercial): linked / stale / key-configured KPIs; the **benefit form** (dates as calendar days in KL — `lib/hero/dates.ts` — because the first datetime-local round-trip shifted the expiry by the server's UTC offset on each save); *Re-apply to all linked agents* after changing values; the links table with per-agent *Re-check*. Audit: `hero.benefits_changed` (previous + next), `hero.benefits_regranted`, `hero.link_rechecked`, `hero.link_attempted`, `hero.unlinked`.
- **Cron `hero_recheck`** (daily, with the 23:00 UTC trigger): re-checks every linked or stale account; skipped with a reason while the key is missing.
- `.env.example`: `HERO_API_KEY`, `HERO_API_BASE` (defaults to Hero's Worker). en/ms/id for `hero` and `adminHero`.

### Evidence
| Check | Result |
|---|---|
| typecheck · eslint | clean |
| `tests/unit/hero-client.test.ts` (contract parsing, phone normalisation, KL date round-trip) | 4/4 |
| `tests/rls/hero-links.test.ts` (found + login → linked and `resolve_entitlement_int` rises by exactly the record's value with the record's expiry; second record replaces not stacks; error keeps state; not-found → stale with ≤ grace days left; other agent sees nothing and cannot record / grant / unlink; admin can read; unlink ends benefits now) | 4/4 |
| Full suite on staging | **405/405** (one stale assertion in `identity.test.ts` corrected: the MA test agent is visible to RA *because* the E6 seed gave them an open-pool offer — now asserted as the reason, admin remains the unrelated account) |
| Browser, LA on staging, `/profile#hero` | card renders: *Unlinked* (the suite's own test link), "Hero linking is not switched on in this environment yet" — no fabricated key, no button that would fail |
| Browser, admin on staging, `/admin/hero` | KPIs 0 · 0 · *missing*; benefit form saved twice → `hero_benefits.updated_by` = admin, two `hero.benefits_changed` audit rows; expiry **stable at 2027-06-30 15:59:59 Z** across both saves (after the date fix); links table shows the test row with *Re-check* |

### Not exercised
- A real Hero answer. Every path that touches Hero was proven at the database and UI boundaries with recorded results; the HTTP call itself runs the moment `HERO_API_KEY` (scope `rens:status`, issued in Hero Command HQ → Integrations) is set in `apps/hub/.env.local` for staging and `npx wrangler secret put HERO_API_KEY` for the Worker.
- The cron path end to end (no `CRON_SECRET` on the dev server).

### Owner inputs
- `HERO_API_KEY` as above. Nothing else — no Hero production change was made or is needed for Phase 1.
- Phase 2 (`country`, `membership_status` in Hero's response) is read when present; the Hero-side change is a separate, later request.

---

## E9 — Commercial: wallet kinds, plan families, three price lists (7 Nov 2026)

Decision 4 as data. Nothing is charged: `commercial_settings.billing_mode`
stays `FREE_LAUNCH`, the launch policy still makes Platinum complimentary for
everyone, and the suite asserts both.

### What exists now
- **00090 — credit wallets by kind.** `credit_wallets` PK → `(agent_id, kind)` with `kind` boost · ai; `credit_transactions.kind` + reasons `ai_usage`, `promotion`, `hero_welcome`, `topup`. `boost_listing()` rewritten with identical arithmetic, addressing the boost wallet explicitly. New doors: `credit_grant()` (admin with `commercial.manage` or the service role — never the agent; audited `credit.granted`), `credit_spend()` (own balance, refuses below zero, ledger row), `credit_balance()` (own / admin / service, 0 otherwise). Premium AI work (images, video, large documents) will debit the `ai` wallet; the monthly text allowance stays an entitlement.
- **00091 — families and price lists.** `plans.family` (agent · ai · agency · developer · enterprise) and `plans.product_key/product_name`: basic → **Free**, silver → **Starter**, gold → **Pro**, platinum → **Agency**; the record keys never change. `plan_versions` now has one current version **per plan per currency** (version numbers count within plan + currency). Seeded exactly from D4 (monthly; annual = 10×): Free RM0 / Rp0 / $0 · Starter RM39 / Rp149,000 / $10 · Pro RM99 / Rp349,000 / $25 · Agency RM299 / Rp999,000 / $79. IDR Pro and Agency are **v2** (v1 299,000 / 599,000 kept as history). `price_currency_for(user)` = verified country's currency when a list exists (MY → MYR, ID → IDR), else USD — never from IP. `current_plan_version()` picks the default plan in that currency; `plan_catalogue(currency)` returns the four products with their entitlements for the `/plan` page. `subscriptions.family` (trigger-filled) and the live-subscription uniqueness is now **(user, family)**: an agent plan and an AI Workforce plan may coexist, two agent plans may not.
- **00092 — inheritance fix.** A new `plan_versions` row inherits the plan's entitlements by trigger (`plan_version_inherit_entitlements`). The first version chose the *newest* current sibling, which in a multi-row insert is another empty row: 00091's new versions landed with **zero entitlements and the default plan resolved to nothing on staging** (caught by the read-back, not by a test — the suite now has one). The source is now the version that *has* entitlements; the empty versions were backfilled. **This also closes a latent production bug**: the admin's *New version* button had always produced a version with no entitlements.
- **Agent `/plan`** ("My plan & credits", nav → Account): current product + plan, what they pay and why (policy name), active listings / AI tasks / Hero link status, the AI-allowance working, **AI credits and boost credits**, and the four-plan catalogue **in the agent's currency** with entitlements per plan; launch banner while complimentary. No checkout — that is E11, behind the separate approval. Dashboard plan card shows the product name and links here.
- **Admin `/admin/commercial`**: each plan now shows **three price lists side by side**, each with its own *New version* (or *Create v1* for a currency without a list); history lists currency + version. `repricePlan` takes the currency and creates v1 when none exists.
- **Admin agent page** (`GrantPanel`): AI / boost balances, *Add credits* (kind, amount, reason code, note → `credit_grant`), last ten ledger rows.
- `lib/entitlements.ts`: `priceCurrencyFor`, `planCatalogue`, `creditBalance`, `formatMoney` (locale by currency). en/ms/id for `plan`, `nav.plan`, `grants.credits*`, `commercial.*`.

### Evidence
| Check | Result |
|---|---|
| typecheck · eslint | clean |
| `tests/rls/commercial-families.test.ts` (agent cannot self-credit, admin can, balances per kind, other agent reads 0 and sees no rows; own spend, never below zero, ledger row, no cross-agent spend; three lists × four products with ≥11 entitlements each and Free = 10 AI uses; MY → MYR, ID → IDR, AE → USD with `resolve_price` following; new version inherits entitlements; agent + AI subscriptions coexist, second agent plan refused; `FREE_LAUNCH` still set) | 6/6 |
| existing `tests/rls/commercial.test.ts` (precedence, combination, role matrix) | 38/38 unchanged |
| existing `tests/rls/plan-versioning.test.ts` | scoped to the IDR list (one current version *per currency* now) + one new case: a new version carries ≥ 11 entitlements — 8/8 |
| Full suite on staging | **413/413** (40 files) |
| Browser, admin, `/admin/commercial` | three lists per plan render with D4 prices; *New version* on Starter MYR → **v2 with 13/13 entitlements inherited**, audit `commercial.plan_repriced` |
| Browser, admin, `/admin/agents/<LA>` | *Add credits* 20 AI → ledger row "AI credits · grant · E9 verification", wallet `ai` balance 20, audit `credit.granted` |
| Browser, `/plan` as the verified ID admin-agent | "Agency · Platinum · Complimentary · IDR 0 / month because of Indonesia Free Launch", 300 / 500, credits 0 / 0, catalogue in IDR with the v2 prices and *✓ Your plan* on Agency |

### Not built (by decision)
- No AI-Workforce (`family = 'ai'`) plan rows and no prices for them: D1 approves no new AI subscription and D3 meters premium AI by credits. The family exists so they are a data change when decided.
- No checkout, no top-up purchase, no currency switcher for the agent (Decision 4: display follows verified country). E11 adds the payment adapters behind `payments` flag + separate approval.

---

## E10 — Ingest, multi-country (7 Nov 2026)

The server-to-server ingest (`POST /api/listings/ingest`, Hero → hub, live
for Indonesia since 13 Sep) now serves Malaysia too. Nothing about the
Indonesian path changed in behaviour; the same payload produces the same draft.

### What exists now
- **00093** — `match_location_my(text)`: the one Malaysian township (else district) a text names, whole-word, longest name wins, exactly one or nothing — the discipline of `match_regency()`. "Mont Kiara, Kuala Lumpur" → Mont Kiara · Kuala Lumpur · Kuala Lumpur; "Johor Bahru" → district; "Selangor" alone → nothing; "Kiara" → nothing. `match_location(country, text)` is the one front door and answers in the properties shape (`province_name` = state/province, `regency_name` = district/regency, `place_name`, `level`), ID routed to `match_regency`.
- **`lib/ingest/normalise.ts`** (pure, unit-tested): Hero's vocabulary → **each country's own keys** (`terrace_house` → `rumah` for ID, `terrace` for MY; `shop_lot` → `ruko` / `shoplot`), an Indonesian key sent for a Malaysian agent falls to `lainnya` rather than crossing markets; every mapped key is one 00075's check constraint allows; size conversion into the country's unit (`size_unit` on the payload, default sqm because Hero converts before sending); country inferred from the currency only when the sender said nothing; currency and language defaults from the **countries row**, never a constant.
- **Route** — the draft belongs to an agent and the agent belongs to a country; that country decides everything. Agent resolution: body `agent_id` → the country's configured ingest agent (`countries.settings.ingest.agent_id`) for the body's `country` or the currency's country → legacy `LISTING_INGEST_AGENT_ID` (Indonesia only). A body `country` that disagrees with the agent's country is **refused (422 `country_mismatch`)**, not guessed. Payload gains `country`, `size_unit`; `currency` and `language` become optional. Response and audit carry `country`, `property_type`, `location`.
- **`/admin/countries`** — new *Ingest agent* column: a verified agent **of that country** (validated server-side; audited in `country.updated`). `.env.example` documents `LISTING_INGEST_SECRET` / `LISTING_INGEST_AGENT_ID`; `dev-staging.mjs` passes a staging-only secret through so the route can be exercised locally.

### Evidence
| Check | Result |
|---|---|
| typecheck · eslint | clean |
| `tests/unit/ingest-normalise.test.ts` | 6/6 |
| `tests/rls/ingest-locations.test.ts` (township with district + state; district fallback; longer name wins; state alone / foreign place / empty / partial word → nothing; `match_location` by country, no cross-country answers) | 4/4 |
| Full suite on staging | **423/423** (42 files; one order-dependent pick in the E9 families test fixed on the way — it could select its own AI fixture as the "agent" plan) |
| `/admin/countries`, admin on staging | ingest agent set for ID (Listing Agent) and MY (Marketing Agent, temporarily made MY for the check) — both saved, audited |
| Route on the staging dev server | no secret → 401 · **ID** payload without `agent_id` → draft LST-2026-000034 on the configured ID agent: IDR, `id`, `rumah` (from `cluster_house`), sqm 120 / 90, Tangerang Selatan · Banten · **MY** payload → LST-2026-000035: MYR, `en`, `terrace` (from `terrace_house`), **167 sqm → 1797.57 sqft**, Setia Alam · Petaling · Selangor · re-send with a new price → same listing updated (`created: false`, price 2400) · ID agent + `country: MY` → **422 country_mismatch** |

Fixture drafts removed afterwards; the MA test agent is Indonesian again and MY's ingest agent cleared (no Malaysian company profile exists on staging yet).

### Owner inputs (Hero side — a Hero production change, so prepared, not applied, per D2)
`worker/src/propertyPortalApi.js` → `API_PORTALS.propertiguru`: `countries: ['ID', 'MY']`; send `country: p.country_code`, `currency: p.currency` (no `'IDR'` fallback), `size_unit: 'sqm'` (already converted), drop the fixed `language: 'id'` so the hub applies the country default; `pi_portals` row for `propertiguru` → countries `['ID','MY']`. Hub side needs a **verified Malaysian company profile** chosen on `/admin/countries` before the first MY draft can land.

---

## E11 — Payments scaffold (8 Nov 2026)

Decision 8 as a scaffold: one billing system, three gateway adapters, sandbox only, nothing live. After this epic the platform can take a payment end to end **when and only when** three independent switches agree — the `payments` feature flag for the person, the provider row's mode for their currency, and (for live money) `billing_mode = LIVE_BILLING`. All three are off. `FREE_LAUNCH` was not touched.

### What exists now
- **Migration 00094.** `payment_providers` registry (billplz → MYR, midtrans → IDR, stripe → USD; `mode` off/sandbox/live, default off; **trigger refuses `live` unless billing mode is LIVE_BILLING**). `credit_packs` (ai_25, ai_100, boost_10, boost_30) + `credit_pack_prices` per currency — **seeded without prices**, because the owner has not priced credits; an unpriced pack is not offered. `payment_intents` (one row per attempt: who, what, amount from the price list, currency, provider, mode, status, `PAY-2026-000001`), writable only through functions. `payment_events` (every webhook delivery, verified or not, unique per gateway event id, admin-read / service-write). Functions: `payment_intent_create` (agent; refuses flag off, no gateway, wrong currency, unpriced pack, zero amount, live under non-LIVE billing), `payment_intent_cancel` (owner), `payment_intent_checkout` / `payment_intent_settle` / `payment_intents_expire` (service only). **Settle is the one place money becomes entitlement**: amount + currency must match the intent; a paid subscription intent cancels the live agent-family subscription and inserts the bought one (`subscription_events` `replaced` + `created`), a paid top-up calls `credit_grant(... 'topup')`; paid twice → `already_paid`, nothing granted twice; refunds are recorded, never auto-reversed.
- **Adapters** `apps/hub/src/lib/payments/{billplz,midtrans,stripe}.ts` on Web Crypto (Workers-safe), each with a pure `verify…Signature()` and `…Verdict()`: Billplz X Signature (sorted `key+value` joined by `|`, HMAC-SHA256, settle from the callback only — never the browser redirect), Midtrans `signature_key` = SHA-512(order_id + status_code + gross_amount + server key) with the published status table (settlement/capture+accept → paid; capture+challenge, pending, authorize → ignored), Stripe `t`/`v1` HMAC over `${t}.${rawBody}` with a 300 s replay window and multi-`v1` rotation. **Mode discipline:** a `sk_live_` / `Mid-server-` key is refused under a sandbox row and vice versa; Billplz host follows the mode. `lib/payments/index.ts` = `startCheckout()` and `handleWebhook()` (verify → record → settle; duplicates by event id; payload redacted of anything key/token/signature-shaped; 400 bad signature, 503 not configured, 200 otherwise so gateways stop retrying).
- **Route** `POST /api/payments/webhook/{billplz|midtrans|stripe}` reads the raw body. **Cron** `payment_expire` (15 min) closes open intents past their 24 h window.
- **Agent `/plan`:** with flag + gateway, each other plan gets *Choose monthly / annual*, priced packs appear under Credits, and a Payments list shows the last five attempts; `/plan/payment/<id>` is the return page (shows what the database knows; "awaiting payment" with refresh is an honest state). Without them the page is exactly E9's. The amount is never on the form.
- **Admin `/admin/payments`** (commercial.manage): billing-mode KPI, per-gateway secrets *present/missing* for sandbox and live (names only, never values), the webhook URL to register at each dashboard, mode switch (live needs the word `LIVE` typed **and** the trigger), pack prices per currency, last 25 intents and deliveries with the signature verdict. New admin nav item.
- `.env.example` documents the six gateway variables; `dev-staging.mjs` forwards them from `.env.staging` when present.

### Evidence
| Check | Result |
|---|---|
| typecheck · eslint | clean (one pre-existing `worker.js` warning) |
| `tests/unit/payments-adapters.test.ts` (RFC 4231 HMAC vector; Billplz source string + accept/tamper/missing; Midtrans signature + six statuses + key/mode; Stripe header parse, tolerance, exact bytes, rotation, verdicts, key/mode; minor units) | 18/18 |
| `tests/rls/payments.test.ts` (flag off → nothing for sale, no gateway offered; agent cannot insert intents/events, settle, or change a mode; **admin cannot set `live` under FREE_LAUNCH, can set `sandbox`**; flag targeted to one person → intent priced from the IDR annual list, PAY-id, invisible to another agent, visible to admin; unpriced pack and USD plan refused; wrong amount → `amount_mismatch` and the row untouched; paid → subscription active (annual, renews in a year, source "sandbox"), old live subscription cancelled, `subscription_events`, `current_plan_version()` answers the bought plan; paid again → `already_paid`; priced pack → top-up settles to exactly +25 credits with `ref_type payment_intent`, once; a stranger cannot cancel; expired/failed never become paid; time-based expiry; `payment_events` admin-only; flag restored) | 6/6 |
| Full suite on staging | **442/442** (44 files) |
| `/admin/payments` on the staging dev server, admin | rendered; Midtrans → **live refused** ("only while billing mode is LIVE_BILLING", from the trigger via `23514`); Midtrans → sandbox saved; ai_25 priced IDR 99,000 — all audited |
| `/admin/flags/payments` | targeted to the Listing Agent test account, then on ("On for 1 person") |
| `/plan` as the Listing Agent | top-up IDR 99,000 via Midtrans with the test-mode note; Choose monthly/annual on Starter/Pro, none on the held plan; *Choose monthly* on Pro → intent PAY-2026-000005 → **real Midtrans sandbox answered 401** to the placeholder key → `gateway_error`, intent `failed`, notice "Nothing was charged" |
| Webhook, local dev server, Midtrans notification signed with the staging placeholder key | tampered amount → **400 bad_signature** (recorded) · genuine → **200 paid** (intent paid, +25 AI credits, `/plan/payment/…` shows Paid) · same delivery again → **duplicate**, no second grant · later `pending` for a paid row → `ignored` |
| after cleanup | flag off/untargeted, Midtrans off, pack unpriced, proof rows deleted, credits back to 0; `/plan` as the agent shows no checkout again |

### Not exercised (honestly)
No gateway was reached with a real credential. `MIDTRANS_SERVER_KEY` in `packages/db/.env.staging` is a **locally generated sandbox-format placeholder** (marked as such in the file) that exists only so the signature path could be driven; the Snap call it makes is refused, which is the 401 above. Billplz and Stripe `createCheckout()` are written to their documented REST shapes and are untested against a host. Sandbox round-trips (create → pay on the hosted page → webhook) run the day the owner's sandbox credentials land in `.env.staging`; nothing else needs to change.

### Owner inputs
Sandbox accounts (not live): Billplz sandbox (`BILLPLZ_API_KEY`, `BILLPLZ_COLLECTION_ID`, `BILLPLZ_X_SIGNATURE_KEY`), Midtrans sandbox (`MIDTRANS_SERVER_KEY`, `SB-Mid-server-…`), Stripe test (`STRIPE_SECRET_KEY` `sk_test_…`, `STRIPE_WEBHOOK_SECRET`). Register `https://<hub>/api/payments/webhook/<provider>` in each dashboard (Midtrans: Payment Notification URL; Stripe: endpoint for `checkout.session.*` + `charge.refunded`; Billplz: per-bill callback, sent by the adapter). Credit-pack prices (D3 names what is metered, not the price). Going live later = `LIVE_BILLING` (typed) + provider `live` (typed) + Worker secrets, each a separate audited step, after `APPROVE PRODUCTION` and the separate payments approval.

---

## E12 — WhatsApp Cloud API: design and scaffold (8 Nov 2026)

Decision 8: WhatsApp through Meta's official Cloud API, directly; GHL keeps its numbers until the replacement passes testing; no unsolicited or paid WhatsApp. The design is [whatsapp-cloud-api-design.md](whatsapp-cloud-api-design.md) (architecture, data model, the rules engine, flows, Meta setup checklist, cost model, what is deliberately not built, the GHL cut-over test, the pilot script, open decisions). The scaffold below is what the design says is **built**. **Nothing is connected to Meta**: no token, app secret or verify token exists on this machine or in the Worker, and no app or number has been created — that is the owner's step (design §6).

### What exists now
- **Migrations 00095–00096.** Two switches, both off: `whatsapp_cloud` (the channel, targetable to the pilot cohort) and `whatsapp_marketing` (paid category). `wa_accounts`: one row per country (MY, ID seeded, `mode` off / **test** / live; `test` lists the only recipients the number may reach and SQL refuses anyone else before Meta is called). `wa_templates` registry with Meta's status; agents see **approved** only. `wa_opt_outs`: global, permanent, **no update or delete grant for anyone** — STOP / BERHENTI / HENTI / UNSUBSCRIBE from a sender writes it automatically. `wa_messages` (every message in/out, `wamid` unique, Meta pricing category kept), `wa_webhook_events` (every delivery, verified or not; verified bodies unique), `contacts.wa_last_inbound_at`. **`wa_send_check(lead, kind, template)`** — the rules in one function: ownership → flag → account → opt-out → test recipients → 24-hour window for session text → approved template otherwise → marketing needs consent **and** the switch. Service-only recorders `wa_record_inbound` (dedupe, window, attach to the most recent open lead, lead event, notification, STOP), `wa_record_outbound` (message, lead event, `first_responded_at` stamped like an e-mail reply; a refused send is recorded `failed` and stamps nothing), `wa_record_status` (sent → delivered → read, never backwards). No bulk function, table or scheduler exists.
- **`lib/whatsapp/webhook.ts`** (pure, unit-tested): `X-Hub-Signature-256` verification, the GET handshake, the payload parser (messages with caption/button/reaction text, statuses with pricing + first error), E.164 and template helpers. **`client.ts`**: the two Graph calls (session text, template) on `WHATSAPP_ACCESS_TOKEN`; one token, many numbers. **`index.ts`**: `sendOnLead()` (check as the agent, send, record as the service) and `handleWebhook()` (verify → record → settle; 401 bad signature, 503 not configured, 200 otherwise so Meta stops retrying).
- **Route** `GET|POST /api/whatsapp/webhook`. **Agent:** the Secretary panel on `/leads` gains *Send from the platform number* when the window is open, or the approved templates with their variables when it is closed; `wa.me` stays in every state; the page draws nothing extra while the flag is off (one RPC, no per-lead checks). **Admin `/admin/whatsapp`** (platform.configure): switches, secrets present/missing by name, the webhook URL to register, the two numbers (mode, test recipients, typed LIVE), template registry with Meta's body rules enforced on save, opt-out list, masked message log, deliveries with the signature verdict. New admin nav item; `.env.example` and `dev-staging.mjs` carry the three variables.

### Evidence
| Check | Result |
|---|---|
| typecheck · eslint | clean (one pre-existing `worker.js` warning) |
| `tests/unit/whatsapp-webhook.test.ts` (signature accept / tamper / no prefix; handshake token + mode; parser: text, image caption, reaction, statuses with pricing + error, other fields counted, non-WhatsApp objects rejected; e164, template components, preview) | 7/7 |
| `tests/rls/whatsapp.test.ts` (flag off → `feature_off`; agent cannot write messages, opt-outs, accounts or call the recorders; `no_account` → `not_test_recipient` → `window_closed`; stranger's lead check → `not_your_lead`; inbound opens the window, attaches to the lead, notifies, redelivery `duplicate`, unknown number `unknown_account`, unknown sender `unmatched` with no lead; outbound stamps first response + moves `new` → `contacted`; status `read` then late `delivered` stays `read`; template unknown / not approved / approved utility ok; marketing → `marketing_not_approved` → `no_marketing_consent` → ok → off again; STOP → `opted_out` for session and template, admin cannot delete it, agent cannot read the list) | 6/6 |
| Full suite on staging | **455/455** (46 files) |
| Webhook on the staging dev server, signed with a locally generated app secret | handshake right token → `200 4242`, wrong → 403 · unsigned → **401 bad_signature** (recorded) · tampered body → 401 · signed text → **`in:matched`** · same body again → `duplicate` · signed image + caption → `in:matched` · unknown number → **`in:unmatched`** (no lead, nobody messaged) |
| `/leads` as the Listing Agent, window closed | panel: *This person last wrote more than 24 hours ago…* + the approved `viewing_confirmed` template offered; no platform send button |
| after the signed inbound | **Send from the platform number · test mode** appears; clicking it → `wa_not_configured`, *"The WhatsApp connection is not configured yet. Nothing was sent."*; row recorded `out · session · failed · not_configured`, audit `whatsapp.send_failed`, first response **not** stamped |
| `/admin/whatsapp` as admin | Channel *Targeted*, Marketing *Off*, Secrets 2/3 (token missing), ID number in Test with the seeded contact as the only recipient, template Approved, masked message log (incl. the failed send and the two unmatched strangers), 14 deliveries with verified/rejected verdicts |
| after teardown | flags off, both numbers off, template, messages, deliveries, lead events and notifications removed; contact window reset |

### Found and fixed on the way
- **Unsigned copy suppressed the real delivery.** The first proof's unsigned POST (same body as the genuine one) was recorded first and its body hash made the signed delivery a "duplicate". 00096 makes the hash unique **only for verified** deliveries; an attacker who can guess a body can no longer suppress it.
- **Unknown sender crashed `wa_record_inbound`** (unassigned plpgsql record when no contact → no lead lookup). 00096 uses scalars; a stranger is now `unmatched`, recorded with no lead, nobody messaged. Covered by a new RLS case.
- The WhatsApp RLS file assumed the channel flag starts off; it now captures and restores the flag state itself (the proof setup had it on for the pilot agent, which failed one run).

### Not exercised (honestly)
No call reached Meta. `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` in `packages/db/.env.staging` are locally generated placeholders (marked as such) that exist only so the handshake and signature paths could be driven; there is **no access token**, so every send ends in `not_configured` by design. The Graph client's two calls are written to the documented v21 shapes and are untested against a host. Media download, an auto-greeting for strangers, template sync and any GHL number migration are designed, not built (design §8).

### Owner inputs
Design §6 in full; in short: Business verification → app → system-user permanent token + app secret + verify token (three Worker secrets; the same three in `.env.staging` for the pilot) → the test number's `phone_number_id` and `waba_id` on `/admin/whatsapp` with the five pilot phones as test recipients → the first utility templates submitted to Meta and mirrored in the registry → flag `whatsapp_cloud` targeted to the pilot five. Decisions: which entity owns the WABA / display name; whether strangers get an automatic greeting and its wording; whether a buyer's reply re-opens a closed lead.

---

## Owner decisions in force (7 Nov 2026)

| # | Decision | How it binds the build |
|---|---|---|
| D1 | Reuse existing AI providers/keys; no new subscription | provider-agnostic `packages/ai`; Gemini (Hero's billing) or Anthropic, whichever key the owner supplies; no key found locally (Anthropic key on this laptop is revoked; Hero's Gemini key is a Worker secret) |
| D2 | Hero Phase 1 read-only via `rens:status`; Phase 2 designed, not built | **E8:** `hero_links` + nightly `hero_recheck`; Phase 2 columns read when present; no Hero change |
| D3 | Hero launch benefits: 300 listings, core AI, 50 AI text tasks/month, 10 poster exports/month, CRM, MatchHub, matching, drafting; expiry **30 Jun 2027** in a configurable record; review 1 Jun 2027 | **E8:** `hero_benefits` row (editable at `/admin/hero`) → `entitlement_grants` source `hero_benefit` (`listing.active_limit`, `ai.monthly_usage`, `ai.poster_exports_monthly`, `matchhub.enabled`, `comarketing.enabled`, `content_studio.level`, `ai.roles`); premium image/video/WhatsApp/bulk/ads/large-docs stay credit-metered (E9) |
| D4 | Three price lists MYR/IDR/USD, independently editable, no live FX; default display by verified country (MY→MYR, ID→IDR, other→USD); product names Free/Starter/Pro/Agency mapped onto basic/silver/gold/platinum; free tier keeps 10 AI uses; `FREE_LAUNCH` stays **E9:** `plan_versions` one current per plan per currency (MYR/IDR/USD seeded from this row); `plans.product_key` free/starter/pro/agency; `price_currency_for()` by verified country, never IP; `FREE_LAUNCH` untouched |
| D5 | Pilot 27–28 Nov: 2 MY + 2 ID + 1 optional; real agents only | staging pilot, no fabricated accounts |
| D6 | Zero fixed infra cost; local or free staging preferred; **never production as staging** | owner chose a paid project in the Pro org (one invoice) — US$10/month approved by that choice |
| D7 | Domain stays `propertiguru.id`; no purchase; country-aware routing; brand/domain change by configuration later | Malaysian alias not a prerequisite |
| D8 | Payments: Billplz (FPX), Midtrans (QRIS/VA), Stripe (USD) behind one billing system; WhatsApp: Meta Cloud API direct; GHL stays until replacement tested; live charging and outbound WhatsApp need separate approval | **E11:** adapters + webhook verification built; every gateway `off`, `live` impossible outside LIVE_BILLING by trigger; sandbox round-trips wait for sandbox credentials. **E12:** Cloud API scaffold with the rules in SQL (window, approved template, consent + switch for marketing, permanent opt-out, test recipients); both numbers `off`, flags off, no Meta credentials; GHL untouched; cut-over test defined in the design doc |
