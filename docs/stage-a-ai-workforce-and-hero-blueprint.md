# Stage A — AI Workforce + AG Hero integration into propertiguru.id

*Read-only audit and blueprint, 7 November 2026, v1.0. Produced for the "Corrected Project Directive" (Stage A). **No code, migration, configuration or production data was changed.** Every database figure below came from `SELECT`s through `packages/db/scripts/q.mjs --env=production` against `jokyyhvtahiypuzmfydp`; every file reference was read this session.*

**Gate:** nothing in Stage B starts until the instruction `APPROVE BUILD`. Nothing reaches production until `APPROVE PRODUCTION`.

---

## 0. The answer in one page

**How the AI Workforce and AG Hero will be merged into propertiguru.id — exactly:**

1. **No new application, no new server, no new database.** The AI Workforce becomes new *routes and server actions inside `apps/hub`* (the existing agent dashboard Worker `ag-matchhub`), new *migrations in `packages/db`* (00078 onward), and one new workspace package `packages/ai` that `apps/hub` imports. Scheduled work runs on a **Cloudflare Cron Trigger of the same Worker** — not a separate process.
2. **The six November capabilities land on the surfaces that already exist**, not on new ones:

   | Capability | Lands on | Extends (existing file) |
   |---|---|---|
   | 1 AI Manager | `/dashboard` (the Brief Harian panel) | `apps/hub/src/lib/dashboard/brief.ts`, `app/(agent)/dashboard/page.tsx` |
   | 2 AI Listing Assistant | `/listings/new`, `/listings/[id]/edit` | `app/(agent)/listings/ai-actions.ts`, `lib/ai/listing-writer.ts`, `lib/ai/listing-advisor.ts`, `components/listings/listing-wizard.tsx` |
   | 3 AI Marketing Studio | `/studio/[listingId]`, `/studio/[listingId]/brochure` | `lib/studio/listings.ts`, `app/(agent)/studio/*`, `lib/social/publisher.ts` |
   | 4 AI Communication Secretary | `/leads` (per-lead drawer) + notifications | `app/(agent)/leads/actions.ts`, `lib/notifications.ts`, `lib/contact-detection.ts` |
   | 5 AI Lead Qualifier & Property Matcher | `/leads` (score + reason), `/collab/pool` (matches) | `leads/actions.ts`, `listing_embeddings` + `listing_quality_scores` tables (exist, empty) |
   | 6 AI Task & Appointment Assistant | **one new route** `/tasks`; appointments reuse `viewing_appointments` | `viewing_appointments` (extend), `lib/notifications.ts`, `lib/webpush.ts` |

   The "36 roles" are **data, not 36 code paths**: a seeded `ai_roles` catalogue table rendered as the AI Workforce directory, with six roles `live` in November and thirty `planned` behind the existing `ai_features` feature flag.
3. **Metering reuses what exists.** `entitlement_definitions.ai.monthly_usage` (already defined, already in every plan: 10/50/200/500), `credit_wallets` + `credit_transactions` (extended with a `kind` so AI credits and boost credits share one ledger pattern), `resolve_entitlement_int()` for the gate, a new append-only `ai_jobs` table for cost.
4. **AG Hero is linked, not merged.** Hero stays the authority. Identity link = the agent's verified hub e-mail/phone checked against Hero's existing partner API `POST /api/rens/status` (live since 13 Oct 2026, scoped key, nothing but found / login timestamps returned). A successful link writes `entitlement_grants` rows with `source = 'hero'` — complimentary listings, premium capabilities, promotional AI credits — through the existing grant machinery. Hero AI Coach, Sales Lab and Property Intelligence are **deep-linked from the hub for linked agents, never rebuilt**. The Hero → propertiguru listing route (`/api/listings/ingest`, proven 13/13 on 2 Oct 2026) is extended to Malaysia; it is the only Hero-side data flow and it already exists.
5. **Billing stays `FREE_LAUNCH`.** Plans get a MYR version and a plan *family* so AI Workforce / agency / developer / enterprise plans can coexist with the agent plan; prices are computed and recorded (`SHADOW_BILLING` already exists) and no gateway is wired in November.
6. **Staging first.** There is **no staging database today** (CI skips the RLS suite for lack of one). Stage B's first task is a staging Supabase project + staging Workers; every migration from 00078 runs staging → production, per the repo's hard rule 10.

---

## 1. Current system audit (verified 7 Nov 2026)

### 1.1 Repository and deployment

| Item | Verified value |
|---|---|
| Repository | `C:\Users\User\kamal\propertiguru` — npm workspaces `apps/hub`, `apps/www`, `packages/db`. Not a git repository on this machine (CI config exists at `.github/workflows/ci.yml`). |
| Stack | Next.js 16.3.0 App Router · React 19.2.4 · TypeScript strict · Tailwind v4 · next-intl 4.13 · Supabase JS 2.110 / SSR 0.12 · Zod 4 · Vitest · OpenNext → Cloudflare Workers (`next build --webpack`). |
| Source size | 34,201 lines of TS/TSX across both apps. |
| Hub | Worker **`ag-matchhub`** → `hub.propertiguru.id` (custom domain). 63 pages, 33 server-action files, 4 API routes. `apps/hub/wrangler.jsonc`. |
| Marketplace ID | Worker **`propertiguru-www`** → `www.propertiguru.id`. 4 page templates (`/`, `/cari`, `/properti/[slug]`, `/agent/[slug]`) × locales id/en. |
| Marketplace MY | Worker **`propertiguru-www-my`**, deployed to `propertiguru-www-my.workers.dev` only; custom-domain route commented out in `apps/www/wrangler.my.jsonc` pending the Malaysian domain. Locales en/ms, segments `/search`, `/property/[slug]`. Brand placeholder `Hartanah Hub`. |
| Market mechanism | `apps/www/src/config/market.ts` — `NEXT_PUBLIC_MARKET` fixed at build time; one bundle = one market; all public reads filtered by `country_code`. |
| Database | Supabase `jokyyhvtahiypuzmfydp` (ap-south-1 pooler). **103 base tables · 10 public views · 102 functions (84 `SECURITY DEFINER`) · 222 RLS policies · 233 indexes · 0 tables without RLS.** Extensions: `postgis`, `vector`, `pg_trgm`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault`. **No `pg_cron`.** |
| Migrations | 77 applied (`00001`–`00077`); next is `00078`. Owner: `packages/db/supabase/migrations`. |
| Storage | `listing-media-public`, `agent-profile-public` (public); `agent-verification-private`, `property-original-private`. |
| Billing | `commercial_settings.billing_mode = FREE_LAUNCH`. Modes supported by code: `FREE_LAUNCH`, `SHADOW_BILLING`, `LIVE_BILLING` (`apps/hub/src/lib/entitlements.ts`). |
| Tests | 309 `it()` cases in `packages/db/tests` (rls · unit · integration · e2e stubs); global fixture sweep fails the run on leftovers. CI runs lint/typecheck/build and **skips the RLS suite because no staging secrets exist**. |
| i18n | hub 2,420 keys × en/ms/id; www 225 keys × en/id/ms; parity enforced by `tests/unit/i18n-parity.test.ts`. |
| Secrets the hub Worker expects | `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `TOKEN_SIGNING_SECRET`, `VAPID_PRIVATE_KEY`, `META_APP_ID/SECRET`, `SOCIAL_CRON_SECRET`, `LISTING_INGEST_SECRET`, `LISTING_INGEST_AGENT_ID`. **No AI provider key anywhere.** |

### 1.2 Live data (production row counts)

| Table | Rows | Reading |
|---|---|---|
| `profiles` | 9 | 4 with `agent_profiles`; `user_roles` 2 (admins); **0 Malaysian profiles** |
| `agencies` | 1 | |
| `properties` / `listings` | 45 / 30 published | all `country_code = ID`; **`listing_media` = 0** — no listing has a photo |
| `property_requests` / `property_submissions` | 36 / 9 | MatchHub |
| `leads` / `contacts` | **0 / 0** | the marketplace has never produced a lead |
| `subscriptions` / `entitlement_grants` / `credit_wallets` | 0 / 0 / 0 | commercial engine is live but unused |
| `scheduled_posts` / `social_accounts` | 0 / 0 | Content Studio unused |
| `listing_embeddings` / `listing_quality_scores` / `listing_statistics` | 0 / 0 / 0 | schema exists, nothing populates it |
| `locations` | 8,025 | ID hierarchy + MY 16 states / 117 districts / 129 townships (seeded 6 Nov) |
| `notifications` | 42 | |
| `audit_logs` | 88, **last entry 7 Oct 2026** | |
| `auth.users` signed in last 30 days | **1** | |

**Honest reading:** the platform is architecturally complete and operationally dormant. One sign-in in thirty days, zero leads, zero photos. The November work must therefore be judged on *activation*, not feature count — which is also why the AI Manager (capability 1) matters most: it is the thing that gives an agent a reason to open the app tomorrow.

### 1.3 Existing AI touchpoints

| Where | What exists | Model? |
|---|---|---|
| `apps/hub/src/lib/ai/listing-writer.ts` | Title + description composed from the agent's structured fields | **No** — deterministic by design ("AI-assisted, not AI-dependent"); a provider "slots in behind the same interface" |
| `apps/hub/src/lib/ai/listing-advisor.ts` | Rule checks (location in title, bedroom count, length, CTA…) + a generation layer "wired behind a provider that is not configured yet" | No |
| `apps/hub/src/app/(agent)/listings/ai-actions.ts` | `draftListingCopy()` server action — returns a draft, never writes | No |
| `apps/hub/src/lib/dashboard/brief.ts` | **Brief Harian, rules-only**: ranked actions from RLS-scoped counts; comment says AI prose wraps it later and degrades back to this | No |
| `feature_flags.ai_features` | exists, enabled, untargeted | — |
| `entitlement_definitions.ai.monthly_usage` | "AI generations per month": basic 10 · silver 50 · gold 200 · platinum 500 | — |
| `listing_embeddings` (`vector`), `listing_quality_scores` (11 sub-scores + recommendations) | tables ready, 0 rows | — |
| `docs/module-ai-agent-dashboard.md`, `docs/stage-a-audit-and-architecture.md` §H | governance already written: AI ranks/drafts/warns, never transacts; no open chatbot; every job logged to `ai_jobs`; quotas before the call; PII redacted; a lead is never hidden by a score | — |

Everything the directive calls "AI Workforce" has a **prepared socket** in this codebase. The job is to put a model behind the sockets, not to cut new ones.

### 1.4 AG Hero — what exists on the other side (from `kamal\ag-warriors-hero`, read-only)

| Item | Verified |
|---|---|
| Hero app | `hero.iqiaggroup.com` — Vite/React SPA on Worker `ag-warriors-hero`; API Worker `m4u-api.iqiaggroup.workers.dev` (asia-southeast1, cron `*/5`); **separate** Supabase project `zlbyfgfublqlrsqohvsn` (246 tables, 755 functions). |
| Partner API | `docs/integrations/HERO-API-v1.md` — live 13 Oct 2026. Bearer keys issued in Command HQ → Integrations → API keys, hashed, scoped, expiring. **R1** `GET /api/classes` (`classes:read`). **R2** `POST /api/rens/status` (`rens:status`) → `{found, account_created_at, first_login_at, last_login_at}` by e-mail or phone; nothing else returned. **R3** `POST /api/rens` reserved, not live. "Fields are only ever added." |
| Hero → propertiguru | `worker/src/propertyPortalApi.js` adapter `propertiguru` → `POST hub.propertiguru.id/api/listings/ingest`, secret `PROPERTIGURU_INGEST_SECRET`; `pi_portals` row countries `['ID']`. Platform side `apps/hub/src/app/api/listings/ingest/route.ts` (verified agent required, Indonesian vocabulary only, `match_regency`, idempotent on `source_url`, photos copied to `listing-media-public`, audited). |
| Hero AI | Gemini on the m4u-api Worker: AI Coach (`/coach/*`, 13 users/30 d), Sales Lab (`/lab/*`, 9 users), Property Intelligence (`/pi/*`), Social Command Center, Win Poster, Academy. |
| Hero roles | `master_admin`, `country_admin` (MY), `module_admin[]`; profiles carry country (MY/ID), career rank, REN licence expiry (`profiles.ren_licence_expiry`, 223). |

---

## 2. Existing module inventory — and what each one becomes

Legend: **Keep** = untouched · **Extend** = edited in place · **New** = new file/table.

### 2.1 Agent hub (`apps/hub`)

| Module | Routes | Key files | Nov 2026 verdict |
|---|---|---|---|
| Dashboard / Brief Harian | `/dashboard` | `lib/dashboard/brief.ts`, `(agent)/dashboard/page.tsx`, `announcement-actions.ts` | **Extend** → AI Manager (cap. 1) |
| Listings (wizard, edit, import, moderation) | `/listings`, `/listings/new`, `/listings/[id]/edit`, `/listings/import/*` | `components/listings/listing-wizard.tsx`, `listings/ai-actions.ts`, `lib/ai/*`, `lib/import/*`, `lib/listings/format.ts` | **Extend** → AI Listing Assistant (cap. 2) |
| Content Studio + social scheduling | `/studio`, `/studio/[listingId]`, `/studio/[listingId]/brochure`, `/studio/accounts`, `/studio/scheduled` | `lib/studio/listings.ts`, `lib/social/{meta,publisher}.ts`, `api/social/*`, `studio/social-actions.ts` | **Extend** → AI Marketing Studio (cap. 3) |
| Leads / CRM | `/leads` | `leads/actions.ts` (statuses, `lead_events`, audit), `lib/contact-detection.ts`; `leads` table carries `ghl_*` columns (no GHL client exists) | **Extend** → Secretary (cap. 4) + Qualifier/Matcher (cap. 5) |
| MatchHub co-broke | `/requests/*`, `/submissions/*`, `/r/[token]`, `/p/[token]`, `/wanted` | `lib/projections/*`, `lib/request-links.ts`, `lib/submissions/*` | **Keep** (deep-linked from AI Manager actions only) |
| Co-marketing pool | `/collab/pool` | `components/collab/*`, `comarketing_*` tables | **Extend** lightly → matcher surfaces pool matches |
| Growth / referrals | `/growth` | `growth_campaigns`, `referral_*` | **Keep** |
| Digital card | `/card`, `/c/[slug]` | `lib/card/*` | **Keep** |
| Training | `/training/*` | `training_*` tables (0 guides) | **Keep** |
| Profile / verification | `/profile`, `/verification` | `lib/profile/*`, `agent_profiles`, `agent_verifications` | **Extend** → "Link my AG Hero account" card |
| Notifications | `/notifications` | `lib/notifications.ts` (in-app + push + Resend e-mail), `lib/webpush.ts` | **Extend** → task/appointment reminders (cap. 6) |
| Admin console | `/admin/*` 24 pages (Command Center, agents, listings, commercial, flags, announcements, growth, reports, audit, search, identity, banners, countries, legal, organisations, training, users, requests) | `components/admin/{panel,charts}.tsx`, `components/layout/rail-nav.tsx` | **Extend** → `/admin/ai` (jobs, cost, prompts, roles) and `/admin/hero` (links) |
| Ingest API | `POST /api/listings/ingest` | `api/listings/ingest/route.ts` | **Extend** → Malaysia vocabulary, country from agent, MY location match |
| Auth | `/login`, `/register`, `/join`, `/auth/callback`, `middleware.ts` | Supabase Auth | **Keep** (no second auth; Hero link is a profile attribute, not a login method) |

### 2.2 Marketplace (`apps/www`) — **Keep** entirely in November
Public reads through `public_*` views with the anon key; single write path `submit_public_inquiry()` (migration 00033) → `leads` + `contacts`. The AI Workforce never touches `apps/www`; the hard rule that `apps/www` must not hold the service-role key is unaffected.

### 2.3 Database (`packages/db`) — commercial engine already present
`plans` (basic/silver/gold/platinum, IDR, rank 10–40) · `plan_versions` (v1 current each) · `plan_entitlements` (46 rows, see §5) · `entitlement_definitions` (12 keys) · `entitlement_grants` (source/source_ref/reason/expiry/revocation) · `commercial_policies` + `_targets` (treatment/percent/amount, effective windows) · `commercial_settings` · `subscriptions` + `subscription_events` · `credit_wallets` + `credit_transactions` · `boost_products` + `listing_boosts` · `referral_*` · `feature_flags` + `_targets` (country-aware since 00069) · `capabilities` (10) + `role_capabilities` · `countries` (70 rows; `active` true for ID and MY only — verified) · `audit_logs` + `log_audit()`.

---

## 3. AI integration architecture

### 3.1 Placement — where the AI runs

```
agent browser ──► apps/hub (Worker ag-matchhub, hub.propertiguru.id)
                    │ server actions / route handlers (existing pattern)
                    ├─ packages/ai  (NEW workspace: provider adapters, prompt registry, meter, redaction)
                    │     ├─ anthropic adapter   (text: drafting, qualifying, secretary)   ← default
                    │     └─ gemini adapter      (vision / TTS where Hero already pays)   ← optional
                    ├─ Supabase (existing project): ai_jobs · ai_prompts · ai_roles · agent_tasks ·
                    │            credit_wallets(kind) · listing_embeddings · listing_quality_scores
                    └─ Cron Trigger on the SAME Worker (wrangler `triggers.crons`)
                          07:00 local  → AI Manager daily brief per active agent
                          */15 min     → task & appointment reminders, social publish-due, silence radar
```

* **No new server.** Cloudflare Workers already make outbound `fetch` to any provider; a 20–40 s model call is within Worker limits (the Workers plan is paid on the Hero side; propertiguru's hub is on the same account — verify plan tier in Stage B).
* **No queue infrastructure for v1.** Each capability is request/response on the agent's own action, plus one cron. If volume ever needs it, Cloudflare Queues is a one-binding addition — but that is a post-launch decision.
* **One scheduler fix for free:** `api/social/publish-due/route.ts` exists but **no cron calls it** (no `triggers` in `wrangler.jsonc`, no `pg_cron`). The same Cron Trigger that powers the AI Manager also makes Content Studio scheduling actually fire.

### 3.2 `packages/ai` — the only new package

```
packages/ai/
  src/provider.ts        generate(feature, input, ctx) → { output, usage, costMicros, model, promptVersion }
  src/adapters/anthropic.ts   src/adapters/gemini.ts
  src/prompts/           versioned prompt files, one per feature, locale-aware (id / en / ms)
  src/redact.ts          phone / e-mail / ID-number redaction before any call that does not need them
  src/meter.ts           quota gate (resolve_entitlement_int 'ai.monthly_usage' + wallet) and ai_jobs write
  src/schemas.ts         Zod output schemas — every feature returns structured JSON, never free prose into the DB
```

Rules carried over from the existing governance docs, now enforced in code: business logic never imports a provider SDK; model per feature is a row in `ai_models` editable by an admin, not a constant; every call writes one `ai_jobs` row **before** returning; a failed or over-quota call returns the deterministic path (`listing-writer`, rules-only brief) — never a 500.

Default model routing (configurable):

| Feature | Model | Why |
|---|---|---|
| Brief prose, WhatsApp/e-mail drafts, listing copy, captions | `claude-sonnet-5-5` | quality at agent-facing volume |
| Lead qualification, intent score, task extraction | `claude-haiku-5-5` | cheap, structured output |
| Photo checks (blur, duplicates, PII) | Gemini vision *(optional, Phase 2)* | Hero already runs Gemini vision on photos |
| Embeddings for matching | provider embeddings → `listing_embeddings.vector` | once per listing version, never per search |

### 3.3 The six capabilities, specified

**1 · AI Manager** — *extends `lib/dashboard/brief.ts`*
Input: the existing `DashboardCounts` + open `agent_tasks` + today's appointments + Hero link status. Output (Zod): one paragraph in the agent's language + ≤5 ranked actions, each bound to an existing route (`/leads?id=`, `/listings/[id]/edit`, `/tasks`, `/requests/[id]`). Generated once per agent per day by cron and cached in `ai_briefs`; regenerated on demand if counts change. Quota-exhausted → today's rules-only brief, unchanged from what ships now. Also the **AI Workforce directory** (`/ai`): the 36 roles from `ai_roles`, six marked live with their entry point, thirty `planned` (visible only when flag `ai_features` targets the agent — it is country-targetable already).

**2 · AI Listing Assistant** — *extends `listings/ai-actions.ts` + wizard*
`draftListingCopy()` gains a model path behind the same signature: title ×3, description, selling points, in `id`/`en` (ID) or `en`/`ms` (MY), from the agent's structured fields only (the writer's "cannot hallucinate a pool" guarantee is kept by passing fields, not free text). Advisor rules stay; model adds the "price is 12 % above similar units in …" line using `public_listings` comparables (same country, same type, same district). Writes `listing_quality_scores` (table exists) on save. **Never publishes.**

**3 · AI Marketing Studio** — *extends `/studio/[listingId]`*
One listing → Facebook post, Instagram caption, TikTok script, WhatsApp broadcast, brochure text (brochure route exists). Each goes into the existing `scheduled_posts` row as `caption`; publishing path is unchanged (`lib/social/publisher.ts`, Meta OAuth). Video and poster rendering are **deferred behind flag `marketing_booster`** (Hero's Win Poster can be deep-linked for Hero-linked agents meanwhile).

**4 · AI Communication Secretary** — *extends `/leads` + `lib/notifications.ts`*
Per lead: a drafted reply (WhatsApp first, e-mail second) in the enquirer's `locale`, grounded in the listing and the lead `message`. The agent **edits and sends** — WhatsApp via `wa.me` click-to-chat (no API), e-mail via Resend already wired. Follow-up nudges: "Siti has waited 6 h" → notification. **Official Meta WhatsApp Business API is Phase 2** behind flag `payments`-style switch `whatsapp_api`: it needs Meta business verification and a template review cycle that does not fit in November. WhatsApp only, never SMS (rule 11).

**5 · AI Lead Qualifier & Property Matcher** — *extends `/leads`, `/collab/pool`*
Qualifier: intent score with a stated reason, duplicate-phone warning, "silence radar" (lead going cold). Score **sorts, never hides** (`leads` keeps every row; the page adds a sort). Matcher: `listing_embeddings` populated on publish (cron backfill for the 30 existing); for each lead/request, top-N matches from the agent's own and pool listings, same country only; rationale generated once and cached in `lead_events` (`kind = 'ai.match'`).

**6 · AI Task & Appointment Assistant** — *new `/tasks`; extends `viewing_appointments`*
`agent_tasks` (new): title, due, source (`ai_manager` / `secretary` / `manual`), linked lead/listing/request, done_at. Appointments: `viewing_appointments.submission_id` becomes nullable and gains `lead_id`, `listing_id` so a marketplace lead can book a viewing without a MatchHub submission — extend, not duplicate. The assistant proposes tasks from lead messages and brief actions; the agent confirms. Reminders go through the existing fan-out (in-app + push + e-mail) via cron.

### 3.4 Metering and permissions

* **Gate:** `resolve_entitlement_int(user, 'ai.monthly_usage')` minus this month's `ai_jobs` count, then `credit_wallets` (`kind = 'ai'`) for top-ups. Checked **before** the provider call. Exhaustion → deterministic path + an upgrade prompt from `resolvedPrice()` (exists).
* **New entitlement keys** (rows in `entitlement_definitions`, not code): `ai.roles` (tier: `starter | pro | workforce`), `ai.secretary.enabled`, `ai.matcher.enabled`, `ai.credits_monthly` (credit).
* **New capability** for admins: `ai.manage` (prompts, models, role catalogue, cost ceilings) in `capabilities` + `role_capabilities`.
* **RLS:** `ai_jobs`, `ai_briefs`, `agent_tasks` → owner `auth.uid()` read, inserts only via `SECURITY DEFINER` RPCs; `ai_prompts`, `ai_models`, `ai_roles` → read for all authenticated, write only `has_capability('ai.manage')`. Negative tests for each.
* **Cost ceilings:** per-feature daily cap and a platform monthly cap in `ai_settings` (one row, admin-editable); circuit breaker on provider error rate; both visible on `/admin/ai`.

---

## 4. AG Hero integration plan

### 4.1 Principles (from the directive, kept literally)
Hero is authoritative for membership and organisational data. The marketplace stays open to every legitimate agency. No protected IQI data leaves Hero. **No Hero production change without separate authorisation** — so the plan below has a *Phase 1 that needs nothing from Hero* and a *Phase 2 that lists exactly what Hero would need to add*.

### 4.2 Phase 1 — identity link using the API that already exists (no Hero change)

```
agent on hub /profile → "Link my AG Hero account"
   → hub server action: users_private.email / whatsapp_number (already verified by hub registration)
   → POST https://m4u-api.iqiaggroup.workers.dev/api/rens/status  {email} then {phone}   (Bearer: scoped key rens:status)
   → found && first_login_at != null  ⇒  hero_links row (status 'linked', method 'email'|'phone', checked_at)
   → grant_hero_benefits(user)  ⇒  entitlement_grants (source 'hero', source_ref = hero_links.id, expiry +90 d)
   → log_audit('hero.linked')
```

* Key issued by Kamal in Hero Command HQ → Integrations (scope `rens:status`), stored as Worker secret `HERO_API_KEY`; daily limit 1,000 calls is ample.
* Why `first_login_at` and not just `found`: an account that was created but never used is not an *active* member. This is the strongest signal R2 exposes today.
* Re-check nightly by cron; `found: false` or key error ⇒ link `stale`, benefits **expire at their own `effective_until`** (never revoked abruptly on a transient 5xx — the contract says keep last values and retry).
* **Limitation to state plainly:** R2 does not say *which country* or *whether the REN licence is current*. Phase 1 therefore grants Hero benefits scoped to the agent's own `profiles.country_code` (which the hub already verified through `agent_profiles`), and treats "has a Hero account and has used it" as membership. Good enough for a controlled soft launch of a few dozen agents; not good enough for scale — hence Phase 2.

### 4.3 Phase 2 — what Hero would need to add (separate authorisation, contract-compatible)
R2 response gains fields (allowed — "fields are only ever added"): `country`, `membership_status` (`active | pending | inactive`), `ren_licence_expiry`, `career_rank`. Hero already holds all four (`profiles.country`, status enum, `ren_licence_expiry` from 223, career rank). Hub then grants by status and expires with the licence. Estimated Hero-side effort: one `fn_api_ren_status` change + a test; **not scheduled until authorised**.

### 4.4 Hero benefits — defined as data
A `commercial_policies` row *"AG Hero member — launch benefit"* (treatment: 100 % off the AI Workforce starter plan, effective to a date Kamal sets) with a `commercial_policy_targets` row of kind `hero_linked`, plus the grants written by `grant_hero_benefits()`:

| Benefit | Mechanism (existing) | Proposed value (Kamal to confirm) |
|---|---|---|
| Complimentary listings | `entitlement_grants` `listing.active_limit` | +100 |
| Premium capabilities | `matchhub.enabled`, `comarketing.enabled`, `content_studio.level = advanced` | on |
| Promotional AI credits | `credit_wallets(kind='ai')` + `credit_transactions` reason `hero.welcome` | 200 credits |
| AI monthly usage | `ai.monthly_usage` grant | +200 |

Values are rows, not code; the admin changes them on `/admin/commercial`.

### 4.5 Reusing Hero AI Coach, Sales Lab, Property Intelligence
* **Coach and Sales Lab:** deep links from the AI Workforce directory and the AI Manager's actions ("practise this objection in Sales Lab") to `hero.iqiaggroup.com/coach-ai` and `/lab`, shown only to `hero_links.status = 'linked'` agents. Hero keeps its own login; a true SSO would require a shared identity provider across two Supabase projects — **not worth it for November** and it would be a Hero production change.
* **Property Intelligence → marketplace:** the ingest route already receives Hero-approved Indonesian listings. Extension for Malaysia: `country_code` from the target agent profile (already read), `currency` default from `countries`, `measurement_unit` sqft for MY, `FROM_HERO` mapping to the MY vocabulary added in 00075 (terrace, condominium, semi_detached…), location by a `match_location_my(state, district, township)` lookup against the seeded MY rows, and `LISTING_INGEST_AGENT_ID` replaced by **per-country** company agent IDs. On the Hero side, `pi_portals.propertiguru.countries` would need `['ID','MY']` — a configuration row, flagged as Hero change.
* **Nothing from Hero's database is copied into propertiguru** beyond what the agent already consents to by linking (the found / login timestamps) and what Hero's portal job sends for a listing the agent asked to publish.

---

## 5. Database and permission impact (proposed migrations — none written)

| # | Migration | Tables / changes | RLS |
|---|---|---|---|
| 00078 | `ai_foundation` | `ai_models` (feature → provider, model, max cost), `ai_prompts` (versioned, locale), `ai_settings` (caps), `ai_jobs` (append-only: user, feature, model, prompt_version, tokens_in/out, cost_micros, latency_ms, status, error, ref_type/ref_id; **no raw PII**), `ai_briefs` | owner-read; RPC-only insert; admin via `ai.manage` |
| 00079 | `ai_roles_catalogue` | `ai_roles` (key, group, name/description jsonb per locale, capability_route, status live/planned, country_codes[]) + seed of 36 | read authenticated; write `ai.manage` |
| 00080 | `ai_entitlements` | rows in `entitlement_definitions`, `plan_entitlements` for current versions, `capabilities.ai.manage`, `role_capabilities` | n/a |
| 00081 | `credit_wallet_kinds` | `credit_wallets` PK → `(agent_id, kind)`, default `'boost'`; `credit_transactions.kind`; wallet RPCs take `p_kind` | existing policies re-stated |
| 00082 | `agent_tasks` | new table + `viewing_appointments.submission_id` nullable + `lead_id`, `listing_id` FKs + check (exactly one anchor) | owner; MatchHub policies unchanged for submission-anchored rows |
| 00083 | `hero_links` | `hero_links` (user_id, method, status, hero_checked_at, last_result jsonb *without* PII), `grant_hero_benefits()`, `revoke_hero_benefits()` (sets `effective_until`) | owner-read; RPC-only; admin read |
| 00084 | `plan_families_and_myr` | `plans.family` (`agent` default · `ai` · `agency` · `developer` · `enterprise`), `plan_versions.country_code`, uniqueness "one current version per plan per country", MYR versions of the four agent plans + three AI Workforce plans (prices TBD by Kamal), `subscriptions` unique per (user, family) | existing |
| 00085 | `ingest_multi_country` | `match_location_my()`, `countries.settings` carries the ingest agent per country | definer |
| 00086 | `listing_intelligence_backfill` | RPCs to compute `listing_quality_scores` and request embeddings for published listings | definer |

Hard-rule checks on every one of the above: no policy subqueries into their own table (rule 4); actor FKs → `auth.users` (rule 6); money `numeric` (rule 7); audit on link/grant/revoke/job-cap-change (rule 9); RLS + a negative test per new table.

**Permission matrix additions**

| Actor | ai_jobs | ai_prompts/models/roles | agent_tasks | hero_links | AI calls |
|---|---|---|---|---|---|
| Agent (verified) | own rows read | read | own CRUD | own (link / unlink) | within quota |
| Agent (unverified) | — | read | — | — | **none** (same rule as publishing) |
| Admin with `ai.manage` | all | write | — | read all | unlimited, logged |
| `apps/www` anon | — | — | — | — | — |
| Hero (server) | — | — | — | — | ingest only, as today |

---

## 6. Subscription integration plan

* **Stays `FREE_LAUNCH` throughout November.** Every entitlement resolves exactly as today; `resolvedPrice()` keeps computing what an agent *would* pay so `SHADOW_BILLING` can be switched on for a report without new arithmetic.
* **Free standard listings** = `basic.listing.active_limit` (20) and the launch `commercial_policies` "free period" already modelled; fair-use limit is a plan value, not code.
* **Plan families** (00084) are what let one agent hold *agent plan* + *AI Workforce plan* while an agency holds an *agency* plan and a developer a *developer package*: the `subscriptions` unique key changes from (user) to (user, family). Enterprise = a plan with `rank` above platinum and admin-only assignment, nothing more.
* **AI credit top-ups** = `credit_transactions` rows against `kind = 'ai'`, created by an admin now and by a payment webhook later.
* **Malaysia pricing** = MYR `plan_versions` with `country_code = 'MY'`; the hub picks the version by the agent's country; the ID catalogue is untouched.
* **Payments:** gateway integration (Xendit/Midtrans for IDR, a MYR gateway for Malaysia) is Stage B *scaffolding only* behind the existing `payments` flag (currently off): provider adapter interface, webhook route with signature check, `subscription_events` writing. **Live billing is not activated** without the directive's separate approval and a tested dry run.

---

## 7. Security risks

| # | Risk | Severity | Mitigation in this plan |
|---|---|---|---|
| S1 | **No staging database**; CI cannot run the 309-case suite; all 77 migrations have only ever run on production | **High** | Stage B task 1: staging Supabase project + staging Workers; `--env=staging` in `load-env.mjs`; RLS job in CI gets its secrets |
| S2 | Secrets pasted in chat earlier (DB password, `sb_secret_…`) not yet rotated | **High** | Rotate before any new Worker secret is added; standing item |
| S3 | AI prompt injection via lead messages, listing text, imported spreadsheets | High | Structured-output schemas; untrusted text wrapped and labelled; model output never executed, never auto-sent, never auto-published |
| S4 | PII to a third-party model | High | `redact.ts` before every call that does not need contact data; `ai_jobs` stores references, not text; provider data-retention terms recorded in `/admin/ai` |
| S5 | Cost runaway | Medium | Quota before call, daily per-feature cap, monthly platform cap, circuit breaker; brief cached once/day |
| S6 | Hero API key leakage | Medium | Worker secret only, scope `rens:status`, rotate by re-issue; key never in `apps/www` |
| S7 | Hero link spoofing (claiming someone else's Hero e-mail) | Medium | Link only against the hub's *own verified* e-mail/phone, never user-typed values; nightly re-check; benefits expire |
| S8 | Cross-country leakage in matching/comparables | Medium | Every AI read goes through country-filtered views; tests assert an MY lead never matches an ID listing |
| S9 | `viewing_appointments` relaxation could expose MatchHub rows | Medium | Policies split by anchor type; negative test: lead-anchored row invisible to supply agents |
| S10 | Worker cron fires on the production Worker only | Low | `CRON_SECRET` header on routes; staging has its own trigger |
| S11 | EXIF/GPS on listing photos (standing) | Medium | Unchanged standing item; photo pipeline untouched in November |

---

## 8. UI/UX storyboard (within the existing design system — Red leads, Blue informs, Inter, `Panel`/`StatCard`, `RailNav`)

1. **Dashboard** — top panel becomes *AI Manager*: avatar chip "Pengurus AI", one paragraph, ≤5 action rows (each a red primary link to an existing route), "regenerate" (quota-aware), footer "Rules-only mode" when quota is out. Below it the existing Perlu Perhatian / Modul anda panels, untouched.
2. **/ai — AI Workforce** — grid of 36 role cards grouped by the twelve directive categories; live roles open their surface; planned roles show "Dirancang · Q1 2027" and a notify-me. Admin sees usage per role.
3. **Listing wizard, step "Copy"** — "Draft with AI" button → three titles (radio), description (editable), selling points (chips), advisor list with fix/improve/good; quality score ring; nothing enabled until the agent edits/accepts.
4. **Studio /studio/[listingId]** — tabs Facebook · Instagram · TikTok · WhatsApp · Brochure; each tab: generated text, "Schedule" (existing), platform account chip; video tab greyed with flag notice.
5. **Leads** — list gains an *Intent* column (badge + one-line reason) and a *Waiting* column (silence radar). Drawer: enquiry, listing, matched alternatives (3 cards), **"Draft reply" → editable text → "Open WhatsApp" (wa.me) / "Send e-mail"**; "Add task / Propose viewing" buttons.
6. **/tasks** — today / overdue / upcoming; each task shows its source (AI Manager · Secretary · manual) and link; appointments as a day strip; reminders toggle.
7. **Profile → "AG Hero"** card — Link / Linked since / Re-check / Unlink; benefits list with expiry; deep links to Coach, Sales Lab, Property Hub (linked only).
8. **Admin /admin/ai** — jobs table (feature, model, cost, latency, status), daily cost chart (existing SVG charts), prompt registry with version diff, model routing table, caps and circuit-breaker state, role catalogue editor.
9. **Admin /admin/hero** — links list, re-check all, benefit policy pointer.
All strings in `messages/{id,en,ms}.json`; parity test extended.

---

## 9. Development backlog (Stage B, after `APPROVE BUILD`)

P0 = needed for the 30 Nov soft launch · P1 = launch-week follow-up · P2 = deferred behind a flag.

| Epic | Stories | Files/migrations | P |
|---|---|---|---|
| **E0 Staging & safety** | staging Supabase project replayed 00001–00077 + fixtures; `--env=staging`; staging Workers (`ag-matchhub-staging`, `propertiguru-www-staging`); CI RLS job secrets; rotate pasted secrets | `packages/db/scripts/load-env.mjs`, `.env.staging`, `wrangler.staging.jsonc` ×2, `ci.yml` | P0 |
| **E1 AI foundation** | `packages/ai` (adapters, prompts, meter, redaction); 00078–00080; `/admin/ai`; Cron Trigger on hub Worker (+ makes `publish-due` fire) | new package; `apps/hub/wrangler.jsonc` `triggers`; `api/ai/cron/route.ts` | P0 |
| **E2 AI Manager** | prose over `brief.ts`; `ai_briefs` cache; `/ai` directory + `ai_roles` seed (36) | `lib/dashboard/brief.ts`, `(agent)/dashboard/page.tsx`, `(agent)/ai/page.tsx`, 00079 | P0 |
| **E3 Listing Assistant** | model path in `listing-writer`/`advisor`; comparables; quality score write; wizard UI | `lib/ai/*`, `listings/ai-actions.ts`, `components/listings/listing-wizard.tsx`, 00086 | P0 |
| **E4 Marketing Studio** | multi-platform copy; brochure text; schedule hand-off | `lib/studio/listings.ts`, `(agent)/studio/[listingId]/page.tsx` | P0 |
| **E5 Secretary** | reply drafts; wa.me + Resend send; nudges | `leads/actions.ts`, `(agent)/leads/page.tsx`, `lib/notifications.ts` | P0 |
| **E6 Qualifier & Matcher** | intent score + reason; duplicate/silence; embeddings backfill; matches in drawer and pool | `leads/*`, `collab/pool`, 00086 | P0 (matcher P1 if time) |
| **E7 Tasks & Appointments** | `agent_tasks`; `/tasks`; `viewing_appointments` extension; reminders cron | 00082, `(agent)/tasks/*` | P0 |
| **E8 Hero link + benefits** | `hero_links`; link action against R2; nightly re-check; `grant/revoke_hero_benefits`; policy + targets; profile card; `/admin/hero` | 00083, `(agent)/profile/*`, `lib/hero/client.ts` | P0 |
| **E9 Commercial** | 00081 wallet kinds; 00084 families + MYR versions + AI plans; admin UI for AI credit grants; price display by country | `/admin/commercial`, `lib/entitlements.ts` | P0 (families) / P1 (MYR prices after Kamal confirms) |
| **E10 Ingest multi-country** | MY vocabulary, location matcher, per-country ingest agent | `api/listings/ingest/route.ts`, 00085 | P1 |
| **E11 Payments scaffold** | adapter interface, webhook with signature, `subscription_events`; flag off | `lib/payments/*`, `api/payments/webhook` | P2 |
| **E12 WhatsApp Business API** | Meta Cloud API adapter, template registry | `lib/whatsapp/*` | P2 |
| **E13 Voice / video / posters** | voice-to-listing, poster/video rendering | — | P2 (deep-link Hero Win Poster meanwhile) |

---

## 10. November delivery schedule (7 → 30 Nov 2026)

| Week | Dates | Deliverable | Exit evidence |
|---|---|---|---|
| 0 | 7–9 Nov | **This blueprint** → `APPROVE BUILD` decision; Kamal answers §13 | — |
| 1 | 10–14 Nov | E0 staging + E1 foundation + E2 AI Manager (rules + prose) | staging URL; RLS suite green in CI; first `ai_jobs` rows on staging; brief visible on staging dashboard |
| 2 | 17–21 Nov | E3 Listing Assistant · E4 Studio · E5 Secretary | 3 capabilities demonstrable on staging in id/en/ms; quota exhaustion degrades cleanly |
| 3 | 24–26 Nov | E6 Qualifier/Matcher · E7 Tasks · E8 Hero link · E9 families | end-to-end: register → verify → link Hero → benefits → listing with AI copy → lead → draft reply → task → reminder |
| 4 | 27–28 Nov | **Operational pilot** on staging with 3–5 real agents (ID + MY); fixes; feature-completion report with test evidence; security review; backup verification | `APPROVE PRODUCTION` request |
| — | 29–30 Nov | Production release (migrations staging-verified → production, Workers deployed, flags targeted to pilot cohort only) | smoke tests on production; rollback rehearsed |

Buffer: E10 and MYR pricing slide to the first week of December without affecting the soft launch; E11–E13 are flagged off and not on this schedule.

---

## 11. Acceptance tests (added to `packages/db/tests` + a Playwright-style e2e on staging)

**RLS / data (Vitest, staging)**
1. Agent A cannot read agent B's `ai_jobs`, `ai_briefs`, `agent_tasks`, `hero_links`.
2. Unverified agent gets `quota = 0` from the AI gate and the deterministic draft.
3. Over-quota agent: no provider call made (adapter stub asserts zero invocations), rules-only brief returned, no 500.
4. `ai_jobs` is append-only (update/delete denied even to admins).
5. Lead-anchored `viewing_appointments` row invisible to any supply agent; submission-anchored behaviour unchanged (existing MatchHub tests still pass).
6. Hero link with `found: false` creates no grants; with `found: true, first_login_at: null` creates no grants; with a login creates exactly the configured grants with `source = 'hero'`; nightly re-check on `found: false` sets `effective_until`, never deletes.
7. MY lead never receives an ID match; ID agent never sees an MY comparable.
8. `credit_wallets` kind migration leaves boost arithmetic identical (existing commercial tests green).
9. i18n parity for every new key in id/en/ms.

**Functional (staging, by hand with screenshots in the completion report)**
10. Register → verify → dashboard shows AI Manager brief in the agent's language with ≥1 action linking to a real route.
11. New listing → "Draft with AI" → edit → save → quality score row exists → publish → appears on the correct market site only.
12. Studio → four platform texts → schedule → cron publishes (or records a Meta error) within 15 min.
13. Public inquiry on www → lead on hub with intent badge → draft reply → `wa.me` opens with the drafted text → task created → reminder notification arrives.
14. Profile → Link Hero (real Hero account) → benefits visible → Sales Lab deep link opens Hero.
15. `/admin/ai` shows every call above with cost; cap set to 0 → next call degrades; audit rows for cap change and Hero link.

**Non-functional**
16. Brief generation ≤ 8 s p95; draft ≤ 12 s p95 on the Worker.
17. Cost per active agent per day ≤ a ceiling Kamal sets (proposed USD 0.10) at pilot volume, read from `ai_jobs`.

---

## 12. Production deployment and rollback plan

**Deployment (after `APPROVE PRODUCTION`)**
1. Freeze: tag the staging-verified commit; export production backup (Supabase PITR point noted; `pg_dump` of the 103 tables kept locally).
2. Migrations 00078–00086 applied **to production in order** by `npm run db:migrate` — each already run on staging, each idempotent where possible, each with a paired `down` note in its header.
3. Worker secrets added by `wrangler secret put`: `AI_PROVIDER_KEY`, `HERO_API_KEY`, `CRON_SECRET`.
4. `npm run deploy:hub` (wipes `.open-next`, builds, `verify-build-target.mjs` checks the Supabase ref, deploys `ag-matchhub`). `apps/www` is **not redeployed** — unchanged.
5. Flags: `ai_features` targeted to the pilot cohort (country + specific users via `feature_flag_targets`), not global; `payments` stays off.
6. Smoke: §11 tests 10, 13, 14 on production with pilot accounts; `/admin/ai` shows jobs.

**Rollback (any step)**
* Worker: `wrangler rollback` to the previous deployment id (recorded before step 4) — seconds.
* Flags: untarget `ai_features` — AI surfaces disappear, deterministic paths remain, no data loss.
* Database: migrations are additive (new tables, nullable columns, new rows); the only structural change to a live table is `credit_wallets` PK (0 rows today) and `viewing_appointments.submission_id` nullability — both reversible by the paired `down`. Nothing in 00078–00086 drops or rewrites existing data.
* Hero: nothing to roll back — Phase 1 touches no Hero system; a leaked key is revoked in Command HQ.

---

## 13. Decisions needed from Kamal before/with `APPROVE BUILD`

1. **AI provider & key:** Anthropic (recommended, `claude-sonnet-5-5` / `claude-haiku-5-5`) with a new API key, Gemini reusing Hero's billing, or both?
2. **Hero API key:** issue one with scope `rens:status` for the hub (Phase 1). And whether to authorise the Phase 2 Hero change (§4.3) now or later.
3. **Hero benefit values** (§4.4 table) and the launch-benefit end date.
4. **AI Workforce plan prices** (IDR and MYR) and whether a free AI tier exists outside Hero members (current `basic` already carries 10 AI uses/month).
5. **Pilot cohort:** names of 3–5 real agents (ID and MY) for 27–28 Nov.
6. **Staging budget:** a second Supabase project (free tier is enough for staging) — confirm.
7. **Malaysian domains** (marketplace + hub alias) — not blocking the AI work, but needed before Malaysian agents are invited.
8. Confirmation that **payments and WhatsApp Business API are out of November scope** (this plan assumes yes).

---

### Assumptions stated
* Soft launch = pilot cohort on production behind targeted flags, not a public announcement.
* "AI Manager" = orchestrating daily brief + task creation + routing, not an autonomous agent that acts; this matches the governance already in `docs/module-ai-agent-dashboard.md`.
* Cloudflare Workers plan on this account allows the longer CPU time needed for model calls (Hero's account was moved to paid on 24 Sep 2026); to be verified in Stage B week 1.
* Hero's partner API base URL and contract are as documented on 13 Oct 2026; re-verified against `GET /api/health` in Stage B.

*End of Stage A. Awaiting `APPROVE BUILD`.*
