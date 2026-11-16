# Pilot readiness checklist — one page (status at 9 Nov 2026)

Verdict: **NOT READY for Day 1.** Two security gates still need owner evidence; the two
fast-track participants (MY-01, ID-01) are named but not registered or verified. The
remaining three candidates and both reviewers are held for later (section 0). Nothing
here requires a code or production change.

## 0. Owner decision 9 Nov 2026 — practical pilot (fast track)

The five-agent administration is paused. The pilot starts with **MY-01 and ID-01** on
four workflows (listings, leads and follow-ups, MatchHub collaboration, AI Workforce
rule-based tools); MY-02, ID-02, XB-01 and the reviewers are held for later.

Production/staging split, approved:
1. MY-01 practises listings, leads and MatchHub **on staging** with simulated data.
   Production listings by MY-01 require genuine Indonesian property she is authorised
   to market.
2. ID-01 uses genuine, authorised Indonesian listings **on production** after normal
   account approval and security clearance.
3. Production holds only genuine, authorised inquiries, listings and collaboration
   activity. Demonstrations and simulated leads happen on staging.
4. Feedback is three questions: what worked, what failed or blocked, what would make
   the daily job easier. Logged in the private roster; no new documents.
5. No new planning documents, repeated audits or unrequested development.
6. Roadmap order A real AI proof (Luna/Mira, staging, provider approval) · B manual and
   external lead intake · C Malaysian areas and MYR. Each needs separate approval.
7. Owner login rotation and encrypted backup stay mandatory; neither is PASS without
   evidence; no production pilot activity until both pass and participant access exists.

## 1. Security gate

| Item | Evidence held | Status |
|---|---|---|
| Production DB password rotated | Owner statement **and** assistant's read-only `status:production` check passed after the rotation (102 applied, 0 pending) | **PASS** (closed 9 Nov 2026) |
| Owner login password rotated | Owner statement only | **Needs evidence**: a password-manager entry dated today for the hub login, and one successful sign-in with the new password |
| Backup in encrypted storage | Owner statement only | **Needs evidence**: encrypted volume/drive name and path, file count 105 and 9,189 rows confirmed in the copy, plaintext copy deleted, passphrase custody recorded |
| Restore test on staging | Not done | **Needs doing** before relying on the backup (not a Day-1 blocker, but a week-1 task) |

Evidence closure attempt 9 Nov 2026: the owner's form arrived with rows 2 and 3 as
unfilled placeholders, so they remain NOT READY; roster and reviewer preparation may
proceed in parallel. Second directive later the same day (roster) carried no new
evidence for rows 2 and 3; status unchanged. The assistant does not access, print or store any credential; "evidence" means the
owner confirms where each record lives (password manager entry names, volume path), not
the values.

## 2. Five-agent roster

Composition: 2 Malaysia agents · 2 Indonesia agents · 1 active cross-border/collaboration agent.
Status 9 Nov 2026 (second roster update): **candidates named 5/5 · accounts verified 0/5.**

| Slot | Candidate | Registered | E-mail verified | Admin approved | `profiles.id` in private roster | Permissions | First login |
|---|---|---|---|---|---|---|---|
| MY-01 | Named (private roster) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Blank | NOT VERIFIED | NOT VERIFIED |
| MY-02 | Named (private roster) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Blank | NOT VERIFIED | NOT VERIFIED |
| ID-01 | Named (private roster) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Blank | NOT VERIFIED | NOT VERIFIED |
| ID-02 | Named (private roster) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Blank | NOT VERIFIED | NOT VERIFIED |
| XB-01 | Named (private roster); country not yet verified | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Blank | NOT VERIFIED | NOT VERIFIED |

Each candidate has a separate verification, onboarding, daily-activity and blocker
record in the private roster. Pilot supervisor is the owner, a distinct role from the
five agents and from the reviewers. Rules: MY-01 and MY-02 are told before Day 2 that
pilot listings are Indonesian property priced in IDR (MY areas/MYR stay post-pilot
backlog); ID-01 and ID-02 use the existing Indonesia/IDR workflow; XB-01 uses existing
authorised collaboration workflows only, with no assumed country eligibility or extra
permissions. Every candidate is told AI assistance is rule-based during the pilot.

Roster: `C:\Users\User\propertiguru-backups\pilot-roster-TEMPLATE.md` (local only, never
committed; names, e-mails and ids live only there). No agent, e-mail or id is invented;
verification columns are filled only from the admin console.

## 3. Two language reviewers

Status 9 Nov 2026: **reviewers nominated 2/2 · acceptance NOT VERIFIED.** Names are in
the private roster. The BM nominee is also the project owner; owner, reviewer and agent
roles stay distinct and the owner is not one of the five agents.

| Reviewer | Nominated | Accepted | Materials ready |
|---|---|---|---|
| Bahasa Melayu native | Yes (9 Nov) | NOT VERIFIED | `docs/design/localisation-review-batch-1.md` (73 strings + dashboard tile) |
| Bahasa Indonesia native | Yes (9 Nov) | NOT VERIFIED | same |

## 4. Onboarding readiness

| Item | Status |
|---|---|
| Checklist | Ready: `docs/release/pilot-onboarding-checklist.md` |
| Scorecard queries | Ready, read-only, roster-scoped, limitations documented: `docs/release/pilot-scorecard-queries.sql` |
| Daily summary template | Ready: `docs/release/pilot-daily-summary-template.md` |
| Production state | Hub `a151e61d`, marketplace `12825369`, main `3fc2fb0`; frozen |
| AI representation | All assistants rule-based; no provider key; agents are told so |
| Pairing plan for a real pickup | Decide which two agents offer and pick up each other's listing on Day 2 |
| Staging rehearsal | Done 9 Nov (MY A account): sign-in, profile, listing wizard, Luna draft, Astra brief, pool pickup, BM switch all PASS — `pilot-rehearsal-2026-11-09.md` |
| Malaysia listings | Decided: MY agents list Indonesian property in IDR during the pilot; MY areas/MYR are post-pilot backlog |

## 5. Day-1 launch criteria (all must be true)

1. Security gate rows 1–3 evidenced (row 4 scheduled).
2. Five real agents verified and admin-approved; roster filled with real ids.
3. Two reviewers named and sent the review table.
4. Check-in channel exists; daily summary owner named.
5. Owner has read the critical-blocker definition and agrees only those interrupt the pilot.

## 6. Outstanding owner actions

- Provide evidence pointers for login rotation and encrypted backup (section 1).
- Invite all five candidates (owner sends the invitations; the assistant sends none);
  each registers at `/register`, verifies e-mail, completes `/verification`; owner
  approves in `/admin/agents`, confirms permissions, and copies each `profiles.id` into
  the private roster after first login.
- Confirm XB-01's country from the verified profile before assigning listing steps.
- Obtain both reviewers' acceptance and record the date in the private roster.
- Set the check-in channel and who writes the daily summary.
- Schedule the staging restore test during week 1.

Assistant stands by. It will run the read-only status check on request, triage critical
blockers, and run the Day-7 scorecard only on approval.
