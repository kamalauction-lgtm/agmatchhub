# Session handover — Stage B, 8 November 2026

> **Historical record (status as of 8 Nov 2026, end of Stage B).** Work has
> continued since: `main` moved on with the co-marketing pool security
> migrations 00099–00102, and the futuristic UI pilot lives on branch
> `ui/futuristic-pilot` under `docs/design/`. For the current state use
> `git log`, the migrations folder and the latest acceptance report in
> `docs/design/`; use this file for Stage B context and the safety rules.

**Purpose.** This was the hand-over written at the end of the Stage B session. It states where the platform is after Stage B (7–8 Nov 2026), what
is gated, and every safety rule in force. It was written read-only from the
repo, the staging database and the session record; nothing here is recalled
from memory alone.

Companion documents: `docs/stage-b-build-log.md` (what was built, in order),
`docs/production-readiness-report.md` (the `APPROVE PRODUCTION` report and
runbook), `docs/platform-state-handover.md` (the pre-Stage-B inventory).

## 1. Where things are

| Item | Value |
|---|---|
| Repo | `C:\Users\User\kamal\propertiguru`, GitHub `kamalauction-lgtm/agmatchhub` (public repository: nothing secret may ever be committed) |
| Branch / commit (8 Nov) | `main` at `e9797ea` (8 Nov 2026; superseded, see note above). Feature branch `feat/propertiguru-next-foundation` merged via PR #1 (`f07ce69`). Working tree clean except four untracked skill-bundle folders (`.agents/`, `.claude/`, `agent/`, `skills-lock.json`) |
| Workspaces | `apps/hub` (agent OS, Worker `ag-matchhub`), `apps/www` (marketplace, Workers `propertiguru-www` ID and `propertiguru-www-my` MY), `packages/db` (schema owner: migrations, seeds, Vitest suite), `packages/ai` (provider-agnostic Gemini/Anthropic over fetch) |
| Stack | Next.js 16.3 App Router, React 19, TS strict, Tailwind v4, next-intl (hub en/ms/id), Supabase (RLS + SECURITY DEFINER RPCs), OpenNext → Cloudflare Workers, `apps/hub/worker.js` cron wrapper → `/api/cron` |
| Production | Supabase `jokyyhvtahiypuzmfydp`, schema at **00077**, hub Worker last deployed 13 Sep 2026. Untouched by Stage B. |
| Staging | Supabase `aylzekkeurjsudazzxjv` (org "Staging", Free plan, Seoul pooler), schema at **00098**. Hub deployed at **https://hub-staging.propertiguru.id** (Worker `ag-matchhub-staging`, own secrets and cron triggers). Credentials in git-ignored `packages/db/.env.staging`, never in chat. |
| Key docs | `docs/stage-b-build-log.md` (running log, E0–E13), `docs/production-readiness-report.md` (verdict + runbook), `docs/stage-a-ai-workforce-and-hero-blueprint.md` (plan of record), `docs/whatsapp-cloud-api-design.md`, `docs/platform-state-handover.md` (inventory of what existed before Stage B), root `CLAUDE.md` (12 hard rules), `apps/hub/CLAUDE.md` |
| Memory | `~/.claude/projects/C--Users-User-kamal/memory/propertiguru-platform.md` is canonical; Obsidian notes under `04 Projects/Apps/IQI AG Agent Platform` |

## 2. Governance and gates

- Owner Kamal issued **`APPROVE BUILD`** on 7 Nov with decisions D1–D8. **`APPROVE PRODUCTION` has not been given.** Nothing from Stage B may reach production until the readiness report's conditions are met and that phrase arrives.
- D1 reuse existing AI providers, no new subscription, never display or commit keys, never request secrets in chat. D2 Hero read-only via `rens:status`; no Hero production change. D3 Hero benefits configurable, expiry 30 Jun 2027, review 1 Jun 2027, never hard-coded. D4 three independent price lists MYR/IDR/USD; `FREE_LAUNCH` stays. D5 pilot 27–28 Nov with 2 MY + 2 ID + 1 real agents; never invent identities. D6 never use production as staging. D7 domain stays `propertiguru.id`. D8 Billplz/Midtrans/Stripe and Meta Cloud API direct; GHL untouched, no paid campaigns, live charging off until separately approved.
- Standing rule: never claim a feature operational until it has passed appropriate tests. Report tested versus untested honestly.

## 3. Hard engineering rules (root `CLAUDE.md`)

`apps/www` must never hold the service-role key. Confidentiality by projection (clients never see supply-agent identity, commission, minimum price). RLS on every table plus a negative test. Never subquery a table inside its own policy. Confidential columns in `*_private` tables. Actor FKs → `auth.users`. Money is `numeric`. Versioned immutables. Append-only audit via `log_audit`. **Migrations staging → production, never production first.** WhatsApp only, never SMS. No hard-coded brand, prices, roles, countries, domains, legal text. UI strings in id/en/ms (parity test).

Tooling: `npm test` runs the suite against staging (`packages/db/scripts/test.mjs --env=staging`); `node packages/db/scripts/q.mjs --env=staging "<select>"` read-only SQL; `node packages/db/scripts/db-migrate.mjs --env=staging`; `npm run deploy:staging -w @pg/hub` from the repo root (refuses a bundle naming production); `npm run deploy:hub` is production, do not run it.

## 4. Completed work (all on staging, suite 467/467, 49 files)

| Epic | Migrations | Summary |
|---|---|---|
| E0 Staging | — | Isolated project, 77 migrations replayed, harness refuses production by default |
| E1 AI foundation | 00078–00080 | `packages/ai`, `runAi()` engine (flag → verified → quota → caps → breaker → provider row → `ai_jobs` ledger), `ai_roles` catalogue, `/admin/ai` |
| E2 AI Manager | 00081–00082 | Daily brief with cached denial, `/ai` directory, cron `ai_daily_brief` |
| E3 Listing Assistant | 00083 | Quality score, comparables, assistant in the wizard |
| E4 Marketing Studio | 00084 | One listing → WhatsApp/IG/FB/TikTok/brochure |
| E5 Secretary | 00085 | Reply drafts, e-mail via Resend, overdue nudges |
| E6 Qualifier & Matcher | 00086 | Intent + reason, duplicates, silence radar, alternatives (same country) |
| E7 Tasks | 00087 | `agent_tasks`, lead-anchored viewings, reminders |
| E8 Hero link | 00088–00089 | `hero_links`, `hero_benefits` singleton, grant/revoke RPCs, nightly re-check |
| E9 Commercial | 00090–00092 | Wallet kinds, plan families Free/Starter/Pro/Agency, three price lists, `/plan` |
| E10 Multi-country ingest | 00093 | MY location matcher, per-country vocabulary and units |
| E11 Payments scaffold | 00094 | Three adapters, intents, webhooks; every gateway `off`, `live` refused by trigger outside `LIVE_BILLING` |
| E12 WhatsApp Cloud API | 00095–00096 | Rules in SQL, webhook, platform door on `/leads`, `/admin/whatsapp`; nothing connected to Meta |
| Characters | 00097 | `ai_role_personas`: 36 named characters from Kamal's art, same cast in both countries, `CompanionBadge` beside the agent on every AI surface |
| E13 Workforce complete | 00098 | All 19 planned roles live (see §5) |

## 5. AI Workforce — 36 roles, all live

Engine contract: every role has a deterministic floor; the model improves on it; the screen shows source and reason (`AiStatus`). Nothing the AI produces is written to a listing, lead or client without the agent.

- **Characters**: Astra (AI Manager), Nova, Lyra, Zayn, Vex, Echo, Mira, Tempo, Orion, Luna, Kira, Atlas, Vega, Sora, Niko, Kael, Ivy, Piper, Scout, Raya, Quinn, Halo, Pixel, Flux, Juno, Neo, Solis, Titan, Clara, Finn, Aria, Rio, Prism, Cosmo, Mila, Link. Art in `apps/hub/public/ai/characters/`. `lib/ai/cast.ts` `getCompanions(keys)` supplies them.
- **Standalone tools**: `/ai/research`, `/ai/outreach`, `/ai/documents` (+ `POST /api/ai/document`), `/ai/crossborder`, `/ai/coach`, `/ai/closing`, `/ai/review`, `/collab/partners`, `/studio/plan`, `/listings/[id]/report`.
- **Panels on existing screens**: refresh planner on `/listings`; photo check, other-language fields and translate on listing edit; translate in the reply panel; chat-to-requirement on `/requests/new`; offer summary under MatchHub offers; onboarding guide on `/training`; Studio video tab and three poster templates.
- **Knowledge as data**: `market_facts` (20) and `closing_steps` (30) seeded **draft**; agents see a draft label until an admin verifies rows on `/admin/ai` (audited). These are the builder's drafts of MY/ID rules and must be verified by the owner or counsel.
- `packages/ai` supports attachments (images, PDF) for Gemini and Anthropic.
- **No provider key exists anywhere.** No model call has ever succeeded; every role has only answered through its rules path. Output quality is untested until a key lands.

## 6. MatchHub

One module inside the hub, not the product. Requirement → admin approval → password-protected link → supply agents submit → RA filters → client presentation link with client-safe projections only. Offers, commission agreements, disclosures and viewings live under `/requests/[id]/s/[sid]` and `/submissions/[sid]` (`components/collab/*`). Spec in `apps/hub/docs/master-spec-*.md`. Co-marketing pool (`/collab/pool`) is a sibling module.

## 7. Hero integration

Phase 1 only: the hub checks its own verified e-mail/phone against Hero's partner API `POST /api/rens/status` (scoped key `HERO_API_KEY`, not present anywhere). Linked agents receive `entitlement_grants` with source `hero_benefit` from the editable `hero_benefits` row; deep links to Hero AI Coach and Sales Lab (`external_url` on `objection_coach`, `team_coach`). Phase 2 (country, membership status, licence expiry) and the MY ingest adapter change are written down, not applied. Never modify Hero production.

## 8. Outstanding migrations and secrets

- Production has **21 pending migrations, 00078–00098**, all additive, each with a `down` note. Run only via the readiness runbook §10 after `APPROVE PRODUCTION`, with backup confirmed first.
- Production Worker secrets: 6 pre-existing; none of Stage B's. `CRON_SECRET` is required at cut-over or every cron tick is dropped. AI and Hero keys only if approved for launch. Gateway and Meta secrets must not be set in production.
- `ai_features` is globally on in production; target it to the pilot cohort before any AI key lands.
- Rotate the production DB password and the `sb_secret_` key (they appeared in earlier chats and an untracked env file).

## 9. Pending decisions and owner inputs

| By | Input |
|---|---|
| 14 Nov | AI provider key on staging (Worker secret + `.env.staging`); `HERO_API_KEY`; pilot names with Hero identities; verified MY company profile; **verify the 20 market facts and 30 closing steps** on `/admin/ai` |
| 20 Nov | Production residue decision (32 `TSTREQ` requirements, 3 test accounts); `ai_features` targeting plan; optional Meta app and gateway sandboxes; GitHub staging secrets so the CI RLS job runs |
| 26 Nov | Supabase backup/PITR confirmed |
| 28 Nov | Pilot sign-off → report updated → `APPROVE PRODUCTION` → launch 29–30 Nov |

Readiness verdict today: **not ready**. C1 (source pushed) met; C2 pilot, C3 secrets, C4 residue, C5 backup open.

## 10. Staging constraints and gotchas

- Staging has no AI key, no Hero key, no gateway or Meta credentials; `.env.staging` holds self-generated placeholders for Midtrans and the WhatsApp app secret, marked as such, for signature paths only. Never promote them.
- Test accounts `*@seed.propertiguru.test` (RA, SA, LA, MA, Admin); Kamal has his own super-admin login on staging. The browser pane in the last session was signed in as the Listing Agent, so `/admin/*` redirected to the dashboard there.
- `deploy-staging.mjs` rewrites the `.env.production` copies OpenNext bundles, else the build-target check fails. Stop any dev server and clear `.next` before building. Run it from the repo root with `-w @pg/hub`.
- Vitest maps `@/` to `apps/www`; hub pure modules under test must use relative imports. `position` is a reserved word in `returns table (...)`. The flags admin UI refuses "targeted" before a target exists. A hidden browser pane never loads lazy images.
- The full test suite mutates shared plan/grant rows, so an AI allowance chip can change while the suite runs. Not a bug.
- Session tooling (verified 8 Nov): `ui-ux-pro-max` skill available; `frontend-design` skill on disk but not loaded; Playwright MCP configured but no tools; 21st "magic" MCP not authenticated.
- Kamal's follow-up pattern after each build: update the readiness report, Obsidian (curated notes + sync + link check), the build log and memory in the same pass. Versioned deliverables (v1, v2…) and WhatsApp only are standing rules across all his projects.
