# IQI AG MatchHub — Phase 0: Architecture & Implementation Plan

*Produced 18 Jul 2026 per master spec §59 (Phase 0) and §66 (Required Output Before Coding). v1.*

---

## 1. Executive Product Summary

IQI AG MatchHub is a private, requirement-driven property collaboration platform — not a public listing portal. A **Requesting Agent** posts a verified client requirement; Admin approves it and the system issues a password-protected request link; verified **Supply Agents** submit matching properties through that link; the Requesting Agent filters submissions and shares only approved ones with the buyer/tenant via a separate **client presentation link**. The client never learns the Supply Agent's identity; the Supply Agent never learns the client's identity. Commission sharing, legal disclosures, contact release, viewings and offers are all negotiated inside the platform under versioned, dual-accepted, audited agreements. Admin has full governance visibility.

Core invariant (§69): *Requesting Agent owns the client relationship; Supply Agent retains protection for the property; the client sees only what the Requesting Agent authorises; every critical action is permission-controlled and auditable.*

Initial markets: Malaysia (EN/MS, MYR, sqft), Indonesia (ID/EN, IDR, sqm), UAE-ready (EN, AED, RTL-ready). Languages at MVP: English, Bahasa Malaysia, Bahasa Indonesia.

## 2. Assumptions

Documented per §59 ("make a reasonable, configurable assumption and document it"):

| # | Assumption | Configurable via |
|---|---|---|
| A1 | Brand: name "IQI AG MatchHub", short name "MatchHub", colours crimson `#B11226` / charcoal `#1F1F1F` / silver `#C0C0C0` / white — pending final brand assets | `brand_settings` table + `config/brand.ts` |
| A2 | Official IQI + AG Team logo files not yet supplied → clearly labelled placeholders (candidates exist in `kamal\logo IQI AG\` but treated as unofficial until Kamal approves) | Super Admin brand assets upload |
| A3 | Domain/subdomain TBD → all URLs from env vars; local/staging use `localhost` / `*.pages.dev` or preview URLs | `NEXT_PUBLIC_APP_URL` etc. |
| A4 | One Supabase project for dev initially; staging/production projects created before first deploy | env per environment |
| A5 | Client (buyer/tenant) auth at MVP = presentation token + password; email OTP added later (needs email provider) | presentation settings |
| A6 | Contact-detail detection in messages defaults to **Warning mode** (flag, don't block) | `system_settings` |
| A7 | Admin approval for commission agreements OFF by default at MVP, per-country toggle | `country_settings` |
| A8 | Notifications at MVP = in-app only; email/WhatsApp adapters stubbed behind interfaces (WhatsApp-only rule applies when messaging goes live — never SMS) | notification adapters |
| A9 | Malware scanning = "readiness" (hook points + quarantine flag), no live scanner at MVP | file-processing service |
| A10 | Human-readable ID year prefix uses creation year (`REQ-2026-000001`), per-year sequence via Postgres sequence table | DB function |
| A11 | Money: `numeric(14,2)` amounts, `numeric(7,4)` percentages; IDR fine at 2dp (display 0dp per currency config) | `currencies` table |
| A12 | Deployment target: Cloudflare Pages (Next.js on Workers) — matches Kamal's existing Cloudflare + GitHub workflow; fallback Vercel if a needed Next feature is unsupported | CI config |
| A13 | Mobile verification (SMS OTP) = readiness only at MVP | feature flag |
| A14 | PDF export of client presentation = post-MVP (print-friendly page at MVP) | feature flag |

## 3. System Architecture

**Stack** (§50): Next.js 16 (App Router, stable) · React · TypeScript strict · Tailwind CSS v4 + shadcn/ui (accessible, Radix-based) · Supabase (Postgres + Auth + Storage + Realtime + Edge Functions) · Zod (validation) · react-hook-form · next-intl (i18n: en/ms/id, ar-ready RTL) · Vitest (unit/integration) · Playwright (E2E) · GitHub + GitHub Actions · Cloudflare (DNS/CDN/WAF/Turnstile). Same core stack as mm2h-guru → reusable patterns.

**Layers:**

```
Browser (agent PWA-ready UI / client presentation / admin desktop)
  │  no confidential fields ever serialized to client components
Next.js server (Server Components + Server Actions + route handlers)
  │  ├─ validation (Zod), authz service (role+scope checks)
  │  ├─ PROJECTION LAYER: client-safe / agent-safe / admin DTOs   ← key §21/§78 control
  │  ├─ domain services (requests, submissions, presentations,
  │  │   commissions, disclosures, messaging, offers, viewings)
  │  ├─ audit service (append-only), notification service (adapters)
  │  └─ file-processing service (validate → strip EXIF → optimise → client-safe copy)
Supabase
  ├─ Postgres + RLS on every protected table (defense in depth: RLS AND server checks)
  ├─ Auth (email+password, verification, reset; MFA-ready)
  ├─ Storage: 9 buckets (§44), private by default, signed URLs
  └─ Realtime: messages + notifications
Cloudflare: DNS, SSL, CDN, rate limiting, Turnstile on public forms
```

**Three trust zones, three access paths:**
1. **Agents/Admins** — Supabase Auth session → RLS-scoped queries + server checks.
2. **Client viewer** — NO Supabase session. Signed presentation token (httpOnly cookie after password gate) → server-only routes → client-safe projection. Client never gets an anon-key DB connection.
3. **Public** — landing/auth pages only; Turnstile on registration and request-link password gates.

**Key design decisions:**
- **D1 — Projections, not filtering in UI**: every response surface has an explicit DTO whitelist (`toClientSafeProperty()`, `toSupplyAgentRequestView()`, …). Confidential fields (min price, commission, supply-agent identity, addresses) simply do not exist in the serialized payload (§21, §78).
- **D2 — One agent account, per-transaction roles** (§3): `user_roles` for platform roles; requesting/supply role derived from relationship to a request/submission, never a permanent account type.
- **D3 — Append-only audit** via `SECURITY DEFINER` DB function + trigger set; no UPDATE/DELETE grants on `audit_logs` (§52).
- **D4 — Versioned legal content**: declarations, consents, commission agreements, disclosures all immutable-version pattern — new row per change, never overwrite (§31, §74, §76, §80).
- **D5 — Tokens**: request/presentation links use 32-byte random base64url tokens stored hashed (like passwords); raw token appears only in the generated URL/QR (§15).
- **D6 — Brand config**: single `config/brand.ts` reading env + `brand_settings` DB overrides; no component hard-codes the name (§70).
- **D7 — Money**: `numeric` types only; server recomputes all commission maths before accepting (§36, §83).

## 4. User-Role Permission Matrix (summary)

Full matrix to live in `docs/permissions.md` in the repo. R=read, W=write, ✗=forbidden. "Own" = scoped by relationship.

| Capability | Super Admin | Admin | Country Admin | Compliance | Req. Agent | Supply Agent | Client |
|---|---|---|---|---|---|---|---|
| Users & verification | RW global | RW scope | RW country | R | own profile | own profile | ✗ |
| Requests | R global, freeze | RW approve (scope) | RW country | R | RW own | R authorised-link only | ✗ |
| Submissions (all fields) | R global, freeze | R scope | R country | R | R (linked to own request, incl. commission) | RW own | ✗ |
| Competing submissions | R | R | R | R | R (own request) | **✗ never** | ✗ |
| Client presentation | R | R | R country | R | RW own | ✗ | client-safe R via token |
| Supply Agent identity | R | R | R | R | R (after collab per visibility level) | — | **✗ never** |
| Client identity/contact | R | R | R country | R | RW own | **✗ never** | — |
| Commission agreements | R | R (approve if configured) | R country | R (no edit §7) | RW own side | RW own side | **✗ never** |
| Legal disclosures | R | R | R country | R | R + acknowledge | RW own | client-safe summary only |
| Messages | R | R scope | R country | R relevant | RW own threads | RW own threads | ✗ (Q&A via presentation only) |
| Offers / viewings | R | R scope | R country | R | RW own | RW own | suggest/request via presentation |
| Audit logs | R | R scope | R country | R | ✗ | ✗ | ✗ |
| Brand/country/legal config | RW | R | RW local wording | ✗ | ✗ | ✗ | ✗ |

## 5. Database Table Plan

All ~80 tables from §41 + §82, grouped into 10 migration domains (UUID PKs, human-readable IDs separate, `created_at/updated_at/created_by/updated_by`, `archived_at` where relevant):

1. **Identity & access**: profiles, users_private, roles, user_roles, agent_profiles, agent_verifications, agencies, agency_members, banned_users, blocked_sessions
2. **Reference/config**: countries, country_settings, markets, languages, translations, translation_overrides, currencies, property_categories, property_types, system_settings, feature_flags, email_templates, **brand_settings, brand_assets**
3. **Requests**: property_requests, request_locations, request_preferences, request_links, request_link_access_logs
4. **Submissions**: property_submissions, property_submission_sources, property_submission_media, property_submission_documents, property_submission_status_history, property_availability_history
5. **Presentations/client**: client_presentations, client_presentation_properties, client_access_tokens, client_access_logs, client_feedback, client_shortlists, client_rankings, comparison_sessions
6. **Collaboration**: conversations, conversation_participants, messages, message_attachments, offers, offer_history, viewing_appointments, viewing_history, contact_release_requests
7. **Commission (§82)**: commission_agreements, commission_agreement_versions, commission_components, commission_participants, commission_acceptances, commission_payment_records, commission_supporting_documents
8. **Disclosures (§82)**: legal_disclosures, legal_disclosure_documents, legal_disclosure_history, legal_disclosure_acknowledgements
9. **Trust profile (§71/§82)**: agent_social_links, agent_name_cards, agent_trust_profile_history
10. **Legal/governance**: declarations, declaration_versions, consent_records, violation_reports, violation_evidence, admin_actions, compliance_notes, audit_logs, security_events, notifications, notification_preferences

Constraints of note: percentage-split CHECK (`listing + buyer = 100` enforced server-side with configurable precision, DB CHECK for non-negative/≤100); one `current_version_id` per commission agreement; status enums as Postgres enums or lookup+CHECK; partial unique index for one active client presentation token per presentation.

## 6. Data-Classification Matrix

| Class | Examples | Storage | Who sees |
|---|---|---|---|
| **C0 Public** | landing content, system assets | public bucket / static | everyone |
| **C1 Client-safe** | approved property fields, client-safe media, RA branding, disclaimer | `property-client-safe`, projections | client with valid token |
| **C2 Agent-collab** | requirement details, submission full specs, messages, offers, restricted trust profile | RLS tables | the two transaction agents + admin scope |
| **C3 Agent-confidential** | min acceptable price, commission & co-broke terms, source-agent chain, internal notes | RLS + projection-excluded | owning agent side + authorised admin only |
| **C4 Identity/PII** | ID docs, licences, name cards, client identity, appointment letters | `users_private`, private buckets | owner + admin/compliance |
| **C5 Governance** | audit logs, security events, compliance notes | append-only, service-role writes | admins per scope |

Rule: C3+ fields never enter any client-safe or cross-side projection; C4 media only via short-lived signed URLs; C5 immutable.

## 7. Main User Flows

1. **Agent onboarding**: register (Turnstile) → email verify → profile + licence + docs upload → status `Under Review` → Admin verifies → `Verified` (audit + notifications at each step).
2. **Requirement → link**: RA drafts (autosave, multi-step form) → submit → Admin approve/amend → system generates `REQ-…` + hashed token link + password + QR + expiry → RA shares → access logged.
3. **Property submission**: SA opens link → password gate → login/register → views requirement (anonymised client profile) → submits property (media, source classification §17, commission declaration §72, active declaration §28) → RA notified.
4. **Review → client presentation**: RA review board (filter/sort/risk indicators) → shortlist/reject/request-info → RA declaration §29 → build presentation (order, notes, hidden fields, password) → client link issued.
5. **Client review**: password gate → view/compare (2–5) /rank/shortlist/feedback/viewing request/offer suggestion → RA notified; zero SA data in any payload.
6. **Commission agreement (§73–76)**: SA declares total commission → proposes split (50:50/custom %/fixed/hybrid) → RA accept/counter/clarify → both actively accept → versioned lock → amendments = new version + re-acceptance.
7. **Disclosure (§79–81)**: SA records disclosures + declaration §80 → RA acknowledges → optional client-safe summary → attached to presentation.
8. **Negotiation → close**: thread per submission, quick actions, offers/counters, viewings, optional contact release (dual accept ± admin) → transaction closed → archive; audit throughout.
9. **Governance**: report violation → admin queue → investigate (freeze/warn/suspend) → resolve; consent and audit trails throughout.

## 8. Security Threat Model (top threats → mitigations)

| Threat | Mitigation |
|---|---|
| T1 Client discovers Supply Agent identity (bypass risk) | D1 projections; separate client runtime path (no DB access); filename/metadata scrubbing; E2E leak tests asserting absence in HTML/API/headers (§60) |
| T2 Agent bypasses co-broke (contact exchange in messages) | contact-detail detection (configurable warn/mask/review/block); contact-release workflow; no-bypass declarations + audit evidence |
| T3 IDOR across agents (competing submissions, other requests) | RLS on every table + server-side authz double-check; UUIDs + hashed tokens; automated permission tests per role |
| T4 Request link leak / brute force | hashed 256-bit tokens, password + rate limit + lockout, expiry, max-access count, optional allowlists, Turnstile, full access logs |
| T5 Commission data leak to client or rival agents | commission tables RLS'd to the two participants + finance/compliance admin; excluded from every client projection; no commission in notifications previews/filenames/analytics (§78) |
| T6 Silent tampering of agreements/consents | immutable version rows, `current_version_id` pointer, acceptance re-required on change, append-only audit |
| T7 Malicious uploads | MIME+size validation, safe renaming, EXIF/GPS strip, private originals, client-safe copies, scan-readiness quarantine flag |
| T8 Privilege escalation via client metadata | roles only in server-side tables; RLS policies use `user_roles` join, never JWT custom claims alone |
| T9 Secrets exposure | service-role key server-only; `.env` gitignored + `.env.example`; CI secret scanning; no keys in client bundles |
| T10 Scraping/enumeration | rate limiting (Cloudflare + app), non-sequential IDs, auth required for all agent data |

## 9. MVP Backlog

§58 items 1–33 **plus** §85 additions, grouped as epics: E1 Foundation/auth/i18n/design-system · E2 Agent registration+verification · E3 Admin console (users, countries, legal content) · E4 Requirements+approval+links · E5 Submissions+media+source+declarations · E6 Review board · E7 Client presentation+comparison+feedback · E8 Messaging+viewings+offers+contact release · E9 Brand config+logo management (§70) · E10 Trust profiles+name cards+social links (§71) · E11 Commission module (§72–78, 83–84) · E12 Disclosure module (§79–81) · E13 Notifications+audit views · E14 RLS/E2E/security test suites · E15 CI/CD+docs. Full ticket-level backlog to be maintained as GitHub issues once the repo exists.

## 10. Implementation Sequence

Master-spec Phases 0–8 (§59) with §86's 16 modules inserted where they belong — nothing removed:

| Phase | Contents | §86 modules absorbed |
|---|---|---|
| **0** Discovery | this document | — |
| **1** Foundation | repo, Next.js+TS+Tailwind, Supabase, auth, env handling, i18n, design tokens (light/dark/system), core schema+RLS, audit service, seed | **1** brand config, **2** logo asset management (placeholders) |
| **2** Agent & Admin | registration, verification, admin user mgmt, country mgmt, legal-content mgmt, agent dashboard | **3** trust profile, **4** photo+name card, **5** social links |
| **3** Requirements | forms, approval, statuses, secure links, password, QR, access logs | — |
| **4** Submissions | form, media, source classification, consent, statuses, review board | **6** commission declaration (part of submission) |
| **5** Client Presentation | builder, client-safe projection, link, comparison, shortlist, feedback, tracking | **13** client-safe disclosure summary |
| **6** Collaboration | messaging, viewings, offers, contact release, notifications | **7** sharing proposal, **8** 50:50/custom calcs, **9** dual acceptance, **10** agreement versioning, **11** disclosures, **12** RA acknowledgement |
| **7** Governance | violation reports, compliance, security events, audit views, exports | **14** commission+disclosure audit logs |
| **8** Quality & Deploy | unit/integration/E2E/security tests, a11y+perf review, staging, prod guides, backups | **15** RLS tests, **16** E2E acceptance tests |

Each phase ends with a §67 implementation report and a versioned milestone (v1, v2, … per Kamal's versioning standard).

## 11. Proposed Folder Structure

```
ag-matchhub/app/                    # the repo root (git)
├─ .github/{workflows, ISSUE_TEMPLATE, pull_request_template.md}
├─ supabase/{migrations/, seed.sql, functions/}
├─ docs/  (architecture, database, permissions, security, i18n, deployment, guides)
├─ messages/{en, ms, id}.json       # next-intl
├─ src/
│  ├─ app/
│  │  ├─ (public)/        # landing, terms, privacy, error/expired pages
│  │  ├─ (auth)/          # login, register, verify, reset
│  │  ├─ (agent)/         # dashboard, requests, submissions, review, presentations, messages, offers, viewings, profile
│  │  ├─ (admin)/         # dashboards, queues, config, audit, reports
│  │  ├─ r/[token]/       # request link gate + requirement view
│  │  ├─ p/[token]/       # client presentation (isolated layout, no agent chrome)
│  │  └─ api/             # route handlers where server actions don't fit
│  ├─ components/{ui, forms, property, presentation, admin, layout}
│  ├─ config/{brand.ts, countries.ts, navigation.ts}
│  ├─ lib/{supabase (server/client/service), auth, authz, projections/, validation/ (zod), audit.ts, ids.ts, tokens.ts, money.ts, media/, notifications/, i18n.ts}
│  ├─ services/{requests, submissions, presentations, commissions, disclosures, messaging, offers, viewings, verification, reports}
│  └─ types/
├─ tests/{unit, integration, e2e, rls}
├─ .env.example  CLAUDE.md  README.md  SECURITY.md  CONTRIBUTING.md  CHANGELOG.md
```

(Project docs like this file stay in `kamal\ag-matchhub\docs\`; the app repo lives in `kamal\ag-matchhub\app\`.)

## 12. Required Environment Variables

`NEXT_PUBLIC_APP_URL` · `APP_BASE_URL` · `AUTH_CALLBACK_URL` · `CLIENT_PRESENTATION_BASE_URL` · `REQUEST_LINK_BASE_URL` · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` (server-only) · `CLOUDFLARE_ACCOUNT_ID` · `CLOUDFLARE_API_TOKEN` (CI-only) · `EMAIL_FROM_DOMAIN` · `NEXT_PUBLIC_TURNSTILE_SITE_KEY` · `TURNSTILE_SECRET_KEY` · `TOKEN_SIGNING_SECRET` (presentation cookies) · `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_APP_SHORT_NAME` / `NEXT_PUBLIC_APP_TAGLINE` (brand fallbacks; DB overrides win). All documented in `.env.example`; separate values per local/staging/prod (§49).

## 13. Risks & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Spec breadth vs MVP (80+ tables, 4 admin roles, 3 languages) | schedule blowout | strict phase gates; §58 scope only; "readiness" stubs stay stubs |
| Confidentiality regression as features grow | platform-killing trust breach | projection layer + leak tests in CI from Phase 5 onward; any new field defaults to non-client-safe |
| Supabase RLS complexity (transaction-scoped roles) | subtle authz bugs | dedicated `tests/rls` suite run in CI against a shadow DB; policies reviewed per migration |
| No Supabase/GitHub resources yet | Phase 1 blocked | Kamal to create Supabase project + GitHub repo (10 min, needs his accounts) |
| Logo/brand assets pending | client-facing polish blocked | labelled placeholders (§70 requires this); Super Admin upload path from Phase 1 |
| Legal wording is draft | compliance exposure | versioned legal-content system; launch checklist requires per-country legal review (§68) |
| i18n drift (3 languages × huge surface) | untranslated UI | next-intl type-safe keys; CI check for missing keys; EN fallback |
| Next.js-on-Cloudflare edge limitations (image processing, PDF) | feature blockers | media processing in Supabase Edge Functions/queue, not in the web runtime; fallback Vercel documented |

## 14. Acceptance Criteria

The MVP is complete only when **all** §61 criteria pass (register→verify→request→approve→link→submit→review→present→client compare/feedback, zero SA identity leakage, zero client identity leakage to SA, messaging, audit, EN/MS/ID, RLS tests green, CI/CD deploys, docs complete, no keys committed, clean production build) **and all** §85 criteria pass (official name everywhere, dual-logo branding, trust profiles + name cards + verified social links, commission declaration/50:50/custom splits validated to 100%, active dual acceptance, versioned non-overwritable agreements, commission hidden from client, disclosures + acknowledgement + client-safe summary, commission/disclosure audit logs, RLS on all new tables). Each criterion maps to at least one automated test in Phase 8; the §67 final report will state pass/fail per criterion honestly.

---

**Phase 0 complete. Next: Phase 1 — Foundation** (scaffold repo, Supabase schema + RLS, auth, i18n, design system, brand config).
