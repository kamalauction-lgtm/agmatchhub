# Admin Platform 2.0: review and proposal

This review is based on main `66399bb`, read on 10 Nov 2026.

- **Storyboard:** 14 desktop screens at https://claude.ai/artifact/JXkAKtGEEjpq4PrEtSJKAW. The link is private until the owner shares it.
- **Scope of the evidence:** the Phase 0 findings come from reading the code and SQL. Each claim names the file it rests on.

**Status on 10 Nov 2026.** The owner approved the sequence, and P0-a is in [PR #10](https://github.com/kamalauction-lgtm/agmatchhub/pull/10), head `b4ae846`.

- **Staging:** the PR runs on the staging Hub as version `8ec8d9f4…`. Country-admin validation passed there, after fixing D12 and D13.
- **P0-a2:** D11 (direct table reads) is fixed in [PR #12](https://github.com/kamalauction-lgtm/agmatchhub/pull/12), stacked on #10, with `00105` on staging.
- **P0-b:** agent invitations are in [PR #13](https://github.com/kamalauction-lgtm/agmatchhub/pull/13), stacked on #12. `00106` is on staging, and the staging Hub runs version `535ea9fc…`.
  - Owner decision: Option B. `agent.invite` goes to `super_admin`, `admin` and `country_admin`.
  - P0-d will grant `listing.import_assisted` to the same three roles.
- **Open:** D14, configuration-table writes (P1).

**Latest status, 11 Nov 2026 (evening).**
- **PRs:** 19 stacked Admin PRs (#10, #12–#24, #26–#30) are open for the owner's merge decision, CI green through #29. Migrations `00103`–`00120` are on staging only.
- **Production avatar cleanup:** done and audited. 2 avatars were re-encoded and 5 superseded files deleted; the scan reports clean.
- **Staging fixes:** the profile upload fix (#26), the handover lock (#27), Batch Review bulk editing (#28) and D9 buyer reports (#29) are validated on staging.
- **Release:** the brief is `docs/release/admin-2.0-release-brief.md`.

**Earlier status, 11 Nov 2026.** Six stacked PRs are green and open for the owner's merge decision: #10 `b4ae846`, #12 `19afdcb`, #13 `c23e29f`, #14 `97af7d2`, #15 `14180fa` and #16 `0c87b6b`. Migrations `00103`–`00110` are on staging only.

- **P0-d-1** (assisted import, agent commits) is staging-validated in [PR #14](https://github.com/kamalauction-lgtm/agmatchhub/pull/14).
- **P0-e-1a** (private photo intake) is staging-validated in [PR #15](https://github.com/kamalauction-lgtm/agmatchhub/pull/15).
- **P0-e-2a** (photo processing) is **staging-validated at `0c87b6b`, with CI green** (all 66 test files) in [PR #16](https://github.com/kamalauction-lgtm/agmatchhub/pull/16). It runs on the Images Free plan, capped at $0 by pausing at 4,500 transformations a month.
- **Held:** P0-c and P0-d-2 are with counsel. `import_photos` stays off for real agents.
- See "Storyboard status" below for each of the 14 screens.

**How to read this document.** Three kinds of statement appear, and they are kept apart:

- **Existing:** what the code does today (the Phase 0 table).
- **Verified defect:** a fault confirmed in the code, listed under "Verified defects" with the file and line. P0-a fixes some of them.
- **Proposed:** new work (Phase 10). None of it is built, and each slice is behind its approval gate.

Paths below are shortened as follows:

- `A` = `apps/hub/src/app/(admin)/admin`
- `G` = `apps/hub/src/app/(agent)`
- `M` = `packages/db/supabase/migrations`

---

## Phase 0: what exists today

Each feature is given one of four grades:

- **WORKING:** exists and works.
- **IMPROVE:** exists but needs improvement.
- **PARTIAL:** partly implemented.
- **MISSING:** not built.

| Area | Grade | Evidence and notes |
|---|---|---|
| Admin layout and navigation | IMPROVE | The `NAV` array in `A/layout.tsx` lists 23 flat destinations in 5 groups and filters them by `my_capabilities()`. The comment there says 17. Detail routes are not in the menu. |
| Admin dashboard | IMPROVE | `A/page.tsx` (611 lines) calls the RPCs in `M/00065`, `00070`, `00071` and `00072`. **Bug:** both `admin_action_queues.agents_awaiting` and the health check count `agent_status = 'submitted'`. That value is not allowed by the `00001` CHECK constraint; agents are actually moved to `under_review`. The queue therefore always shows 0. |
| Admin RPC exposure | **P0 security** | All `admin_*` RPCs and `admin_search` (`M/00065`, `00067`, `00070`–`00072`) are `SECURITY DEFINER`, have `grant execute … to authenticated`, and contain no admin check. Any signed-in agent can call them through PostgREST. `admin_search` returns other agents' emails and lets the caller search by phone number. |
| Agent verification | IMPROVE | `G/verification/actions.ts` handles the agent side. The admin side is `A/agents`, `A/agents/[id]` and `reviewAgent` (approve, reject, request info), and it is audited. Gaps: <ul><li>The agent is not notified of the decision.</li><li>There is no suspend or restore UI.</li><li>The queue has no search or country filter.</li><li>The status writes are not in one transaction.</li></ul> |
| Admin creates or invites an agent | PARTIAL, unsafe | This exists only inside `A/requests/[id]/add-property`, through `lib/agents/admin-create.ts`. It calls `auth.admin.createUser`, generates a password and **emails it in plain text**, and also shows it to the admin through a cookie. Missing: <ul><li>an invite or magic-link flow</li><li>a forced password change</li><li>a standalone invite page</li><li>an audit row for account creation</li></ul> In the same flow the admin accepts `supply_agent_submission` on the agent's behalf, so `consent_records.user_id` holds the admin's id, not the agent's. |
| Roles and capabilities | IMPROVE | `M/00060` defines 9 capability keys, `00063` adds `growth.manage` and `00080` adds `ai.manage`. Each admin page calls `requireCapability`. `/admin/audit` and `/admin/search` have no capability check. |
| Country scoping of admins | PARTIAL | `user_roles.country_codes`, `has_capability_in` and `admin_country_scope` all exist. `has_capability_in` is used only on the users page, so a `country_admin` can see every country. Most older RLS policies still use `is_platform_admin()`. |
| Audit | IMPROVE | `log_audit` is in `M/00001`. There are about 90 calls across 46 files, and every admin action is covered. Gaps: <ul><li>`actor_role`, `country_code` and "acting for" are never filled in.</li><li>`log_audit` is still executable by `authenticated`, so any user can insert rows, although the actor is always themselves.</li><li>The audit page shows the last 100 rows with a single `ilike` filter on the action.</li></ul> |
| RLS on the import, media and lead tables | WORKING | Owner-or-admin policies use definer helpers such as `owns_import_batch` and `owns_listing`, and anon is revoked. |
| Organisations | PARTIAL | `agencies` and commercial policy targets exist (`A/organisations`). Nothing in the UI creates or edits an agency or links an agent to one, and the fixed-price currency is hard-coded to `"IDR"`. |
| Listing moderation | IMPROVE | `A/listings`, `moderateListing`, the guard triggers in `M/00030`, `00038` and `00039`, and status history in `00037`. Gaps: <ul><li>The queue shows only `pending_review`, capped at 50.</li><li>There are no reason codes, bulk actions, or flag or suspend actions.</li><li>The quality score from `00083` is computed but not shown, and does not gate publishing.</li><li>A rejected listing has no way to be resubmitted.</li></ul> |
| Listing quality | PARTIAL | `compute_listing_quality()` from `M/00083` is never shown to moderators. It also counts unprocessed photos. |
| Agent self-import (portal URLs) | WORKING | `G/listings/import/actions.ts` and `lib/import/adapters.ts` read schema.org data only and stop on CAPTCHA or WAF pages. `safe-fetch.ts` blocks SSRF and checks every redirect. |
| Agent self-import (spreadsheet) | WORKING | `upload-actions.ts` and `lib/import/spreadsheet.ts`. The template has no photo-URL columns. |
| Import commit | IMPROVE | `G/listings/import/commit-actions.ts` writes normal `properties` and `listings` rows as drafts with `moderation_state = pending` and records the `listing_import_authority` consent. It hard-codes `country_code: "ID"`, `language: "id"` and the IDR default, so a Malaysian agent's import is mis-tagged. Locations are matched with the ID-only `match_regency`. |
| **Imported images on the normal commit path** | **MISSING** | Confirmed from end to end: <ul><li>The adapters extract up to 12 photo URLs into `extracted.imageUrls` (`adapters.ts:254–390`).</li><li>`commit-actions.ts` never reads `imageUrls` and never writes `listing_media`.</li><li>The review UI tells the agent: "Photos cannot always be moved… upload your own" (`photosNote`).</li></ul> |
| Image provenance table | PARTIAL, unused | `listing_media_source` (`M/00055`) holds the page URL, image URL, sha256 and a licence note. **Nothing writes to it**: there are no hits for it in `apps/` or `packages/db/scripts`. |
| Partner ingest images (`api/listings/ingest`) | IMPROVE, bug | The route copies images into the bucket, but: <ul><li>`storage_path` has no bucket prefix, unlike the wizard, which writes `listing-media-public/…`.</li><li>`processed_path` and `thumbnail_path` are left NULL, and www reads `processed_path`. Ingested photos are marked `ready` but show no image on www, in the admin queue or in Studio.</li><li>It uses a raw `fetch`, not `safe-fetch`.</li><li>The cover can be set twice; the unique-index error is swallowed and the photo is still counted as stored.</li></ul> |
| Media processing | MISSING | `M/00036` says it outright: images go in as-is, with no EXIF or GPS stripping, thumbnails or phash. The same file marks this as required before public launch. The wizard sets `storage_path`, `processed_path` and `thumbnail_path` all to the original file. There is no reorder or delete UI after a listing is created. |
| AI photo check | IMPROVE | `lib/ai/photo-check.ts` and `photo-rules.ts` give advice only: blur, face, plate, watermark, not-property, and best cover. Nothing acts on the result, and there is no admin queue. |
| Consent and legal | IMPROVE | `M/00004` provides versioned declarations, frozen `accepted_text` and immutable consent records. `A/legal` publishes versions. Missing: <ul><li>a declaration in which the agent authorises admin-assisted import</li><li>a photo-rights declaration</li></ul> `lib/consents.ts` `DeclarationKey` also omits two keys that are already seeded: `listing_import_authority` and `buyer_inquiry`. |
| Leads | IMPROVE | www writes only through `submit_public_inquiry()`, a definer RPC granted to anon, with rate limits and a consent check (`M/00033`). That RPC hard-codes `consent_records.country_code = 'ID'`. `00086` has no explicit GRANTs. The GHL drainer `ghl-drain.mjs` exists but nothing schedules it. |
| Requests (MatchHub) | WORKING | `A/requests` and `G/requests`, with approval and link issue. |
| Reports | PARTIAL | `violation_reports` (`M/00016`) covers MatchHub submissions and requests only. There is **no report path for a marketplace listing**, and no evidence upload. `G/listings/[id]/report` is the owner performance report, not an abuse report. |
| Growth and referrals | WORKING | `M/00063` and `00064` hold the DB-trigger rewards. `A/growth` holds campaigns, rules and reversal. |
| Commercial and plans | WORKING | Entitlements, resolvers, wallets and price lists (`M/00061`, `00062`, `00090`–`00092`). |
| Payments | PARTIAL by design | The Billplz, Midtrans and Stripe adapters and their webhooks are coded (`M/00094`). Every provider is off, billing is `FREE_LAUNCH`, and the credit packs have no prices. |
| AI Workforce | IMPROVE | 36 roles, caps, routing, a kill switch and personas (`M/00078`–`00098`, `A/ai`). Human approval is built in. Model costs default to 0, and there is no import or onboarding assistant role. |
| WhatsApp | PARTIAL | `lib/whatsapp/client.ts` really calls the Cloud API, but the `whatsapp_cloud` flag is off, the accounts are off, and messages are sent one lead at a time only. |
| Email | IMPROVE | `lib/email.ts` (Resend) does nothing without a key. The template still uses the old "IQI AG MatchHub" brand and colours, which breaks hard rules R1 and 12. |
| Notifications | WORKING | `lib/notifications.ts` sends in-app, push and email. `kind` is free text. There are no per-user channel preferences. |
| Country configuration | IMPROVE | The `countries` table and `A/countries` handle activation, language, currency and units. Terminology, timezone and supported languages cannot be edited. Code hard-codes `ID` and `IDR` in four places: import commit, wizard, inquiry RPC and organisations. |
| Flags, announcements, banners, hero, training | WORKING | — |
| www boundary | WORKING | www has no service key; `src/lib/supabase/public.ts` throws if one is present. Reads go only through `public_*` views and are country-filtered per deployment. |

### Verified defects

These are confirmed in the code. "Fixed in P0-a" means fixed on the PR #10 branch and on staging; nothing reaches production until the PR is merged and the owner approves a production migration.

| # | Defect | Where | Status |
|---|---|---|---|
| D1 | Admin reporting RPCs and `admin_search` are callable by any signed-in user | `M/00065`, `00067`, `00070`–`00072` | Fixed in P0-a (`00103`) |
| D2 | Dashboard queues count statuses that cannot exist (`submitted`, `pending_approval`, `open`/`reviewing`), so they always read 0 | `M/00065:77–79`, `M/00072:98,116` | Fixed in P0-a (`00103`) |
| D3 | Admin country scope is stored but not enforced in admin actions or lists | `lib/authz.ts`, admin actions | Fixed in P0-a for agents, listings and requests. Other admin areas are still unscoped. |
| D4 | `log_audit` rows carry no actor role | `M/00001:205` | Fixed in P0-a. The function stays callable by signed-in users; see the PR. |
| D5 | Imported image URLs are extracted but never saved | `G/listings/import/commit-actions.ts:108–194` | Open. Next slice: see "Media handoff" below. |
| D6 | Partner-ingest photos never appear: the path has no bucket prefix, `processed_path` is NULL, and the image is fetched with a raw `fetch` | `app/api/listings/ingest/route.ts:160–180` | Fixed on staging in P0-e-3b ([PR #20](https://github.com/kamalauction-lgtm/agmatchhub/pull/20), `00113`). Rights basis: the written partner agreement (owner, 11 Nov). |
| D7 | Admin-created agents receive a plain-text password, and the admin accepts the declaration for them | `lib/agents/admin-create.ts`, `A/requests/[id]/add-property/actions.ts:189` | Open (P0-b, P0-c) |
| D8 | `ID`, `IDR` and `id` are hard-coded in the import commit, the listing wizard and `submit_public_inquiry` | `commit-actions.ts:144,179–181`, `G/listings/actions.ts:160,203–206`, `M/00033:335` | **Fixed on staging.** The import commit was fixed in P0-d-1 (#14). The wizard, `submit_public_inquiry` (`00111`) and organisation currency are fixed in P0-d-1b ([PR #17](https://github.com/kamalauction-lgtm/agmatchhub/pull/17)), staging-validated 20/20. Still open: <ul><li>The deterministic copy writer still writes Indonesian sentences for MY listings.</li><li>A re-check found no market mismatch on staging or production. Five staging records use the other market's vocabulary; a correction is proposed in `p0d1b-data-and-copy-followups.md`.</li></ul> |
| D9 | No marketplace-listing report path exists | `M/00016` | Open (P1) |
| D10 | The email template carries the old brand | `lib/email.ts` | Open (P1) |
| D11 | Admin table read rules are not country-scoped. Through the database API, a MY country admin can read ID rows in `users_private`, `agent_profiles`, `listings`, `property_requests` and `property_request_private` (reproduced on staging, 10 Nov) | Older policies use `is_platform_admin()` (`M/00001` onward) | Fixed in P0-a2 ([PR #12](https://github.com/kamalauction-lgtm/agmatchhub/pull/12), `00105`, staging only). Do not grant `country_admin` on production until #10 and #12 are merged and migrated. |
| D12 | The verification-file storage rule let any admin sign any agent's documents | `M/00002` | Fixed in P0-a (`00104`, staging) |
| D14 | Global configuration tables (countries, brand settings, banners, declarations, training, locations) still grant writes to any admin through `is_platform_admin()`, so the 00060 capability split for them is enforced in the Hub only. Found from the policy text; not exercised. | `M/00001` onward | Open (P1) |
| D13 | The add-property page showed out-of-scope requests (it reads through the service client) | `A/requests/[id]/add-property/page.tsx` | Fixed in P0-a (staging) |

---

## Phase 9: storyboard

The 14 screens are at https://claude.ai/artifact/JXkAKtGEEjpq4PrEtSJKAW. Every screen shares one sidebar showing the nine workspaces, and the top band is styled after `CommandHeader`.

**Tokens used**, all from `apps/hub/src/app/globals.css`:

- `--command-from: #0b1b33` and `--command-to: #16294a`
- `--blue: #2563eb` and `--command-link: #9fb8ff`
- `--command-gold: #c9a64b` and `--accent-soft: #f6efdb`
- `--page: #f8fafc`, `--line: #e2e8f0`, `--muted: #64748b`
- the status inks `--success-ink` and `--warning-ink`
- Inter

**About the figures on the screens:** every figure is a placeholder (`[n]`). None is a real KPI.

**Existing components to reuse when this is built:**

- `components/ui/command-header.tsx`: the top band on every screen.
- `components/layout/rail-nav.tsx`: the sidebar, regrouped.
- `components/import/import-review.tsx` and `import-starter.tsx`: screens 5 and 6.
- `components/listings/photo-check-panel.tsx` with `lib/ai/photo-check.ts`: screen 7.
- AI Live Office pieces for screen 12: `components/ai/office/agent-status-badge.tsx`, `agent-avatar-card.tsx`, `workforce-gallery.tsx`, the `lib/ai/cast.ts` portraits, and the `office-state.ts` states.
- Existing pages that the new screens extend rather than replace:
  - `A/agents/[id]` → screen 4
  - `A/listings` → screen 9
  - `A/users` and `A/audit` → screen 13
  - `A/ai` → screen 12
  - the commercial snapshot RPC → screen 11

| # | Screen | What it is built on |
|---|---|---|
| 1 | Command Centre | `A/page.tsx` regrouped into one action queue sorted by risk and age |
| 2 | Agent Acquisition Pipeline | NEW. Uses the existing `agent_status` values once an account exists |
| 3 | Invitation and Onboarding | NEW. Replaces the temporary-password email |
| 4 | Agent 360 | Extends `A/agents/[id]` with consent, portfolio, plan and timeline |
| 5 | Import Workbench | NEW admin entry point onto the existing importer |
| 6 | Batch Review | Extends `import-review.tsx` with bulk actions, a quality column and source-versus-edit display |
| 7 | Photo Quality Centre | NEW queue for photo-check results. Quarantine uses the existing `processing_state` |
| 8 | Source Mapping and Sync | NEW registry (P2) |
| 9 | Moderation | Extends `A/listings` with checks, reason codes, flags and bulk approval |
| 10 | Leads and Requests Ops | NEW SLA view over `leads` and `lead_radar` showing metadata only |
| 11 | Commercial and Growth | Regroups `A/commercial`, `A/payments` and `A/growth` |
| 12 | AI Workforce | Extends `A/ai` with Office components |
| 13 | Permissions and Security | Extends `A/users` with a matrix view and lists the P0 findings |
| 14 | Handover and Notifications | NEW, plus the agent-side "prepared portfolio" |

### Storyboard status (11 Nov 2026)

**Method.** I reused the Phase 0 inventory and the build notes for P0-a to P0-e-2a. I rechecked only the routes that changed on the PR branches, plus places where evidence was missing: the nav, the audit and search guards, the users matrix, the AI page and the country hard-coding. `main` has not changed the Hub since `66399bb`; its only new commit is a www locale fix.

**What "done" means here.** "Infra" counts as done when it is on staging and covered by tests. A screen counts as done only when the storyboard screen itself exists. Everything below is **staging only**.

**The grades:**

- **Done:** the screen exists and is tested on staging.
- **Partial:** the screen exists, but parts of the storyboard are missing.
- **Infra only:** the backend is built, but the storyboard screen is not.
- **Not started:** nothing has been built.

| # | Screen | Current route | Implemented and tested (staging) | Partly implemented | Remaining | Grade |
|---|---|---|---|---|---|---|
| 1 | Command Centre | `/admin` | **Infra.** RPC guards (D1), true queue counts (D2) and `actor_role` in audit (D4), in `00103` and the `admin-rpc-guards` test | The dashboard is still the old 611-line page. The nav is 24 flat items in 5 groups; invitations and imports were added. | <ul><li>One queue sorted by risk and age.</li><li>Queue tiles for invitations, imports and photos.</li><li>The nine-workspace nav.</li><li>Search moved into the top bar.</li></ul> | Partial |
| 2 | Agent Acquisition Pipeline | none | — | — | <ul><li>`agent_prospects` and `/admin/agents/pipeline`.</li><li>Retention period (owner decision 5).</li></ul> | Not started |
| 3 | Invitation and Onboarding | `/admin/agents/invitations`, `/invite/[token]` | **Screen and infra.** `00106`: hashed tokens, rate-limited redemption, country scope, separation of duties. 20 RLS tests and 20/20 HTTP checks. Temporary passwords are removed from add-property. | Activation is sign-in followed by redemption. | OTP or passkey steps, and accepting the declarations at activation (**P0-c, counsel**). | Done, apart from the steps held by counsel |
| 4 | Agent 360 | `/admin/agents/[id]` | **Country scope.** Country-scoped reads and actions (`00105`); verification files scoped (D12, `00104`); `invited_by_me` blocks self-approval. | Verification review works. | <ul><li>Consent, portfolio, plan and timeline panels.</li><li>Suspend and restore.</li><li>Notifying the agent of decisions.</li><li>Search and a country filter on the queue.</li></ul> | Partial |
| 5 | Import Workbench | `/admin/imports` | **Screen and infra.** `00107`: `listing.import_assisted`, provenance guard, D15 owner check, consent owner guard. 19 RLS tests and 20/20 HTTP checks. | The admin prepares and the agent commits. | The admin commits on the agent's authority (**P0-d-2, counsel**). | Done for P0-d-1 |
| 6 | Batch Review | `/admin/imports/[batchId]`, agent `G/listings/import/[batchId]` | Read view and handover. The agent's batch page attaches photos (`00108`: 13 RLS tests and 14/14 checks). | — | Bulk actions, a quality column, source-versus-edit display (P1-a). | Partial |
| 7 | Photo Quality Centre | none (photos are handled inside `/admin/listings`) | **Infra.** <ul><li>Private intake and provenance (`00108`).</li><li>Processor with metadata stripped and derivatives private (`00109`, `00110`): 9 RLS tests, 17 unit tests, 18/18 end-to-end.</li><li>Per-photo Keep out.</li><li>A `failed` state with a replacement request.</li></ul> | Signed previews and Keep out exist inside moderation. | <ul><li>`/admin/media` queue.</li><li>Wiring the AI photo check into a queue.</li><li>`media.review` capability.</li></ul> (P1-a) | Infra only |
| 8 | Source Mapping and Sync | none | **Provenance infra.** `listing_media_source` is now written, one row per photo. | — | Source registry and re-sync (P2). | Not started |
| 9 | Moderation | `/admin/listings` | **Screen changes.** <ul><li>Country-scoped decisions (P0-a).</li><li>A block on approving your own prepared listing (P0-d-1).</li><li>Private previews, Keep out, and publishing only the processed derivatives (P0-e-2a).</li></ul> | It is still a 50-item `pending_review` queue. | <ul><li>Reason codes and bulk approval.</li><li>Flag and suspend.</li><li>Showing the quality score (`00083`).</li><li>Resubmitting a rejected listing.</li></ul> (P1-a) | Partial |
| 10 | Leads and Requests Ops | `/admin/requests`, `/admin/reports` | **Country scope.** Requests and request links are country-scoped (D3, D11, D13). | Requests and approvals work. Reports cover MatchHub only. | <ul><li>`/admin/leads` SLA view.</li><li>Reporting a marketplace listing (D9).</li><li>`submit_public_inquiry` hard-codes `ID` (D8).</li></ul> | Partial |
| 11 | Commercial and Growth | `/admin/commercial`, `/payments`, `/growth`, `/hero`, `/banners`, `/organisations` | Not touched by P0. These pages were WORKING at Phase 0. | Separate pages, not yet regrouped into one workspace. | <ul><li>Regroup the pages.</li><li>Create and edit agencies.</li><li>Organisations hard-code `IDR` (D8).</li><li>Payments are off by design (`FREE_LAUNCH`).</li><li>Config-table writes (D14).</li></ul> | Partial (pages exist, screen not built) |
| 12 | AI Workforce | `/admin/ai` | Not touched by P0. The page has roles, caps, routing, the kill switch and personas. | The Office components exist on the agent side; `/admin/ai` does not use them. | <ul><li>The Office view in admin.</li><li>Real model costs (they default to 0).</li><li>An import or onboarding assistant role.</li></ul> | Partial |
| 13 | Permissions and Security | `/admin/users`, `/admin/audit`, `/admin/flags`, `/admin/countries` | **Infra.** <ul><li>`has_capability_in` everywhere a target has a country (`00105` rewrote 68 policies on 46 tables).</li><li>The `country_admin` role is now safe to grant on staging.</li><li>`actor_role` in audit.</li></ul> `/admin/users` **already shows** the capability matrix with grants. | `/admin/audit` and `/admin/search` check only `requireAdmin()` (no capability key). The audit view shows the last 100 rows with one filter. **Country settings:** activation, language, currency, unit and the ingest agent can be edited. | <ul><li>Audit filters and export.</li><li>Revoking `log_audit` from `authenticated`.</li><li>D14.</li><li>Editable terminology, timezone and supported languages.</li><li>The P0 findings list on screen.</li></ul> | Partial |
| 14 | Handover and Notifications | none on the admin side; the handover action is on `/admin/imports/[batchId]` | **Handover infra.** `admin_import_batch_handover` and `handed_over_at` (`00107`). | — | <ul><li>`/admin/handover`.</li><li>The agent's `G/listings/prepared` page.</li><li>`listing_change_requests`.</li><li>The new notification kinds.</li><li>The email rebrand (D10).</li></ul> (P1-b) | Infra only |

**Tally:**

- **Done:** 2 screens, #3 and #5, each apart from the steps held by counsel.
- **Partial:** 8 screens (#1, #4, #6, #9, #10, #11, #12, #13).
- **Infra only:** 2 screens (#7, #14).
- **Not started:** 2 screens (#2, #8).

**Cross-cutting status:**

- **Country management:** enforced in the database and the Hub for every P0 area. Remaining:
  - D8: the wizard, the inquiry function and organisations;
  - D14;
  - configuration that cannot yet be edited.
- **Security:** D1–D4 and D11–D13 are fixed, along with D15 and the derived-path hole (`00110`), all on staging.

### Completion assessment (11 Nov 2026, after P0-d-1c)

**How to read it:**

- **A completed storyboard screen** means the whole screen as drawn is built.
- **A working application screen** means a route that works today, possibly the pre-2.0 page.
- **Production:**
  - It runs `main` and is at migration `00102`. **None of PRs #10 and #12–#18 is merged or deployed.** So every 2.0 change below is **staging only**.
  - The production entries describe what live admins see today.
  - The only production *data* change is the six listing locations set on 11 Nov.

| # | Screen | Actual route | Implemented functions (staging) | Staging test evidence | Production status | Remaining work | Blocker |
|---|---|---|---|---|---|---|---|
| 1 | Command Centre | `/admin` | <ul><li>Admin-only reporting functions (D1).</li><li>True queue counts (D2).</li><li>Invitations and imports in the nav.</li><li>**P1-e-1 (#32):** one action queue across nine kinds, ranked by risk weight × age, capability-filtered and RLS-scoped, with count tiles; the nine-workspace nav; search in the top bar.</li></ul> | `admin-rpc-guards` RLS test; P0-a HTTP checks 10/10; **P1-e-1 8/8** (order equals an independent ranking; no cross-country item); 5 unit tests | Old dashboard; the queue counts are wrong (D2 is unfixed there) and the reporting functions are **open to any signed-in user (D1)** | none (the acquisition pipeline route is screen 2, held) | D1 waits on the production merge |
| 2 | Agent Acquisition Pipeline | none | — | — | none | `agent_prospects` table and `/admin/agents/pipeline` | **Owner:** retention period (decision 5) |
| 3 | Invitation and Onboarding | `/admin/agents/invitations`, `/invite/[token]` | <ul><li>Hashed, rate-limited, country-scoped invitations.</li><li>Create, resend, revoke and redeem, each audited.</li><li>Separation of duties.</li><li>Temporary passwords removed.</li></ul> | 20 RLS tests; 20/20 and 7/7 HTTP checks | **Not live.** Production still emails temporary passwords (D7) | OTP or passkey steps; declarations at activation | **Counsel** (P0-c) for the activation declarations |
| 4 | Agent 360 | `/admin/agents/[id]` | <ul><li>Country-scoped reads and actions.</li><li>Scoped verification files.</li><li>A block on approving an agent you invited.</li></ul> | country-scope RLS tests; P0-a 10/10 | Working, but unscoped (D11, D12) | none: **built in #31 (P1-d-1, 00121)**, with consent and portfolio panels (the plan panel existed), suspend and restore (live listings paused and restored exactly; the agent sees a notice with the reason; the database refuses their listing writes), the agent told of every decision, and queue search, country filter and a Suspended tab. 5 RLS tests, **16/16** end to end. | none |
| 5 | Import Workbench | `/admin/imports`, `/admin/imports/[batchId]` | <ul><li>The admin prepares for an agent in their country.</li><li>Handover.</li><li>The agent commits.</li><li>D15 owner check; country-correct commit (D8).</li></ul> | 19 RLS tests; 20/20 HTTP checks | **Not live** | The admin commits on the agent's authority | **Counsel** (P0-d-2) |
| 6 | Batch Review | `/admin/imports/[batchId]`, agent `/listings/import/[batchId]` | <ul><li>Batch view and handover.</li><li>Agent photo attachment.</li><li>**P1-a (#21):** a review table with a quality column (field completeness, or the listing's database score once committed), photos saved, every field edited from the source (old → new), and bulk skip or restore under the 00107 write policy, audited.</li><li>**P1-c-1 (#28):** inline bulk editing. Set the property type (only the agent's market's types) and sale or rent across the selected items, merged into their overrides, with readiness re-checked. It is closed once the agent is in control, and audited.</li></ul> | 14/14 (photo attach); **P1-a 35/35**; **P1-c-1 13/13** | Agent self-import only | none | none |
| 7 | Photo intelligence | **`/admin/media`** (P1-a, #21) | <ul><li>Private intake, clean derivatives, retries, keep-out, $0 cap (P0-e).</li><li>**P1-a:** the Photo Quality Centre, with the `media.review` key on exactly the `listing.moderate` roles.</li><li>Views: needs attention, processing, awaiting, kept out, all.</li><li>Signed previews, failure reasons, quota and cap pauses, rights basis, rule checks labelled "no AI", the $0 meter.</li><li>Keep out, Release (with separation of duties) and Retry as country-checked database functions (00114), audited.</li></ul> | 9 RLS tests (00114), 9 (00109), 17 unit; 18/18 processing; **P1-a 35/35** | **Not live** | <ul><li>**AI photo review: depends on configuring an AI provider** (staging has none); the screen says no AI runs until then.</li><li>Every agent photo now goes through the processor: change-request photos (P1-b-2, #23) and the wizard's own uploads (P1-b-3, #24, 00117). If a moderator approves before processing finishes, wizard photos publish once they are clean.</li></ul> | Photo rights for real agents (`import_photos` off) |
| 8 | Source Mapping and Sync | none | Provenance rows only | covered by the P0-e-1a tests | none | Source registry and re-sync as proposed edits | P2; legal review of portal terms |
| 9 | Moderation | `/admin/listings` | <ul><li>Country scope, self-approval block, private previews, keep-out, publishing derivatives only (P0).</li><li>**P1-a (#21):** Awaiting / Rejected / Live tabs with paging.</li><li>The quality score with its issues.</li><li>Every photo's real state, missing rights evidence, and what approval will publish.</li><li>Reason codes (00114).</li><li>Bulk approve and reject through the same per-listing checks.</li><li>Taking down a live listing.</li><li>Photos without rights evidence are held private.</li><li>Agents see the coded reason, and editing resubmits a rejected listing.</li></ul> | **P1-a 35/35**: cross-country approve and bulk refused, the rights hold proven; **D9 6 RLS, 17/17 end to end** | Unscoped, 50-item queue | <ul><li>~~Buyer flags (D9)~~: **built in #29**, with "Report this listing" on the marketplace (anonymous, rate-limited, through a definer function) and the **`/admin/listings/reports`** flag queue ("Reported (n)"; actioned or dismissed, audited).</li><li>Agent suspension, which is carried to Agent 360 (screen 4).</li></ul> | none |
| 10 | Leads and Requests Ops | `/admin/requests`, `/admin/reports` | <ul><li>Requests country-scoped.</li><li>Inquiry consent recorded in the listing's country (`00111`).</li></ul> | country-scope tests; inquiry-country RLS test | Requests work but are unscoped; inquiries all recorded as `ID` | <ul><li>~~`/admin/leads` response-time view~~: **built in #30** (request.manage; country-scoped; no buyer contact shown).</li><li>~~Reporting a marketplace listing (D9)~~: built in #29.</li></ul> | none |
| 11 | Commercial operations | `/admin/commercial`, `/payments`, `/growth`, `/hero`, `/banners`, `/organisations` | Organisation fixed price in the agency's currency (D8) | wizard check 20/20 (the organisation part) | Working pre-2.0 pages; organisation prices in IDR only | <ul><li>Regrouping into one workspace.</li><li>Creating and editing agencies.</li><li>Configuration-table writes (D14).</li></ul> | Payments are off by design (`FREE_LAUNCH`) |
| 12 | AI Workforce administration | `/admin/ai` | Not changed by 2.0. The copy assistant now follows the listing's language (P0-d-1c), on the agent side. | 15/15 copy checks (fallback writer only; **staging has no AI provider**) | Working pre-2.0 page | <ul><li>The Office view in admin.</li><li>Real model costs.</li><li>An import assistant role.</li><li>Reviewed Malay phrases.</li></ul> | Malay phrases need a localisation review |
| 13 | Countries and permissions | `/admin/users`, `/admin/countries`, `/admin/flags`, `/admin/audit` | <ul><li>Country scope in 68 policies.</li><li>`country_admin` usable.</li><li>`actor_role` in audit.</li><li>The capability matrix (already on `/admin/users`).</li><li>The listing form country-correct (D8).</li><li>Six production locations set.</li><li>**P1-f-1 (#33):** D14 (00122: global settings need a global grant, per-country rows the capability in that country); 00123: clients can no longer write the audit trail (anon could), `log_audit_as` for the server, and **`audit.view`** (global) to read it; 00124: admin search scoped to the admin's countries; audit filters and a CSV export (audited); editable timezone and terminology.</li></ul> | the RLS suite (69 files green); wizard 20/20; **P1-f-1 9/9**, security-scope 5 RLS tests, audit-filter 4 unit tests | Working but **unscoped**; `country_admin` must not be granted there yet | <ul><li>The Sabah and Sarawak districts (held).</li><li>Townships in the form (held).</li></ul> | **Owner:** the official location lists and the Sarawak option; the township level |
| 14 | Handover, notifications and reporting | **`/admin/handover`** (P1-b, #22); agent `/listings/[id]/edit#changes` | <ul><li>Handover record (00107).</li><li>**P1-b:** change requests (00115): moderators ask for a correction or an original photo instead of rejecting; agents answer; moderators resolve or withdraw. Every step is a country- or owner-checked database function, audited.</li><li>The Handover screen: requests, plus prepared batches with agent progress.</li><li>New notification kinds in 3 languages.</li><li>**Email rebrand (D10):** brand values from `brand_settings`, none in code.</li><li>**P1-b-2 (#23):** the agent uploads the requested photo privately (00116). It goes through the $0 processor with rights basis `agent_supplied`. Handover shows a private preview, and resolving the request publishes the clean derivative.</li></ul> | 18 RLS tests, 4 unit; **P1-b 20/20**, **P1-b-2 15/15**, **P1-b-5 11/11** on staging; regressions green | none | <ul><li>~~The `agent_review_state` lock~~: **built in #27 (00119).** When the agent has handled every item, the batch is `complete` and the team keeps moderation only. The agent sees "You are now in control".</li><li>Reporting (P2-b), which is P2, outside P0 and P1.</li></ul> | none |

**Tally:**

- **Ready for staging acceptance (P0 and P1 scope complete):**
  - **#1 Command Centre**, **#4 Agent 360**, **#6 Batch Review**, **#9 Moderation**, **#10 Leads and requests**;
  - **#13 Permissions and security**, except the held location items;
  - **#14 Handover**, except reporting, which is P2.
- **Ready for acceptance except held steps:**
  - **#3 Invitations** and **#5 Import Workbench**, which wait on counsel;
  - **#7 Photo Quality Centre**, whose AI review waits on a provider.
- **#11 Commercial and growth**: ready for acceptance (#32, #33, #34). **#12 AI Workforce**: ready except the provider-dependent items (#35).
- **Not started:** #2 (acquisition pipeline, after the retention decision) and #8 (source mapping, P2 and a legal review).
- **Next, in order (all unblocked):**
  1. ~~#10, the leads view~~: built in #30, so #10 is ready for staging acceptance;
  2. ~~#4 Agent 360~~: built in #31;
  3. ~~#1 Command Centre~~: built in #32;
  4. ~~#13 security~~: built in #33 (the location items remain held);
  5. ~~#11~~: built in #34. ~~#12, provider-free parts~~: built in #35. The rest of #12 needs an AI provider.
- **Blocked, with reasons (see `docs/release/admin-2.0-readiness-report.md`):**
  - #2 needs the retention period (owner decision 5);
  - #8 is P2 and needs a legal review of portal terms;
  - #12 real costs and the import assistant need an AI provider;
  - #14 reporting is P2-b, deferred.
- **Not started:** #2 and #8.
- **In production:** no 2.0 screen.

**Merge order (unchanged, all open):**

| PR | Head | CI |
|---|---|---|
| #10 | `b4ae846` | ✓ |
| #12 | `19afdcb` | ✓ |
| #13 | `c23e29f` | ✓ |
| #14 | `97af7d2` | ✓ |
| #15 | `14180fa` | ✓ |
| #16 | `0c87b6b` | ✓ |
| #17 | `ae58f4b` | ✓ |
| #18 | `c0417b0` | ✓ final: `checks` and `rls` both green |
| #19 | `4ad18ec` | ✓ P0-e-3a, the agent gallery editor: `00112` on staging; 15/15 staging checks |
| #20 | `0980e78` | ✓ P0-e-3b, D6 partner photos: `00113` on staging; 13/13 end to end |
| #22 | `f5feb23` | ✓ P1-b, Handover (screen 14) with D10: `00115` on staging; 20/20 staging; CI green |
| #23 | `585af5e` | ✓ P1-b-2, change-request photos through the private processor: `00116` on staging; 15/15 end to end; CI green |
| #24 | `9cab3c7` | ✓ P1-b-3, wizard photos through the private processor: `00117` on staging; 16/16 end to end; CI green |
| #25 | `b067224` | Base `main`: the read-only photo metadata scan. `checks` is green; `rls` fails on main's old capability matrix against the shared staging database (environment drift, explained in the PR) |
| #26 | `75384ac` | ✓ P1-b-4, profile photos cleaned before they are public, plus `db-migrate --to`: `00118` on staging; 16/16 end to end; the rollback was rehearsed |
| #27 | `bb337ca` | ✓ P1-b-5, the handover lock (screen 14), plus `db-migrate --hold`: `00119` on staging; 8 RLS tests; 11/11 end to end |
| #28 | `4e6e5be` | ✓ P1-c-1, Batch Review inline bulk editing (screen 6); 13/13 end to end |
| #29 | `15f83f2` | P1-c-2, D9 buyer reports and flag queue (screens 9 and 10); the first PR to change `apps/www`: `00120` on staging; 6 RLS tests; 17/17 end to end; CI green |
| #30 | `11a0a01` | ✓ P1-c-3, the lead response-time view (screen 10); 9/9, plus 8/8 with synthetic MY and ID leads (non-zero MY figures, ID excluded) |
| #31 | `174c07f` | ✓ P1-d-1, Agent 360 with suspend and restore (screen 4): `00121`; 16/16 |
| #32 | `61058fe` | ✓ P1-e-1, Command Centre action queue and nine-workspace nav (screen 1); 8/8 |
| #33 | `0a8bbb1` | ✓ P1-f-1, permissions and security (screen 13): `00122`–`00124`; 9/9; three security findings fixed; the gallery definer fix after CI |
| #34 | `f906eeb` | ✓ P1-g-1, create and edit agencies (screen 11): `00125`; 9/9 |
| #35 | `00aed85` | ✓ P1-h-1, the AI Office view in admin; costs "not yet available" (screen 12); 8/8 |
| #21 | `c9e064f` | ✓ P1-a, moderation and photo quality (screens 9, 7, 6): `00114` on staging; **staging-validated** 35/35; CI green, 73 of 73 test files |

Production migrations `00103`–`00124` follow the merge (sequence: `docs/release/admin-2.0-release-brief.md`), staging first, each behind separate approval.

**Remaining deliverables, in implementation order:**

1. ~~**D6, partner-ingest photos (P0-e-3b).**~~ **Built in [PR #20](https://github.com/kamalauction-lgtm/agmatchhub/pull/20).** The owner chose the written partner agreement as the rights basis. The agreement reference is set per country on `/admin/countries`, and must be set for production before any partner photo is stored.
2. **The owner merges #10 to #35, then production.**
   - Production migrations `00103`–`00125`, staging first, each with separate approval.
   - A production deploy.
   - The existing NO-GO prerequisites still hold: the password rotation and the backup and restore evidence.
3. ~~**P1-a, moderation and photo quality.**~~ **Staging-validated in [PR #21](https://github.com/kamalauction-lgtm/agmatchhub/pull/21) at `c9e064f`.** Carried forward:
   - buyer flags (D9) go to the moderation backlog (P1-c);
   - agent suspension goes to Agent 360 (item 5);
   - inline bulk editing goes to Batch Review (P1-c);
   - AI photo review waits for an AI provider to be configured.
4. ~~**P1-b, handover** (screen 14).~~ **Built in [PR #22](https://github.com/kamalauction-lgtm/agmatchhub/pull/22):** change requests, the Handover screen, the notification kinds, and the email rebrand (D10). Remaining:
   - ~~photo upload on an original-photo request~~: **built in [PR #23](https://github.com/kamalauction-lgtm/agmatchhub/pull/23)**, using the private processor (owner decision, 11 Nov);
   - the post-handover edit lock;
   - ~~wizard uploads through the processor~~: **built in [PR #24](https://github.com/kamalauction-lgtm/agmatchhub/pull/24)** (owner confirmed, 11 Nov).
5. **Agent 360** panels and suspend/restore, now including suspension carried from moderation (screen 4). **The Command Centre** single queue and the nine-workspace nav (screen 1).
6. **Leads and reports** (screen 10): the `/admin/leads` response-time view, and reporting a marketplace listing (D9).
7. **Security completion** (screen 13): audit filters and export, capability keys on audit and search, revoking `log_audit`, D14.
8. **The commercial workspace** and agency create/edit (screen 11). **The AI Workforce** Office view and real model costs (screen 12).
9. **The acquisition pipeline** (screen 2), after the retention decision.
10. **P2:** the source registry and re-sync (screen 8), and advanced reporting.

**Held throughout:**
- With counsel: P0-c and P0-d-2 (screens 3 and 5).
- `import_photos` stays off for real agents.
- Location data: the official Sabah and Sarawak lists, the township level and the Vasanta district.
- The Bali leasehold.

---

## Phase 10: proposal

### Navigation: nine workspaces over the existing 23 routes

No existing page is removed and no duplicate pages are added. The nav becomes grouped with sub-items.

| Workspace | Existing routes it holds | New routes |
|---|---|---|
| Command Centre | `/admin`, `/admin/search` (moved to the top bar) | — |
| Agents | `/admin/agents`, `/admin/agents/[id]`, `/admin/organisations`, `/admin/organisations/[id]` | `/admin/agents/pipeline`, `/admin/agents/invitations` |
| Listings and Import | `/admin/listings` (moderation) | `/admin/imports`, `/admin/imports/[batchId]`, `/admin/media`, `/admin/sources` (P2) |
| Demand and Reports | `/admin/requests`, `/admin/requests/[id]`, `/admin/reports`, `/admin/reports/[id]` | `/admin/leads` (SLA view) |
| Commercial and Growth | `/admin/commercial`, `/admin/payments`, `/admin/growth`, `/admin/hero`, `/admin/banners` | — |
| AI Workforce | `/admin/ai` | — |
| Communications | `/admin/whatsapp`, `/admin/announcements` | `/admin/handover` |
| Markets and Content | `/admin/countries`, `/admin/legal`, `/admin/training`, `/admin/identity` | — |
| Security and Audit | `/admin/users`, `/admin/audit`, `/admin/flags`, `/admin/flags/[key]` | — |

The admin-on-behalf add-property flow stays inside the request it belongs to. Its account-creation step is replaced by the invitation flow.

### Who does what: admin versus agent

| Admin team | Agent |
|---|---|
| Finds and invites prospects | Activates their own account: OTP, then a magic link or passkey |
| Prepares draft listings from sources the agent names or supplies | Accepts the authority and photo-rights declarations personally |
| Fixes data and flags photos | Approves, corrects or rejects each prepared draft |
| Moderates and publishes listings the agent has approved | Supplies original photos when asked |
| Never signs in as the agent | Owns the listings, leads and client communication from handover onward |
| Never accepts a declaration for the agent | — |
| Never sees client contact details without an audited reveal | — |

### Code changes

**P0, onboarding**

- Add `A/agents/invitations` (page and actions) and `lib/agents/invite.ts`.
- Remove the password generation and emailing from `lib/agents/admin-create.ts`. The add-property flow then sends an invite instead.
- Add a public route `/invite/[token]` in the hub. It verifies the token hash, sends an OTP to the phone or email, records consents as the agent, and creates or confirms the auth user via `generateLink`.

**P0, assisted import**

- Add `A/imports` and `A/imports/[batchId]`.
- Reuse `adapters.ts`, `spreadsheet.ts` and `import-review.tsx` unchanged.
- Move the shared commit logic out of `commit-actions.ts` into `lib/import/commit.ts`, parameterised by `{ agentId, actingAdminId | null }`.
- In that commit, take country, currency and language from the agent's profile and `countries` instead of `ID`, `IDR` and `id`, and use `match_location(country)`.
- Write admin batches through a definer RPC, `admin_import_commit(batch_id)`. It checks `has_capability_in('listing.import_assisted', agent_country)` and an active agent consent, then writes the drafts with `agent_id = agent` and `created_by = admin`.
- The RPC sets a new `import_batches.acting_admin_id` and audits the commit as `listing_import.assisted_committed`, filling the new audit columns described under "DB and RLS".

**P0, gallery and provenance**

- Add `lib/media/ingest.ts`, shared by the import commit, the ingest route and the wizard. It:
  - fetches each image through `safe-fetch` with an image MIME allowlist;
  - computes sha256;
  - stores the file under `<agentId>/<listingId>/…`;
  - inserts `listing_media` with `processing_state = 'pending'`;
  - inserts `listing_media_source` with the page URL, image URL, hash and `licence_note` (the consent record id).
- Add a processing worker. Its job is to strip EXIF and GPS, resize, thumbnail, set `processed_path`, `thumbnail_path` and `phash`, and then mark the image `ready`.
  - Candidate: Cloudflare Images or a Worker running a WASM codec.
  - **Owner decision:** choose the processor and its cost.
- Fix the ingest route's paths, its cover handling and its raw `fetch`.
- Add a gallery editor (reorder, cover, delete) to `G/listings/[id]/edit`.

**P0, security**

- Add an `is_platform_admin()` or `has_capability` guard inside every `admin_*` RPC and `admin_search`, and revoke direct execution where it is not needed.
- Revoke `log_audit` from `authenticated`, or make it check that the action belongs to a known allow-list.
- Enforce `has_capability_in` in `requireCapability` whenever the target entity has a country.
- Fix the `'submitted'` → `'under_review'` count.

**P1**

- Batch quality: bulk actions, quality score and reason codes in `A/imports/[batchId]` and `A/listings`.
- Add `A/media` (photo queue).
- Add the agent "Prepared for you" page at `G/listings/prepared`.
- Add correction and photo-request threads.
- Add the handover notification kinds.
- Rebrand the email template from `brand_settings`.
- Notify agents of verification decisions.
- Add filters and export to `/admin/audit`.

**P2**

- `A/sources`: a source registry and per-source mapping. Re-sync of approved feeds produces proposed edits, never overwrites.
- Advanced reporting: admin hours per live listing (from audit timestamps), 14-day activation and SLA trends.

### DB and RLS, reusing what exists

**Reused unchanged:**

- `import_batches` and `import_items`
- `listing_media` and `listing_media_source`
- `declarations`, `declaration_versions` and `consent_records`
- `notifications`
- `agent_profiles.created_by_admin_id`
- `audit_logs`
- `capabilities` and `role_capabilities`

**New tables** (one migration each, staging first; every table gets RLS and a negative test):

| Table | Purpose | Access |
|---|---|---|
| `agent_invitations` | Stores `token_hash` (never the token), email, phone, country, `invited_by` (FK to `auth.users`), `expires_at`, `accepted_user_id`, `revoked_at` and status | Admin read and write through `has_capability_in('agent.invite', country)`; no agent or anon access. Redemption goes through a definer RPC `redeem_agent_invitation(token)`, granted to anon, with a rate limit like `inquiry_rate_limits`. |
| `agent_prospects` | A small pre-account CRM: name, contact, source, owner admin, stage and purpose note | Admin only, country-scoped. Retention rule to be set by the owner. |
| `listing_change_requests` | `listing_id`, kind (`correction`, `photo_original`, `rejection`), body, `opened_by`, `resolved_by`, status | Readable by the listing owner and admin. The owner can insert. Status changes go through a `BEFORE UPDATE` trigger, not a self-subquery (hard rule 4). |

**New columns:**

- `import_batches.acting_admin_id` (FK to `auth.users`) and `import_batches.agent_review_state`.
- `audit_logs`: a new `acting_for_user_id` column. The existing `actor_role` and `country_code` columns, which are never filled in today, start being populated.

**New capability keys:**

- `agent.invite`
- `listing.import_assisted`
- `media.review`
- `source.manage` (P2 only)

Add an optional `onboarding_admin` role only if the owner wants a team that can prepare listings but cannot publish them. That separation is the point of the role, because `listing.moderate` is withheld from it. Otherwise, grant the keys to the existing `admin` and `country_admin` roles.

**New declarations**, each a versioned row in id, en and ms:

- `admin_assisted_import_authority`
- `listing_photo_rights`

Both are accepted only by the agent, on the agent's own session, at activation or later.

**Not stored anywhere:** commission data and minimum prices. Imported "commission" columns are discarded at parse time (hard rule 2).

### Media handoff: where it stops and the next slice (D5)

**Where the photos are lost today:**

1. The adapter collects up to 12 photo URLs into `draft.imageUrls` and drops share cards and logos (`lib/import/adapters.ts:254–269`, filtered at `:388–390`).
2. Discovery saves the draft, URLs included, to `import_items.extracted` (`G/listings/import/actions.ts:170`).
3. The commit merges `extracted` and the overrides into `src` (`commit-actions.ts:108`), then creates the property and the listing (`:171–188`).
4. **The handoff stops here.** Between creating the listing (`:188`) and marking the item `imported` (`:192–194`), nothing reads `src.imageUrls`. No `listing_media` row and no `listing_media_source` row is written.
5. The review screen tells the agent to upload their own photos (the `photosNote` message).

**The next slice (P0-e-1, "import photos").** This is proposed only; it needs owner approval and comes after P0-d.

- **Where it hooks in:** one call, `attachImportedPhotos({ listingId, agentId, itemId, pageUrl, imageUrls })`, from `lib/media/ingest.ts`, placed right after the listing insert succeeds. It runs once per item.
- **A photo failure never fails the listing.** The listing exists already and the agent can add photos by hand. The result goes in a new `import_items.media_state` column (`pending` → `done` / `partial` / `failed`) with a count, so the batch screen can show "8 of 12 photos saved".
- **Per photo:**
  1. Fetch through `assertSafeUrl` and `safe-fetch`, which check every redirect hop. Add an image MIME allowlist, a 10 MB cap (the bucket limit) and a timeout.
  2. Hash the bytes with sha256.
  3. Store the file at `<agentId>/<listingId>/src-<first 16 of sha256>.<ext>` with `upsert: false`.
  4. Insert `listing_media` with `processing_state = 'pending'`, so the photo is never public until processed (P0-e-2). The first stored photo is the cover, and the existing one-cover index stays authoritative.
  5. Insert `listing_media_source` with `page_url` (the item's `source_url`), `image_url`, `content_hash` and `licence_note`. The licence note holds the consent record id: the agent's authority declaration today, and `listing_photo_rights` once P0-c exists.

How the slice keeps each guarantee:

| Guarantee | How the slice keeps it |
|---|---|
| Listing ownership | The storage path starts with the listing owner's id (`agentId`), never the admin's, which matches the bucket's owner-folder policy. In an agent's own import, the agent's session does the writes and RLS applies unchanged. In an admin-assisted import (P0-d), the writes happen inside the same definer path that has already checked `listing.import_assisted` for the agent's country. Rows stay owned by the listing's agent, and `listing_media` keeps its owner-or-admin policy. |
| Country scope | No new country field. Media inherits its country through `listing → property.country_code`. The admin path is gated by `has_capability_in(…, agent_country)` before any fetch. |
| Source provenance | Each stored image gets one `listing_media_source` row (page, image URL, hash, fetch time, rights basis). It is the first writer of that table, which has existed since 00055. The table stays admin-read-only, as it is today. |
| Retries without duplicates | Three layers: <ul><li>A new `listing_media_source.listing_id` column (backfilled from `listing_media`; `listing_media_source` has 0 rows on staging, and production was not checked) and a unique index on `(listing_id, content_hash)`. The same photo cannot be recorded twice on one listing, even when two portals serve it from different URLs.</li><li>The storage key comes from the content hash, so a retry finds the object already there and reuses it instead of uploading a copy.</li><li>A retry only processes items whose `media_state` is not `done`, and skips hashes the listing already has.</li></ul> |
| Existing import behaviour | <ul><li>Discovery, adapters, the review screen, the authority declaration, the draft-only and `moderation_state = pending` rules, and `creation_source = 'import'` are unchanged.</li><li>Items with no `imageUrls` (spreadsheets today) behave exactly as now.</li><li>Watermarked or blocked images are skipped, never altered.</li><li>The `photosNote` copy changes in id, en and ms to say photos were copied for review.</li></ul> |

**Tests to add:**

- an agent cannot insert `listing_media_source` (negative test);
- a retry creates no duplicate rows or objects;
- a pending photo never appears in `public_listing_media`;
- an unsafe or HTML URL is skipped;
- an MY agent's import stores under that agent and is visible only to an MY-scoped admin.

**The approval gates stay as written:**

- P0-c, the declarations: needs legal review.
- P0-d, assisted import: needs P0-a merged.
- P0-e-1, this slice.
- P0-e-2, the processing worker: needs a processor and budget decision.

Nothing in this section is built.

### Source and media rights

1. **Allowed sources:**
   - files and photos the agent supplies;
   - the agent's own public listing pages, read through published structured data only;
   - partner feeds under a written agreement (Hero, IFCA).

   Nothing else.
2. **Blocked pages stay blocked.** A CAPTCHA, login wall, WAF or rate-limit response stops the item. There is no retry with another user agent and no proxy. The adapters already do this, so keep them.
3. **Images:**
   - Never strip, crop or blur a watermark or portal branding. A flagged image is quarantined and the original is requested from the agent.
   - Never import share cards; `isPropertyPhoto` already filters them.
4. **Provenance and rights basis:**
   - Every stored imported image gets a `listing_media_source` row.
   - `licence_note` points at the agent's `listing_photo_rights` consent id.
   - An image without that consent stays `pending` and is not public.
5. **Location privacy:** GPS and EXIF are stripped before `ready`. This is already required before launch by `M/00036`.
6. **Checks before go-live.** For each portal per country (ID and MY):
   - Legal reviews the portal's terms and the photo-copyright position.
   - A portal whose terms forbid reuse is marked "agent-supplied only" in the source registry.

   **Owner action:** get the legal review.

### Implementation sequence

| Priority | Item | Depends on |
|---|---|---|
| P0-a | Security fixes: admin RPC guards, `log_audit` revoke, country-scope enforcement, verification count | — |
| P0-b | Invitations: tables, RPC, `/invite/[token]`, removal of temporary passwords | P0-a |
| P0-c | Consent: two new declarations, agent-only acceptance, `DeclarationKey` fix | P0-b |
| P0-d | Admin-assisted import: shared commit, `admin_import_commit` RPC, country-correct fields, audit | P0-a, P0-c |
| P0-e | Gallery and provenance: `lib/media/ingest.ts`, processing worker, ingest-route fix, gallery editor | P0-d (can start alongside it) |
| P1-a | Batch quality control: bulk actions, quality score, reason codes, photo queue | P0-d, P0-e |
| P1-b | Handover: prepared-portfolio page, change requests, notifications, email rebrand | P0-d |
| P2-a | Approved source registry and re-sync as proposed edits | P1 |
| P2-b | Advanced intelligence and reporting | P1 |

### Agent Platform enhancements

1. **Invitation activation.** `/invite/[token]` takes the agent through four steps:
   1. OTP to the phone or email.
   2. Language choice.
   3. Accepting terms, `admin_assisted_import_authority` and `listing_photo_rights`, plus an optional WhatsApp opt-in.
   4. Choosing a magic link or passkey.

   After that, the agent continues to the existing `G/verification`.
2. **Preloaded portfolio.** A new `G/listings/prepared` lists the drafts in admin batches for this agent, with Approve, Approve all, Correct and Reject. Approving moves a draft to `pending_review`. Agents still cannot self-publish; the guard trigger is unchanged.
3. **Correction and original-photo requests.** These are two-way threads stored in `listing_change_requests`.
   - Admin asks for an original photo → the agent uploads it in the thread → the photo joins the gallery as `pending`.
   - Agent corrects a field → the admin applies it or the agent edits it directly.
4. **Import history.** `G/listings/import` gains admin-prepared batches, labelled "prepared by [team] from [source]", next to the agent's own. They come from `import_batches` where `agent_id` is the agent's own id, which the existing own-batch policy already allows.
5. **Notifications.** New kinds: `portfolio_ready`, `correction_requested`, `correction_resolved`, `photo_original_requested`, `verification_decided` and `handover_complete`. Each gets titles in id, en and ms (`notification-titles.ts`) and goes out in-app, by push and by email. WhatsApp is used only when the agent has opted in and the `whatsapp_cloud` flag is on.
6. **Self-service handover.** When the agent has handled every prepared item, the batch's `agent_review_state` becomes `complete`. From then on the admin team has no edit path to those listings; they are normal listings, and the admin keeps only moderation powers. The agent sees "You are now in control" and is linked to Studio and Leads.

### Staging test scenarios

Each needs a negative RLS test where the row says so.

1. An agent calls `admin_search` or `admin_action_queues` directly. **Expected:** denied (negative test).
2. A `country_admin` for MY tries to invite, import for, or moderate an ID agent. **Expected:** denied (negative test).
3. An invite token is used twice, used after expiry, or used after revocation. **Expected:** all three fail, and the attempts are rate-limited.
4. An admin tries to commit an assisted batch before the agent has accepted the authority declaration. **Expected:** refused.
5. An admin tries to insert a `consent_records` row with `user_id` set to the agent. **Expected:** denied (negative test).
6. An assisted import is committed for an MY agent. **Expected:** `country_code` is MY, currency is MYR, the location is matched with `match_location('MY')`, and the audit row records the acting admin.
7. An imported image URL is committed. **Expected:** a `listing_media` row in `pending`, plus a `listing_media_source` row with the hash. After processing it is `ready` with no EXIF or GPS, and it then appears in `public_listing_media`.
8. An image is blocked or returns HTML. **Expected:** that image is skipped and recorded; the listing survives.
9. A quarantined photo is checked on www. **Expected:** it never appears in the `public_*` views.
10. An agent rejects a prepared draft. **Expected:** it is never published, and the admin cannot republish it.
11. An `onboarding_admin`, if that role is created, tries to approve their own prepared listing. **Expected:** denied (negative test).
12. A spreadsheet contains a "commission" column. **Expected:** the column is dropped and appears in no payload.
13. i18n parity passes for every new key in id, en and ms.
14. The verification queue count is correct for an `under_review` agent.

### Production risks and rollback

**Status:** production stays NO-GO until two things are done: the owner rotates the passwords, and the encrypted backup and restore evidence is produced. Nothing below changes that.

**Risks:**

- **Fixing the RPC guards could hide data from a legitimate admin path that relied on the hole.** Mitigation: run the admin suite on staging first.
- **Wrong country on legacy imports.** Rows committed before the fix carry `ID`. Run a read-only report of `creation_source = 'import'` rows whose agent is MY. Any correction is a separate, audited migration that needs owner approval.
- **Media worker cost and failure.** Images stay `pending`, which means not public, until processed. A failure never publishes an unprocessed image. Monitor through `admin_system_health`.
- **Photo copyright.** The risk is mitigated, not removed, by agent declarations, provenance and quarantine. It remains open until legal review.
- **Invite links forwarded to the wrong person.** Mitigated by OTP binding to the invited phone or email, short expiry, single use and revocation.

**Rollback:**

- Every migration is additive: new tables, new columns, new capability keys. Rolling back means a down-migration that drops the new objects; existing tables are unaffected.
- Each feature sits behind a flag in `feature_flags`: `admin_invitations`, `admin_assisted_import` and `media_pipeline`. Turning the flag off hides the routes and the server actions refuse.
- The RPC guard fixes are reversed with `create or replace` from the previous definitions, which are kept in the migration file as comments. This should not be needed.

### Decisions needed from the owner

1. ~~Approve this sequence, or reorder it.~~ **Approved by the owner on 10 Nov 2026, as written (P0-a → P2-b).**
2. Create an `onboarding_admin` role, or grant the new keys to the existing `admin` and `country_admin` roles?
3. Which image processor should be used, and what budget?
4. Legal review of the two new declarations and of portal terms for ID and MY.
5. A retention period for `agent_prospects`.
