# Pilot onboarding checklist — five real agents (week of 10 Nov 2026)

Existing functionality only. Production is frozen except for approved critical fixes.
AI in production is rule-based (no provider key); tell agents so.

## Before day 1 (owner)

- [ ] Security evidence recorded in the decision log: DB password rotated, owner login
      rotated, backup in encrypted storage, restore tested on staging; read-only
      production status check PASS (assistant runs it on request).
- [x] Five agent candidates named (9 Nov 2026): MY-01, MY-02, ID-01, ID-02, XB-01.
      Names and details live only in the private roster outside the repository.
- [ ] Five agent accounts verified through the normal workflow: **0/5** as of 9 Nov 2026.
- [x] Two native reviewers nominated (BM, ID) on 9 Nov 2026 — **acceptance NOT VERIFIED**.
      The BM nominee is also the pilot supervisor; owner, reviewer and agent roles stay distinct.
- [ ] A WhatsApp group or similar for the daily 10-minute check-in.

## Day 1 — accounts (owner + admin console)

For each agent (MY-01, MY-02, ID-01, ID-02, XB-01), in this order, owner-driven; the
assistant creates no accounts, sends no invitations and approves nobody:
- [ ] Sign up at `https://hub.propertiguru.id/register` with their own e-mail and a
      password they choose (never shared in chat).
- [ ] Verify the e-mail.
- [ ] Complete verification on `/verification` (documents as the form asks).
- [ ] Admin approves under `/admin/agents`; confirm country (XB-01's is unknown until
      then) and that the only role is agent.
- [ ] Agent signs in; dashboard loads; sidebar shows their name and "Verified".
- [ ] Record the agent's `profiles.id` in the private pilot roster (ids only, for the
      scorecard). Pilot rules told before Day 2: MY agents list Indonesian property in
      IDR; all agents hear that AI assistance is rule-based during the pilot.

## Day 2 — 60-minute onboarding (screen share)

Each agent, live:
- [ ] Profile: photo, agency, city, WhatsApp number (`/profile`).
- [ ] Listings: create one by hand (`/listings/new`, try Luna "Help me write it" — rule-based);
      import two more if they have a spreadsheet (`/listings/import`); submit for review.
      **Malaysia agents list Indonesian property in IDR** (owner decision 9 Nov; areas and
      prices are Indonesia-only for the pilot) — say so before they start.
- [ ] Moderator online: owner/admin approves each submitted listing in `/admin` during the
      session, otherwise it stays "In review".
- [ ] Dashboard: read Astra's ranked list; understand "Rule-based" label.
- [ ] Leads: open `/leads`. A fresh account has none — owner submits one inquiry from the
      marketplace on the agent's approved listing first; then explain Zayn's score and
      Mira's draft; show wa.me send.
- [ ] Language: agents click EN/BM/ID in the header once (the UI does not follow the profile).
- [ ] Tasks: accept one Kael proposal from the brief.
- [ ] Pool: open `/collab/pool`; offer one own listing; pick up another agent's offer
      (pair agents so at least one real pickup happens).
- [ ] MatchHub: post one requirement or submit to a colleague's requirement.
- [ ] Language: switch to BM or ID if preferred; note anything odd for the reviewers.

## Days 2–6 — daily, 10 minutes per agent

Ask three questions and log the answers:
1. What did you do in the platform today? (listings, leads, tasks, pool, MatchHub)
2. What blocked you or made you leave the platform?
3. Was any assistant's suggestion wrong or useless?

Classify each blocker: **critical** (see plan) or **backlog**. Criticals go to the
assistant the same day with a reproduction: route, what was clicked, what happened.

## Day 3 — native review (reviewers)

Screens: login, dashboard, listings, leads, pool, requirements, submissions, AI
Workforce cards. Table: `docs/design/localisation-review-batch-1.md` plus the dashboard
AI tile. Mark each string: fine / awkward / wrong, with the preferred wording. Sign off.

## Day 7 — read-out (owner + assistant)

- [ ] Assistant runs `pilot-scorecard-queries.sql` read-only against production with
      the roster ids, on approval; reports counts only.
- [ ] Owner decides: expand to 20–25 / hold at 5 / fix first, per the plan's rule.
