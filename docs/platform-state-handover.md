# PropertiGuru — what already exists

**Handover reference, 10 Aug 2026.** Written to be pasted into another AI tool
before it designs a new module, so it extends the platform instead of rebuilding
it. Everything below is verified against the live repo and database, not
recalled.

---

## 1. What this is

Two Next.js apps, **one Supabase project**, one Cloudflare account.

| App | Domain | Audience | Status |
|---|---|---|---|
| `apps/hub` | **hub.propertiguru.id** | Agents + admins | **LIVE** |
| `apps/www` | **www.propertiguru.id** | Buyers, tenants | **LIVE** |
| `packages/db` | — | Migrations, seeds, RLS tests | sole owner of the schema |

Monorepo at `C:\Users\User\kamal\propertiguru` (npm workspaces).
Supabase project `jokyyhvtahiypuzmfydp` (ap-south-1). There is **no staging
environment** — `packages/db/.env.staging` points at production despite the name.

The public site carries exactly **one** agent-facing element: a "Masuk agen"
button in the header linking to the hub. Nothing else on www addresses agents.

### Stack
Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 tokens ·
Supabase (Postgres/Auth/Storage) · next-intl · Zod in server actions · Vitest ·
Cloudflare Workers via OpenNext.

`src/middleware.ts` — edge, NOT `proxy.ts` (Node-only, breaks on Cloudflare).
`next build --webpack` — OpenNext does not support Turbopack.

---

## 2. Database — 78 tables, 10 public views, 55 migrations

Migrations are `packages/db/supabase/migrations/NNNNN_name.sql`, applied with
`node scripts/db-migrate.mjs --env=staging`. **Next number is 00056.**

### Tables by domain

**Identity & access**
`profiles` `users_private` `user_roles` `roles` `agencies` `agent_profiles`
`agent_verifications` `agent_social_links` `push_subscriptions` `notifications`

**Reference**
`countries` `currencies` `languages` `locations` (7,763 — 34 provinces, 514
regencies, 7,215 districts) `location_aliases` `landmarks` `id_sequences`
`brand_settings` `brand_assets`

**Catalogue**
`properties` `property_private` `listings` `listing_media` `listing_media_source`
`listing_price_history` `listing_status_history` `listing_statistics`
`listing_quality_scores` `listing_embeddings`

**Leads**
`leads` `lead_events` `contacts` `inquiry_rate_limits`

**MatchHub (co-broke)**
`property_requests` `property_request_private` `request_links`
`request_link_access_logs` `request_edit_log` `property_submissions`
`property_submission_private` `property_submission_media`
`property_submission_sources` `submission_status_history`
`client_presentations` `client_presentation_properties` `client_access_logs`
`client_feedback` `offers` `viewing_appointments` `conversations` `messages`
`contact_release_requests`

**Co-marketing**
`comarketing_offers` `comarketing_offer_private` `comarketing_engagements`

**Commercial**
`boost_products` `listing_boosts` `credit_wallets` `credit_transactions`
`site_banners`

**Commission & legal**
`commission_agreements` `commission_agreement_versions` `commission_acceptances`
`declarations` `declaration_versions` `consent_records` `legal_disclosures`
`legal_disclosure_acknowledgements` `violation_reports` `violation_report_admin`

**Content modules**
`social_accounts` `social_account_secrets` `scheduled_posts`
`training_guides` `training_guide_translations` `training_progress`

**Ops**
`audit_logs` `property_imports`

### Public views — the ONLY thing anon may read
`public_listings` `public_listing_media` `public_agent_profiles`
`public_agent_listings` `public_agent_social_links` `public_site_banners`
`public_platform_identity` `public_active_declarations`
`public_facet_property_types` `public_facet_locations`

---

## 3. Routes that already exist

### hub.propertiguru.id (agent + admin)
```
/                          -> redirects: signed in /dashboard, else /login
/login /register /forgot-password /reset-password /verify-email
/dashboard                 rules-based "Brief Harian" (what to do now)
/leads                     inbox with response SLA
/listings                  inventory: own + borrowed
/listings/new              7-step creation wizard (AI description, draft save)
/listings/[id]/edit        edit form
/collab/pool               co-marketing pool: browse, offer, pick up
/requests  /requests/new  /requests/[id]  /requests/[id]/edit
/requests/[id]/presentation  /requests/[id]/s/[sid]
/submissions  /submissions/[sid]
/studio  /studio/[listingId]  /studio/[listingId]/brochure
/studio/accounts  /studio/scheduled
/training  /training/[guideId]
/card                      digital name card management
/c/[slug]                  public digital name card
/profile  /verification  /notifications
/wanted                    public wanted board
/r/[token]  /r/[token]/submit    password-gated supply-agent link
/p/[token]  /p/[token]/compare   client presentation link

/admin                     queue overview
/admin/agents  /admin/agents/[id]      verification
/admin/listings                        moderation
/admin/requests  /admin/requests/[id]  /admin/requests/[id]/add-property
/admin/reports  /admin/reports/[id]    violation reports
/admin/banners                         marketplace ad banners
/admin/identity                        group-identity switch
/admin/countries  /admin/legal  /admin/audit  /admin/training
```

### www.propertiguru.id (public)
```
/[locale]                  homepage: search, facets, promoted rail, ad banners
/[locale]/cari             search + filters
/[locale]/properti/[slug]  property detail + lead capture
/[locale]/agent/[slug]     agent landing page (own + borrowed, noindex)
```

---

## 4. Modules already built — do not rebuild

| Module | Where | Notes |
|---|---|---|
| **Agent dashboard** | `/dashboard` | Rules-only "what should I do now", no AI cost |
| **Leads + SLA** | `/leads` | Lead capture → assignment → response clock |
| **Listing creation** | `/listings/new` | 7 steps, category-filtered types, AI description (deterministic, no API key), localStorage draft restore |
| **Listing edit** | `/listings/[id]/edit` | Editing a published listing returns it to review |
| **Moderation** | `/admin/listings` | draft → pending_review → published/rejected |
| **Boost** | listings page | 3 days on top then lapses; `credit_cost = 0` today |
| **Co-marketing** | `/collab/pool` | Offer under terms, pick up with immutable snapshot, no chain borrowing |
| **Agent landing pages** | www `/agent/[slug]` | Own + borrowed as one inventory, noindex |
| **MatchHub** | `/requests`, `/submissions` | Private co-broke: requirement → admin approval → gated link → submissions → client presentation |
| **Commission agreements** | tables | Versioned, dual-accepted, server-validated splits |
| **Ad banners** | `/admin/banners` | Two homepage slots, scheduled, labelled "Iklan", `rel="sponsored"` |
| **Group identity switch** | `/admin/identity` | Launch neutral, reveal IQI later. Default OFF |
| **Digital name card** | `/card`, `/c/[slug]` | |
| **Content studio** | `/studio` | Poster/brochure/social from a listing |
| **Training** | `/training` | Guides with progress |
| **Property import** | `packages/db/scripts/import/` | Excel → normalized → validated → draft listings |
| **Marketplace** | www | Search, facets, detail, lead capture, KPR calculator |

---

## 5. Hard rules a new module MUST follow

1. **`apps/www` must never hold `SUPABASE_SERVICE_ROLE_KEY`.** Not "must not
   use" — must not *have*. It reads only through `public_*` views with the anon
   key and writes nothing directly.
2. **Confidentiality by projection.** A buyer must never receive supply-agent
   identity, commission data, minimum price or internal notes — in any payload,
   HTML, header, filename or error.
3. **RLS on every new table**, plus a negative test proving the wrong role is
   blocked. Roles live in `user_roles`, never in client metadata.
4. **Never subquery a table inside its own policy.** Use a `SECURITY DEFINER`
   helper or a `BEFORE UPDATE` trigger. Four `42P17` incidents came from this.
5. **Confidential columns go in `*_private` companion tables.** RLS filters
   rows, not columns.
6. **Actor/audit FK columns point at `auth.users`, never `profiles`.** A second
   `profiles` FK breaks every PostgREST embed on that table.
7. **Money is `numeric`**, never float. Splits validated in Postgres.
8. **Versioned immutables** — consents, commission agreements, disclosures get
   new rows; accepted versions are never overwritten.
9. **Append-only audit** via `log_audit()` for every critical action.
10. **WhatsApp only, never SMS.**
11. **No hard-coded** app name, colours, roles, countries, prices, plan IDs or
    domains. Brand → `src/config/brand.ts`; text → `messages/*`.
12. **UI strings in all three locales** (hub: en/ms/id — www: id/en), zero drift.

### Guards that will reject sloppy writes
- `guard_listing_moderation_fields()` — agents cannot set moderation state,
  featured flags or quality scores
- `guard_comarketing_offer()` — no offer without owner authorisation on record
- `guard_comarketing_pickup()` — accepted terms are written from the server's
  copy, never from the client
- `guard_profile_slug()` — a slug is a published URL; never rewritten on rename
- `guard_site_banner()` — an active banner must name its advertiser

---

## 6. Conventions

- **Supabase clients**: `lib/supabase/server.ts` (RLS, user session),
  `client.ts` (browser), `service.ts` (bypasses RLS — hub only, server-only,
  only after an explicit authz check)
- **Human IDs**: `public.next_human_id('LST')` → `LST-2026-000123`. Display
  only, never a security token
- **Server actions**: Zod validation, `redirect(?error=code)` on failure, error
  codes mapped to i18n keys
- **Audit**: `logAudit({ action, entityType, entityId, next })` — one object
- **i18n**: a dot in a key creates a nested object. Notification kinds use
  underscores for this reason
- **New migration**: next number, RLS + policies + explicit
  `revoke all ... from anon` and grant-back

---

## 7. Traps that already cost time — do not rediscover

| Trap | Consequence |
|---|---|
| Supabase's default grants give `anon` ALL on new tables/views | Six separate leaks. Always `revoke all` + explicit grant |
| `current_user` inside `SECURITY DEFINER` is the function *owner* | A privilege escalation: an agent self-published a rejected listing. Guards are `SECURITY INVOKER`, use `session_user` |
| `on conflict do nothing` skips a parent on a natural-key clash | Children orphan silently while the run reports success |
| `.env.local` outranks `.env.production`, and `NEXT_PUBLIC_*` is inlined | A deploy ships a worker talking to the wrong database, silently. `scripts/verify-build-target.mjs` now refuses it |
| OpenNext does not clear `.open-next/cache/` between builds | A correct build ships the previous build's fetch cache |
| `create or replace function` silently overwrites a same-named guard | Nearly put an insert guard on an update trigger |
| Fire-and-forget inserts hide RLS denials | Two trails looked fine and were empty |
| `auth.users.confirmed_at` is `generated always` | Rejects any supplied value on copy |
| Supabase's `handle_new_user` trigger writes `profiles` rows | Collides with a real migration |
| Row-by-row inserts on 7k+ rows | Pooler drops the connection mid-transaction. Batch at 500 |
| React Compiler rejects `Date.now()` in render and sync `setState` in effects | Build fails |
| Adding an i18n key mid-session | Dev server caches messages — **restart required** |

---

## 8. What does NOT exist yet — fair game for a new module

- **Entitlements engine** — `MAX_ACTIVE_LISTINGS = 20` is a flat constant in
  `src/config/quotas.ts`, awaiting plans/entitlements tables
- **Payments** — the credit ledger exists, every product is priced at 0
- **EXIF/GPS stripping** on uploaded photos (needed before real public launch)
- **Announcements channel** — admin → agent broadcasts
- **Turnstile** — keys not set
- **Co-marketing phases C–E** — lead attribution, AI pool ranking, per-agent AI
  copy, invite-only and agency-scoped pools
- **Custom agent domains** (`namaagen.com`) — the Premium tier idea
- **Duplicate/exclusivity detection** across the whole catalogue (only the
  import path has it)
- **Listing quality score surfaced in the UI** — table exists, half-built
- **GHL integration** — client written, runs in dry-run, needs Indonesia token

---

## 9. Recipe for adding a module

1. Migration `00056_*.sql`: tables + RLS + policies + `revoke all from anon` +
   explicit grants. Confidential columns to a `*_private` companion.
2. Public read (if any) through a new `public_*` view — never a base table.
3. `apps/hub/src/app/(agent)/<module>/` or `(admin)/admin/<module>/`:
   `page.tsx` + `actions.ts` (Zod + `logAudit`).
4. Strings in `messages/en.json`, `ms.json`, `id.json` — all three, no drift.
5. Dashboard card in `apps/hub/src/app/(agent)/dashboard/page.tsx` and nav entry
   in `components/layout/agent-shell.tsx`.
6. Verify: `npx tsc --noEmit`, `npm run lint`, and an anon-boundary check
   proving the new tables are unreadable without a session.
7. Deploy: move `.env.local` aside, `npm run deploy`, restore it.

---

## 10. Current data

30 published listings (imported from the IFCA P365/PICI workbook, **no
photographs** — every source image was watermarked), 9 agent accounts, 7,763
locations, 2 sample ad banners.

Owning agent for imported stock: **PMgr Ts Kamal AG**, `kamal@iqiindonesia.id`,
+6285808001688 — public slug `/agent/kamal-ag`.

Theme: **merah putih** — `--brand: #b11226` on white. Green is reserved for the
"verified" signal only.
