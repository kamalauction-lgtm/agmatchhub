# Admin Platform 2.0: readiness report and open decisions

**11 Nov 2026, updated after the merge.**
- `main` holds #10–#38, and its CI is green.
- [PR #36](https://github.com/kamalauction-lgtm/agmatchhub/pull/36), merged as `3d6c67a`, built screens 2, 8 and 14 and the Import Assistant contract.
- Staging runs that commit as version `562c2512`, with DEMO data for MY and ID.
- The staging acceptance checklist is `docs/release/admin-2.0-acceptance-checklist.md`.
- **Status:** merged to `main`; **nothing is in production**. Merge and production deploy are **two separate owner approvals**.
- **Sources:** the 14-screen tracker (`docs/design/admin-platform-2.0-review-and-proposal.md`), the release brief (`docs/release/admin-2.0-release-brief.md`), and the read-only route sweep of all 14 screens on staging (global admin, Malaysia-only country admin and agent).

## 1. The 14 screens

| # | Screen | Status | PRs | Staging evidence |
|---|---|---|---|---|
| 1 | Command Centre | **Ready for acceptance** | #10, #32 | Queue order equals an independent ranking; no cross-country items; nine-workspace nav (8/8) |
| 2 | Agent Acquisition Pipeline | Ready, **except storing real prospects (D-6 retention)** | #36 | Locked until a country has a retention period; country-scoped (RLS 5/5; end to end 17/17); DEMO data 18/18 |
| 3 | Invitation and Onboarding | Ready, **except steps held by counsel** | #13 | Invitations scoped and audited (P0-b tests); route 200 |
| 4 | Agent 360 | **Ready for acceptance** | #31 | Suspend and restore, panels, notifications, queue search (16/16; 5 RLS tests) |
| 5 | Import Workbench | Ready, **except steps held by counsel** | #14, #15 | Admin prepares, agent commits (20/20) |
| 6 | Batch Review | **Ready for acceptance** | #21, #28 | Bulk skip, restore and edit (13/13) |
| 7 | Photo Quality Centre | Ready, **except AI review (provider)** | #15, #16, #19, #20, #21, #23, #24, #26 | Private intake, $0 processor, keep-out, profile photos (multiple checks, all green) |
| 8 | Source Mapping and Sync | Ready, **except re-sync (D-7 legal review)** | #36 | Register, map and terms review; terms need `legal.publish` (RLS 3/3; 17/17) |
| 9 | Moderation | **Ready for acceptance** | #21, #29 | Reason codes, bulk, rights hold (35/35); buyer reports (17/17) |
| 10 | Leads and Requests Ops | **Ready for acceptance** | #12, #29, #30 | Lead response view (9/9, plus 8/8 with synthetic MY and ID leads) |
| 11 | Commercial and Growth | **Ready for acceptance** | #32 (nav), #33 (D14), #34 | Agencies created and edited within country, cross-country refused, MYR shown (9/9; 3 RLS tests) |
| 12 | AI Workforce | Ready, **except provider-dependent items** | #35 | Admin Office view in admin scope; agent Office unchanged; costs "not yet available" (8/8) |
| 13 | Countries and permissions | Ready, **except held location items** | #10, #12, #33 | D14, audit hardening, search scope (9/9; 5 RLS tests) |
| 14 | Handover and notifications | **Ready for acceptance** | #22, #23, #27, #36 | Change requests, Handover, lock (20/20, 11/11); report with batch times, activation and trends (17/17) |

**CI:**
- `checks` and `rls` are green on every Admin PR, #10, #12 to #24 and #26 to #38.
- #25 is a separate PR against `main`. Its `rls` job fails only because shared staging is ahead of `main`. It has no dependency on the Admin release.

**Route sweep:** every built screen loads for the global admin. The Malaysia-only admin is turned away exactly where they lack the capability (commercial, AI, platform, audit, legal), and gets 404 on another country's request. Agents are redirected. No screen errors.

## 2. Why screens 2 and 8 and three items remain

- **#2, Agent Acquisition Pipeline:** blocked by **owner decision 5**, the **retention period for prospect records**. The screen stores people who have not yet agreed to anything (name, contact, source). Without a retention rule, building the `agent_prospects` table would mean holding personal data with no deletion date.
- **#8, Source Mapping and Sync:** **P2**, and needs a **legal review of each portal's terms** before re-syncing listings from external portals. The approved plan puts it after P0 and P1.
- **#12, real model costs and the Import Assistant:** need an **AI provider**. Real costs need the provider's actual per-token prices. The Import Assistant needs a model to run, and no provider is configured on staging or production. Until then, costs show "Not yet available".
- **#14, Handover reporting (P2-b):** **deferred** as P2 in the approved plan, not built. The P1 parts (requests, Handover screen, lock, notifications) are done.
- **#7, AI photo review:** needs an AI provider. The screen states that no AI runs.

## 3. Decisions needed

| # | Decision | Exact choice needed | Unblocks |
|---|---|---|---|
| D-1 | **Counsel P0-c** | Approve the wording of the activation declarations (`admin_assisted_import_authority`, `listing_photo_rights`) and the OTP and passkey activation steps | Screen 3 activation |
| D-2 | **Counsel P0-d-2** | May the admin team commit imports **on the agent's authority**? Yes or no, and under which declaration | Screen 5's last step |
| D-3 | **Photo rights** | Allow `import_photos` for **real** agents (today, internal and test only) | Imported photos for real agents |
| D-4 | **AI provider** | Which provider and models, the monthly budget, and the actual per-1k-token prices | #12 costs and Import Assistant; #7 AI review |
| D-5 | **Locations** | Official MY lists (Sabah and Sarawak districts), the Sarawak option, the township level | Screen 13's location items |
| D-6 | **Retention (decision 5)** | How long prospect records are kept before deletion | Screen 2 |
| D-7 | **Legal: portal terms** | Review which portals' terms allow syncing | Screen 8 (P2) |
| D-8 | **Images cap split** | Staging `MEDIA_TRANSFORM_CAP=500` and production `4000`, so the shared 5,000-per-account quota is never reached unnoticed (changes the approved 4,500 for production) | Photo processing availability |
| D-9 | **Malay localisation review** | Who reviews the Malay phrases | #12 |

**Work that continues without these decisions:** all release preparation and staging checks. Every built screen is already independent of them.

## 4. What still prevents release

1. **Owner approvals:** the merge (#10, #12–#24, #26–#35, in order, with merge commits), then the production deploy, as two separate approvals.
2. **Gate 2, credentials and backup** (release brief §2a):
   - the owner Hub login rotation still needs evidence;
   - the encrypted backup still needs evidence;
   - a **fresh** backup must be taken just before migrating;
   - the restore test needs the owner's decision on where to run it.
3. **One open rehearsal item:** the old wizard submitted through its real browser form against the pre-deploy schema, at the next controlled staging rehearsal. Its database writes are already proven.
4. **Post-deploy only:** the production Images binding, the first real transform, and the account's monthly usage (§2a).

## 5. Package ready for approval

- **Approval 1, merge:** PRs #10, #12–#24 and #26–#35, in the brief's order. #25 is separate.
- **Approval 2, production release:** brief §4.
  1. Baseline.
  2. Pre-built bundle.
  3. `db-migrate --hold=00118,00123`, applying 00103–00117, 00119–00122 and 00124–00127.
  4. Hub deploy.
  5. Marketplace deploy.
  6. Checks.
  7. Apply 00118 and 00123.
  8. Checks.
  9. Rollback per §5 if needed.
