# Production readiness report — PropertiGuru Stage B

*Prepared 8 November 2026 for the owner's `APPROVE PRODUCTION` decision. Target launch 30 November 2026, markets MY + ID. Every number below was measured today on this machine against the staging project `aylzekkeurjsudazzxjv` and, read-only, the production project `jokyyhvtahiypuzmfydp`. Source of the per-epic evidence: [stage-b-build-log.md](stage-b-build-log.md).*

---

## 0. Verdict

**Not ready for `APPROVE PRODUCTION` today. Ready to request it after the pilot, on five conditions.**

What is true today:

- Every epic of the approved build (E0–E12) is built on staging, typechecks, lints, builds for production, and passes the full suite: **455 tests, 46 files, 0 failures**, including a negative RLS case for every new table.
- Nothing from Stage B is in production. The hub Worker was last deployed on 13 September 2026 and the schema stops at migration 00077; both are unchanged and unharmed.
- Every live-money, live-message and partner-system path is off by design and cannot be switched on by accident: payments need three independent switches, WhatsApp needs two plus Meta credentials that do not exist, Hero is read-only and keyless, AI has no provider key.

Why not yet:

| # | Condition for requesting `APPROVE PRODUCTION` | Status today |
|---|---|---|
| C1 | **The source is committed and pushed.** Until 8 Nov the last commit was dated 23 Aug 2026; 327 files including **40 migrations (00057–00096) — 21 of which are already running in production** — existed only on this laptop. | **Met 8 Nov** — commit `b902bd9` on `feat/propertiguru-next-foundation`, pushed to `kamalauction-lgtm/agmatchhub`; `packages/db/.env.*` now ignored explicitly and verified absent from the commit. CI runs on `main`/`develop`/PRs only, so open a PR (or merge) for the pipeline to run, and add the staging secrets (§5) for the RLS job. |
| C2 | **The pilot (27–28 Nov) has run on staging with real agents and met its exit criteria** (§8). | Not started; blocked on the owner inputs in §9. |
| C3 | **The production secrets exist** for what will be switched on (at minimum `CRON_SECRET`; an AI key if AI is to be live; others only with their own approvals). | Production Worker holds 6 secrets; none of the Stage B ones (§5). |
| C4 | **Production residue decision**: 32 test requirements and 3 test accounts in production (§6). | Awaiting authorisation to remove. |
| C5 | **Backup verified** (Supabase daily backup / PITR point confirmed in the dashboard) before migrations run. | Not yet confirmed — owner's dashboard. |

What `APPROVE PRODUCTION` will and will not do is spelled out in §11.

---

## 1. Scope delivered (approved build, 7–8 Nov)

| Epic | Delivered | Evidence (all on staging) |
|---|---|---|
| E0 Staging & safety | Isolated staging project; 77 migrations replayed; test harness refuses bare runs and production by default; CI job writes staging env from secrets | 350/350 at the time; fixture sweep fails the run on leftovers |
| E1 AI foundation | `packages/ai` provider-agnostic (Gemini / Anthropic), `ai_jobs` ledger, quotas, caps, circuit breaker, `/admin/ai` | 8 RLS cases; denial paths exercised without a key |
| E2 AI Manager | Morning brief (rules now, AI when a key exists), `/ai` directory | brief rendered as a real agent; denial recorded |
| E3 Listing Assistant | Quality score + comparables, assistant in the wizard | trigger-maintained, backfilled |
| E4 Marketing Studio | One listing → WhatsApp / Instagram / Facebook / TikTok / brochure text | schedule path unchanged |
| E5 Communication Secretary | Reply drafts (WhatsApp via wa.me, e-mail via Resend), overdue nudges on the cron | lead-event kinds widened |
| E6 Qualifier & Matcher | Intent + reason, duplicates, silence radar, alternatives from own + open pool, same country only | 00086 |
| E7 Tasks & Appointments | `agent_tasks`, lead-anchored viewings, reminders on the cron | 00087 |
| E8 Hero link + benefits | `rens:status` read-only link by the hub's own identifiers; benefits as one editable row (expiry 30 Jun 2027), grants revoked never deleted; nightly re-check | 4 RLS + unit; **no Hero change made** |
| E9 Commercial | Wallet kinds (boost / AI), plan families, product names Free/Starter/Pro/Agency on basic/silver/gold/platinum, **three independent price lists MYR / IDR / USD** from D4, `/plan`, admin repricing + credit grants | 7 RLS cases; `FREE_LAUNCH` unchanged |
| E10 Ingest multi-country | Malaysian location matcher, per-country vocabulary / units / currency / language, ingest agent per country | curl-proven ID + MY + re-send + mismatch; Hero adapter change prepared, not applied |
| E11 Payments scaffold | Billplz / Midtrans / Stripe adapters with verified signature schemes, intents priced by the database, webhook, `/admin/payments`; every gateway `off`, `live` impossible outside `LIVE_BILLING` by trigger | 18 unit + 6 RLS; signed / tampered / replayed webhook on the dev server |
| E12 WhatsApp Cloud API | Design doc + scaffold: rules in SQL (24-h window, approved templates, consent + switch for marketing, permanent opt-outs, test recipients), webhook with app-secret signature, platform door on `/leads`, `/admin/whatsapp`; both numbers `off`, flags off | 7 unit + 6 RLS; handshake / signed / tampered / replayed / stranger / STOP on the dev server |

Deferred by the owner's own decisions, not slipped: live charging (D8), outbound WhatsApp (D8), Hero Phase 2 (D2), GHL migration (D8), Malaysian domain (D7).

---

## 2. Evidence of testing — and what was not tested

### 2.1 Automated (today)
| Suite | Result |
|---|---|
| `npm run typecheck` (every workspace) | clean |
| `npm run lint` | clean (one pre-existing warning in `worker.js`) |
| `npm run build` (hub + www, production mode, hub cache cleared) | both produced a build (`BUILD_ID` present in each app) in 72 s; the "dynamic server usage" lines during the hub build are the known, harmless static-render probes of cookie-reading routes |
| `npm test` → full suite on staging | **455 passed / 455, 46 files, 0 skipped failures, fixture sweep clean** |

Of the 455: unit tests for every pure module (normalisation, dates, signature schemes, webhook parsers, i18n parity across id/en/ms), and RLS tests that sign in as five standing accounts and prove, per table, that the wrong role is refused.

### 2.2 By hand on the staging dev server (screens in the build log)
Register → verify → brief → `/ai` denial; listing wizard with quality card; studio texts; lead → draft → wa.me; Hero card link / unlink / admin benefits; `/plan` in IDR with catalogue; admin repricing in three currencies; ingest from curl for ID and MY; payments admin refusing `live`, sandbox checkout against the **real** Midtrans sandbox (refused the placeholder key, recorded honestly), signed webhook settling a top-up; WhatsApp handshake, inbound, STOP, platform door opening and closing with the window.

### 2.3 Not exercised — and why
| Path | Reason | What unblocks it |
|---|---|---|
| Any real AI call | no provider key (D1: reuse existing; none found usable locally) | `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` in `.env.staging`, then the pilot |
| Hero `rens/status` live call | no `HERO_API_KEY` (scope `rens:status`) | key from Hero Command HQ → Integrations |
| Cron end to end on a Worker | staging has no deployed Worker; the route is exercised, the trigger is not | first production deploy with `CRON_SECRET` |
| Gateway round-trips (Billplz / Midtrans / Stripe) | no sandbox credentials | sandbox accounts (D8 keeps live off anyway) |
| Meta WhatsApp | no app, token or number | design §6 |
| Hero → hub MY ingest | Hero's adapter still sends ID only (Hero production change, D2) | owner applies the prepared change |
| Production migrations 00078–00096 | by rule, staging first; not approved | `APPROVE PRODUCTION` |
| CI on this code | nothing committed since 23 Aug; CI never saw Stage B | C1 |
| Load / p95 timings (blueprint §11.16–17) | need a key and the pilot's traffic | pilot |

---

## 3. The directive's conditions, one by one

| Condition (owner's text, abridged) | Status |
|---|---|
| Extend the existing app; reuse keys and infrastructure | Done — no new app, no new provider, same Supabase org and Cloudflare account |
| Protect production | Done — zero writes to production since 7 Nov; migrations staging-only; tests cannot target production without a flag |
| Isolated staging; never production as staging | Done — `aylzekkeurjsudazzxjv`, paid project in the Pro org as the owner chose |
| No new paid services without permission | Done — staging (~US$10/month) was the owner's choice; nothing else |
| No Hero production changes | Done — Phase 1 read-only; the MY adapter change is written down, not applied |
| Do not terminate GHL / migrate numbers | Done — nothing touched; cut-over test defined in the WhatsApp design §9 |
| No live payments | Done — `FREE_LAUNCH`; gateways `off`; `live` refused by trigger |
| No unsolicited / paid WhatsApp | Done — channel off; no bulk path exists; marketing behind a second switch + consent |
| Preserve existing records | Done — every migration additive; the four plan records kept, products mapped onto them |
| MY + ID first | Done — country drives vocabulary, units, currency, matcher, price list, WhatsApp number |
| Do not claim a feature operational until tested | This report separates tested from untested in §2 |
| Production only after readiness report + `APPROVE PRODUCTION` | This is the report; the approval is the owner's |

---

## 4. What production would receive

### 4.1 Schema delta (staging-verified, pending on production)
19 migrations, **00078 → 00096**, applied in order by `npm run db:migrate`. Measured effect (staging vs production today): tables 103 → 123, RLS policies 222 → 261, every new table with RLS and a negative test.

| Kind | What | Reversibility |
|---|---|---|
| New tables (additive) | `ai_*` (jobs, briefs, roles, settings), `listing_quality`, `lead_intelligence`, `agent_tasks`, `hero_links`, `hero_benefits`, `payment_providers`, `credit_packs(_prices)`, `payment_intents`, `payment_events`, `wa_accounts`, `wa_templates`, `wa_opt_outs`, `wa_messages`, `wa_webhook_events` | drop table |
| New nullable columns on live tables | `plans.family/product_key/product_name`, `subscriptions.family`, `contacts.wa_last_inbound_at`, `viewing_appointments.lead_id` (+ `submission_id` made nullable) | drop column / restore not-null |
| Constraint changes | `credit_wallets` PK → (agent_id, kind) and `credit_transactions.kind` (**0 rows in production today**); `plan_versions` unique (plan, currency, version) + one-current-per-currency; `subscriptions` one live per (user, family); widened check lists on `entitlement_grants.source`, `credit_transactions.reason`, `lead_events` agent-insert kinds | each has a paired `down` note in its header |
| Seeded reference rows | flags `whatsapp_cloud`, `whatsapp_marketing` (off); MYR + USD plan versions and IDR v2 for Pro/Agency (D4 prices); `payment_providers` (3, off); `credit_packs` (4, unpriced); `wa_accounts` (MY, ID, off); `hero_benefits` singleton (D3 values); AI roles catalogue | delete rows |
| Functions / triggers | ~40 new or replaced SECURITY DEFINER functions; triggers: plan-version entitlement inheritance, subscription family, provider live-mode guard, updated_at | `create or replace` back |

No migration drops or rewrites existing business data. Expected run time on production: under one minute; no downtime (additive DDL, tiny tables).

### 4.2 Application delta
`apps/hub` Worker: new routes (`/ai`, `/tasks`, `/plan`, `/plan/payment/[id]`, `/admin/{ai,hero,payments,whatsapp}`, `/api/cron`, `/api/payments/webhook/[provider]`, `/api/whatsapp/webhook`), the custom `worker.js` with the two Cron Triggers, messages in id/en/ms. `apps/www` **unchanged in behaviour** (it carries uncommitted earlier MY-market work that is already live).

### 4.3 Flags on production after migration (all pre-existing flags keep their values)
`ai_features` is **enabled for everyone** in production today. The blueprint's deployment plan (§12.5) targets it to the pilot cohort. Recommendation: before any AI key is added to production, set `ai_features` to targeted (country / users) — one click on `/admin/flags/ai_features` — or every verified agent gets AI on day one.

---

## 5. Secrets and configuration (names only)

Production Worker today: `LISTING_INGEST_AGENT_ID`, `LISTING_INGEST_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_SIGNING_SECRET`, `VAPID_PRIVATE_KEY`.

| Secret | Needed for | Required at `APPROVE PRODUCTION`? | Provided by |
|---|---|---|---|
| `CRON_SECRET` | the scheduler (`/api/cron`: briefs, nudges, reminders, embeddings, Hero re-check, payment expiry) | **Yes** — without it every tick is dropped and logged | generate (32+ random bytes); also `wrangler secret put` |
| `GEMINI_API_KEY` **or** `ANTHROPIC_API_KEY` | every AI capability (E1–E7 AI paths); without it every surface degrades to the deterministic version, by design | Only if AI is to be live at launch | owner (D1: reuse an existing authorised key) |
| `HERO_API_KEY` (+ optional `HERO_API_BASE`) | Hero link (E8) | Only if the Hero link is to be live at launch | Hero Command HQ → Integrations, scope `rens:status` |
| `BILLPLZ_*` (3), `MIDTRANS_SERVER_KEY`, `STRIPE_*` (2) | payments | **No** — nothing may go live; sandbox values belong in `.env.staging` only | owner's sandbox accounts |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | WhatsApp Cloud API | **No** at launch; pilot on staging first | Meta app (design §6) |
| `META_APP_ID/SECRET`, `SOCIAL_CRON_SECRET` | direct social publishing (pre-existing, optional) | No | — |
| GitHub: `STAGING_DATABASE_URL`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_SERVICE_ROLE_KEY`, `TEST_*` | CI runs the RLS suite on every push | Strongly recommended with C1 | copy from `packages/db/.env.staging` |

Rotation note: any secret that was ever pasted into a chat or a terminal in earlier sessions should be rotated before launch; the secrets above were generated locally and never printed. The two placeholders in `.env.staging` (`MIDTRANS_SERVER_KEY` sandbox-format, `WHATSAPP_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN`) are marked as self-test values and must be replaced, not promoted.

---

## 6. Security posture

- **RLS everywhere**: 261 policies on staging; every new table has a negative test proving the wrong role is refused; the suite signs in as five real accounts, never as the service role for assertions.
- **Writes through functions**: payments, WhatsApp, Hero grants, credits, AI ledger — none agent-writable; SECURITY DEFINER functions check `auth.uid()` and capability; service-only functions refuse any user session.
- **No secrets in the database**: gateway and Meta keys are Worker variables; admin pages show presence by name only; `payment_events` / `wa_webhook_events` redact key-shaped fields.
- **Key-shape vs mode guards**: a live Stripe or Midtrans key is refused under a sandbox row and the reverse; `live` provider mode is refused by trigger outside `LIVE_BILLING`; WhatsApp test mode is enforced in SQL against the recipient list.
- **Webhooks**: every delivery verified (HMAC with the provider's secret), recorded verified or not, deduplicated on the provider's event id (and, for WhatsApp, only verified bodies dedupe — fixed after the first proof found an unsigned copy could suppress the real one).
- **Hub-only service role**: `apps/www` still holds no service key; its one write path remains the inquiry function.
- **Audit**: every admin action and every settlement writes `audit_logs` through `log_audit`.
- **Known production issues**: (a) 32 cancelled `TSTREQ-…` test requirements and 3 `kamal.auction+mhtest*` accounts remain (removal awaits authorisation; the sweep already recognises them); (b) `ai_features` globally on (see §4.3); (c) no `CRON_SECRET`, so scheduled work will be dropped until it exists.
- **Repository**: the CI secret-scan step exists but has not run on this code (C1).

---

## 7. Risks going into the pilot and launch

| # | Risk | Likelihood / impact | Mitigation in place / needed |
|---|---|---|---|
| R1 | **Source only on one laptop** (C1) | high / severe | commit + push + tag before anything else |
| R2 | AI cost or quality unknown — no key has ever been exercised | high / medium | caps + circuit breaker + per-agent quota built; pilot measures cost from `ai_jobs` against the owner's ceiling |
| R3 | Hero link finds nobody (e-mail/phone mismatch between systems) | medium / medium | phone fallback + normalisation built; pilot agents verify with their Hero identities |
| R4 | Malaysian ingest never lands (no verified MY company profile; Hero adapter sends ID only) | high for MY / medium | create the MY company profile; apply the prepared Hero change |
| R5 | `ai_features` global → every verified agent gets AI the moment a key lands | medium / medium | target the flag first (§4.3) |
| R6 | Staging drift from production (staging has 70 countries, test data) | low / low | migrations are the only schema path; reference seeds are in migrations |
| R7 | Agents keep using `wa.me`; platform WhatsApp unused | medium / low | by design during pilot; adoption is an exit criterion for cut-over, not launch |
| R8 | Pilot slips past 28 Nov → launch 30 Nov without pilot evidence | medium / high | §9 inputs by 20 Nov; if not, the honest answer is a later launch, not an untested one |
| R9 | A migration misbehaves on production data that staging does not have (leads, requests) | low / medium | all migrations touching live tables are additive; backup/PITR confirmed first (C5); rollback runbook §10 |

---

## 8. Pilot plan and exit criteria (27–28 Nov, staging)

**Who**: 2 MY + 2 ID + 1 optional real agents (D5), real identities, created through normal registration on staging and verified by the admin. **Where**: staging dev server behind a tunnel, or a staging Worker if the owner wants one (adds ~US$5/month). **Flags**: `ai_features`, `whatsapp_cloud`, `payments` targeted to these five only on staging.

| # | Script (from blueprint §11) | Pass when |
|---|---|---|
| P1 | Register → verify → dashboard brief in the agent's language | brief shows with ≥ 1 action that opens a real route; `ai_jobs` row exists (AI or rules, both acceptable, source shown) |
| P2 | New listing → Draft with AI → save → publish | quality row exists; listing appears on the right market only |
| P3 | Studio → four texts → schedule | `scheduled_posts` row; publisher runs or records the Meta error |
| P4 | Public inquiry on www → lead → intent → draft → reply → task → reminder | each artefact visible; nudge/reminder notification arrives within 15 min of the cron tick |
| P5 | Profile → Link Hero (real account) → benefits → deep link | `hero_links.status = linked`, grants with source `hero_benefit`, `/plan` shows them |
| P6 | `/admin/ai` cost and cap | every call listed; cap → 0 degrades the next call; audit rows present |
| P7 | WhatsApp on the Meta test number (if the owner's Meta app exists by then) | buyer writes → on the lead within a minute; agent replies from the platform door → `delivered`; STOP → every later send refused |
| P8 | Payments sandbox (if sandbox credentials exist by then) | intent → hosted page → webhook → paid, once; tampered webhook rejected |
| P9 | Cost | AI cost per active agent per day ≤ the owner's ceiling (proposed US$0.10) read from `ai_jobs` |
| P10 | Security | the full suite green on the pilot's own staging state; no `bad_signature` rows except deliberate tests |

P1–P6 and P9–P10 are the launch gate. P7 and P8 inform their own later approvals and do not block `APPROVE PRODUCTION`.

---

## 9. Owner inputs needed, by date

| By | Input | Why |
|---|---|---|
| **now** | Go-ahead to **commit and push** the repository (C1), then enable the CI staging secrets | nothing else is safe until the source exists in two places |
| 14 Nov | AI provider key (Gemini via Hero's billing, or Anthropic) into `.env.staging` | pilot P1–P6, P9 |
| 14 Nov | `HERO_API_KEY` (scope `rens:status`) into `.env.staging` | pilot P5 |
| 14 Nov | Pilot cohort names (2 MY + 2 ID + 1) and their Hero identities | registration on staging the week before |
| 14 Nov | A verified **Malaysian company profile** on staging (and later production) for MY ingest | E10 MY path |
| 20 Nov | Decision on the 32 + 3 production residue rows | C4 |
| 20 Nov | `ai_features` targeting plan for production (cohort first, or all verified agents) | §4.3 |
| 20 Nov | (optional) Meta WhatsApp app + test number; gateway sandbox accounts | P7, P8 |
| 26 Nov | Supabase backup / PITR confirmed in the dashboard | C5 |
| 28 Nov | Pilot sign-off → this report updated with pilot results → `APPROVE PRODUCTION` | launch 29–30 Nov |

---

## 10. Production cut-over runbook (executed only after `APPROVE PRODUCTION`)

1. **Freeze.** Tag the pilot-verified commit. Confirm the Supabase backup / PITR point (C5); keep a `pg_dump` of the schema locally.
2. **Residue.** If authorised: `npm run test:production` sweep removes the 32 `TSTREQ` requirements; delete the 3 test accounts by hand with an audit note.
3. **Flags first.** On production `/admin/flags`: `ai_features` → targeted to the cohort; confirm `payments` off; (`whatsapp_*` arrive off with 00095).
4. **Migrations.** `npm run db:status` → 19 pending → `npm run db:migrate` (production). Verify: `plan_catalogue('MYR'|'IDR'|'USD')` returns four rows each; `commercial_settings.billing_mode = FREE_LAUNCH`; `payment_providers` all `off`; `wa_accounts` all `off`.
5. **Secrets.** `wrangler secret put CRON_SECRET` (always); the AI key and `HERO_API_KEY` only if approved for launch. Record the current Worker deployment id for rollback.
6. **Deploy hub.** Stop any dev server; `npm run deploy:hub` (wipes `.open-next`, builds, verifies the Supabase ref, deploys `ag-matchhub` with the two Cron Triggers). `apps/www` is not redeployed.
7. **Smoke on production** with the cohort accounts: P1, P4, P5 (if Hero key), `/admin/ai`, `/plan` in the agent's currency, `/api/cron?only=reminders` with the secret returns JSON, Worker log shows `[cron 15m] 200`.
8. **Watch 48 h**: `ai_jobs` cost, `audit_logs`, Worker errors; `pg_stat_statements` for query hogs.

**Rollback** (any step): Worker → `wrangler rollback <previous id>` (seconds); flags → untarget; database → the paired `down` note in each migration header; all Stage B DDL is additive, so the pre-migration app keeps working against the migrated schema while a fix is prepared. Hero: nothing to roll back; a leaked key is revoked in Command HQ.

---

## 11. What `APPROVE PRODUCTION` means — and does not

**It authorises**: C1–C5 completed, steps 1–8 of §10 for the code and schema delivered in E0–E12, with the flags and secrets named in §4.3 and §5 at the levels the owner states in the approval.

**It does not authorise** any of these, each of which keeps its own gate exactly as the owner's decisions require:

- `LIVE_BILLING`, any gateway in `live` mode, live charging (D8 / D4) — a separate written approval, after sandbox round-trips.
- Outbound WhatsApp from a platform number in `live` mode, marketing templates, or any GHL number migration (D8) — after the cut-over test in the WhatsApp design §9.
- Hero production changes, including the MY ingest adapter and Phase 2 (D2).
- Purchase of a Malaysian domain (D7), any new AI subscription (D1), or any new paid service.
- Removal of production data beyond the residue in C4.

Suggested wording for the approval message, so that the record is unambiguous:

> APPROVE PRODUCTION — conditions C1–C5 met on <date>; `ai_features` targeted to <cohort / all verified>; AI key <yes/no>; Hero key <yes/no>; residue removal <yes/no>. Payments, WhatsApp live mode, Hero changes and GHL remain not approved.

---

*This report will be re-issued after the pilot with §2 and §8 filled from the pilot's own evidence. Until then its verdict stands: built and tested on staging; not yet ready for production.*
