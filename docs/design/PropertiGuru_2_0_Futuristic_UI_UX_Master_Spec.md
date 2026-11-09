# PROPERTIGURU 2.0 — FUTURISTIC AI REAL ESTATE OPERATING SYSTEM

**Owner design direction / implementation reference**  
**Version:** 1.0 — 9 November 2026  
**Scope:** Existing `propertiguru.id` codebase only; Hub + public marketplace  
**Repo:** `C:\Users\User\kamal\propertiguru`  
**Environments:** `hub-staging.propertiguru.id` for QA; production Hub and `www.propertiguru.id` only after explicit owner sign-off.

## 1. Owner decision and interpretation

The desired visual direction is **PREMIUM FUTURISTIC AI COMMAND CENTRE**, with a **Luxury PropTech** finish: premium, intelligent, beautiful, business-friendly, modern, and clearly more innovative than a generic SaaS dashboard. The prior instruction *“not overly futuristic”* means **avoid heavy cyberpunk, neon overload, gamer graphics, illegible holograms, long animations and unnecessary 3D**. It does **not** mean keeping the current generic layout. Futurism must be purposeful, subtle and fast.

**Non-goal:** No new platform, rewrite, independent website, database, infrastructure, subscription, or new external AI service to achieve a visual refresh. Preserve existing monorepo, Next.js/React/Tailwind, auth, Supabase, RLS, routes, existing APIs, language routing, workflows and user data.

**Scope of this design spec:** A cross-platform design system and page-by-page interaction concepts. This is the design brief, **not a claim that these features have been implemented**, and not automatic authorisation to deploy.

## 2. Brand and visual principles

1. **Signature identity:** “Your AI Property Operating System” — every agent has a coordinated team of digital employees. The **consumer marketplace** remains a welcoming real-estate discovery product, not a control panel.
2. **Visual DNA:** Ink/navy for structure and executive confidence; precise electric-blue accents for intelligence and actions; restrained violet for AI; soft warm gold for premium distinctions only; layered ice-white backgrounds and occasional dark control surfaces. Reuse existing design tokens from commit `6d046a6`, and rationalise any conflicts before editing them. Do not blindly substitute new hex values.
3. **Surfaces:** Rounded but disciplined cards, subtle depth, selective glass highlights, crisp data tables and strong information hierarchy. Most pages should stay light; a darker hero/AI panel may provide contrast.
4. **Typography:** Readable, consistent and multilingual; strong numbers, short labels, semantic headers. Never make important text low contrast.
5. **Motion:** Brief, meaningful microinteractions (hover, loading, expanding sections, transition to assistant detail); respect `prefers-reduced-motion`; no animations that block a task.
6. **Responsiveness:** 1440px desktop, 768px tablet and 375px phone minimum test widths; touch-sized targets; no horizontal page overflow.
7. **Accessibility:** Keyboard and screen-reader navigation, visible focus, high-contrast status labels, meaningful alt text, labels, and mobile usability.
8. **Performance:** Do not put full-resolution 3D character artwork or heavy shaders on list views. Use optimised individual WEBP/AVIF portraits with responsive sizes, lazy loading and static fallbacks; confirm actual loading performance.
9. **Real data:** All KPIs, live states, actions, activity and recommendations derive from verified data. No fake percentages, alerts, active assistants, property inventory, rankings or completed tasks.
10. **Locale and role:** EN/BM/ID support, market/currency/context without inferring permissions from language. Preserve role-based entitlements and tenant boundaries.

## 3. Global shell and navigation

**Agent Hub**: collapsible, grouped icon-first sidebar; branded top bar; clear breadcrumb/title, workspace context and responsive navigation. Offer global search and command-entry concepts only if compatible with existing search capabilities. Add a persistent but unobtrusive **Astra assistant launcher** that opens an actually available action; otherwise mark it Preview/Planned. Include accessible notifications and clear credit/plan visibility where data already exists.

**Page structure**: (A) contextual hero with purpose and top actions; (B) operational metrics and tasks; (C) primary workspace (list/card/table/kanban appropriate to the content); (D) AI guidance panel when supported by real data. Preserve familiar agent workflows, navigation labels and deep links.

## 4. Modules and acceptance criteria

### 4.1 Dashboard / AI Command Centre
- Premium contextual welcome; Astra AI Manager panel with a real daily brief or explicit empty/unavailable state.
- KPIs for actual listings, enquiries/leads, overdue replies, activity and plan usage where data is available; trend visuals only with real historical figures.
- Priority tasks, recent listings, follow-ups and shortcut actions; no leak of another agent’s listing.
- Graceful empty states and missing environment configuration; no page-level exception caused by an absent marketplace share URL.
- Excellent desktop/mobile layout, keyboard navigation and visual consistency.

### 4.2 AI Workforce — Signature experience
- **36 illustrated named AI personalities** exist in `apps/hub/public/ai/characters/`; reuse them and inspect current mappings to `ai_role_personas` (migration `00097`), without generating 36 redundant new images.
- Every role has **name, image, actual role, capability description, category, clear status, tier/entitlement where supported, and an honest action**.
- Status vocabulary tied to verified backend reality: e.g. `Available`, `Planned`, `Restricted`, `Unavailable`. A role with a portrait is **not automatically live**. Investigate and correct the page’s “36 live” claim if actual operational capability is fewer; the earlier blueprint described six initial operational roles. **Do not silently relabel or activate capabilities; provide a factual status matrix and request owner approval for public wording.**
- Browse by team/category; search/filter, favourites only if already implemented or explicitly scoped; details show inputs, outputs, permissions, sample examples and existing route/action. Disabled role cards explain status rather than opening broken routes.
- Individual character crop, consistent uniforms/visual treatment, fast-loading card design. Image assets and role identifiers remain stable.

### 4.3 My Listings / Property Intelligence
- Strong real property photo, listing details, locality, asking price, truthful status and current actions.
- Grid/list and filtering using existing capabilities; listing quality tools only if actually functional.
- Correct agent ownership and RLS; neither private owner data nor supplier/commission data appears to unauthorised viewers.
- Graceful share-link handling when marketplace URL is missing/invalid; page must remain usable.

### 4.4 Leads / CRM
- Readable pipeline/table and lead details; source, stage, last contact and next action where available.
- Clear activity history and reminders; AI scoring, silent lead alerts or match suggestions labelled only when backed by available implementation.
- No outreach or WhatsApp sending without explicit operational approval.

### 4.5 Tasks, Appointments and Follow-up
- Day/week focus, deadlines, urgency, completed/overdue status, sensible reminders and accessible mobile interactions.
- Keep existing scheduling and notification semantics; no phantom automated bookings.

### 4.6 Content Studio
- Premium creative workspace with listing selector, existing draft actions, results preview and project templates where available.
- Named creative AI employees as guides (e.g., Juno/Neo/Luna) **only as real capability entry points**.
- Preserve existing preview/export flows; missing marketplace URL never crashes the page.

### 4.7 MatchHub / Co-marketing Pool / Client Requirements
- Premium network intelligence interface: real offer cards, approved/published status, matching signals and partner workflows; clear empty states.
- Respect security protections from migrations `00099`–`00102`: public pool cards read only from approved card projection; private listing, owner and offer data never exposed.
- Explicitly distinguish **staging test offers** from production availability; never manufacture inventory to make the page seem active.
- Preserve secure pickup flow and current approvals/entitlements.

### 4.8 Agent Academy / Training
- Clear learning tracks, progress only when data exists, next recommended lesson and resource cards; usable on mobile.

### 4.9 Plans, Credits, Settings and Admin
- Transparent usage cards with sourced quotas and pricing; separate freebies, paid AI credits and unavailable actions.
- No live payment activation, plan upgrade charge or billing gateway change without separate approval.
- Admin styling follows same system but maintains dense information and permission visibility.

### 4.10 Public Marketplace — `www.propertiguru.id`
- Consumer-first home search, beautiful photography, map/filter/property detail experiences using real listings, responsive search and localisation.
- Distinct from the agent Hub but visibly same brand system. SEO/indexing/canonical considerations by locale/domain. Do not pretend a frontend Hub deploy also deploys the public `www` app.

## 5. Design system deliverables

Implement/validate a coherent system using existing Phase 1 foundations (`Button`, `Badge`, `Card`, `EmptyState`) and current ink/gold/accent tokens. Provide:
- Token list, surface hierarchy, type scale, spacing/grid, radii, shadows, status and emphasis rules.
- Component state matrix: rest/hover/focus/disabled/loading/error/empty, including touch.
- Sidebar/top bar, metric cards, worker cards, listing cards, tables, drawers, modals, tabs, forms and notifications.
- Character design and asset handling rules (stable role ID, filename, alt text, crop, formats).
- Light mode priority; dark mode only after performance/usability assessment or separate approval.

## 6. Visual approval package — must precede application page redesign

1. Read the existing current repo/build and inspect the exact staging deployment. Document the commit/build identifier. If unavailable, say so.
2. Produce **actual visual storyboards** (not prose only): Dashboard, AI Workforce, My Listings, **desktop + mobile**. Show their current design and proposed design side-by-side or separately labelled.
3. Present a single selected primary direction (**Premium Futuristic AI Command Centre**) plus one restrained visual variation if useful; do not restart a long three-direction discovery exercise unless the owner asks.
4. Provide a UI component inventory mapping from existing to proposed components and route-by-route change scope.
5. Verify any security/configuration questions relevant to proposed UI read-only; do not merge scope with unrelated backend maintenance.
6. Present implementation order and QA matrix. Request visual approval for the storyboard.

**Design-preview files are not production UI**. Keep them in an isolated preview area or docs; do not overwrite route components merely to render a mockup.

## 7. Implementation sequence after visual approval

- **Stage 0:** Lock owner-approved visual storyboard, review current code differences and protect worktree. Resolve or record the outstanding marketplace URL crash before assuming a visual page can ship. Establish fresh staging build identity.
- **Stage 1 (pilot):** Integrate Phase 1 `Button`, `Badge`, `Card`, `EmptyState` primitives with the **Dashboard and AI Workforce only**, on a dedicated UI branch. Preserve live behaviours, permissions and accurate status labels. No database changes.
- **Stage 2:** My Listings, Leads/CRM, Tasks/appointments and Content Studio.
- **Stage 3:** MatchHub/co-marketing, training, subscriptions/settings and admin.
- **Stage 4:** Public marketplace `apps/www` as a separate deployable app, preserving search, SEO and listing safety.
- At each stage: change review, lint, typecheck, build, functional integration tests, authenticated browser tests, screenshots at 375/768/1440, EN/BM/ID checks, accessible focus/keyboard, regressions and deploy target verification.
- Only after verified staging results and **explicit owner approval**: merge/push/deploy to production. No automatic remote push or launch.

## 8. Critical open items — separate security/release blockers

1. Verify actual agent-specific `listings` RLS access; query `.eq('agent_id', user.id)` alone is not proof.
2. Resolve missing/malformed `NEXT_PUBLIC_MARKETPLACE_URL` page-crash regression; ensure build-time URL injection and fallbacks do not break Studio or My Listings.
3. Confirm reason production MatchHub pool is empty; staging offers are test data.
4. Rotate any exposed owner/database credentials and transfer verified backup to encrypted storage. PITR presently reported disabled.
5. Review public `agent_id` and profile-row exposure issues, plus staging marketing URL pointing to production.
6. Correct misleading “36 live” AI Workforce copy based on verified real capabilities.
7. Reconcile stale architecture docs, staging/prod project identifiers before any database-changing work.
8. Confirm actual deployed commit IDs of staging, Hub production and public `www` separately.

These are **not silently resolved by a UI redesign** and must not be ignored at launch. Urgent credential security can proceed through a separately approved, controlled security workflow.

## 9. Developer-agent coordination

Use ORION (orchestrator), NOVA (visual design), ATLAS (architecture), FORGE (frontend), PIXEL (Playwright QA), SENTINEL (security), CIPHER (backend read-only when needed), SAGE (product/localisation) and SCRIBE (decision log). Use appropriate specialists and **never claim agents ran unless execution evidence exists**. Avoid multiple agents editing same files. No need to activate all eight concurrently for a single task.

## 10. Definition of done

**A page is redesigned only when** its actual route uses the new components; approved screenshots accurately match the rendered browser; all existing workflows still work; relevant accessibility, typecheck, lint/build and browser tests pass; English/Malay/Indonesian are checked; data/permissions are correct; and the stage owner has signed off.

**An asset library, new tokens, standalone storyboard, deployed security migration or one staging screenshot do not count as completing the full redesign.**

## Owner instruction at this moment

Treat this as the **formal design brief** to record in the project. **Proceed immediately with the visual storyboard and scoped implementation plan** (read-only inspection plus isolated mockup assets). **Do not yet implement the new page UI until the owner approves the actual visual storyboard.** After approval, implement the pilot on staging only and report what shipped by URL, commit and screenshot.
