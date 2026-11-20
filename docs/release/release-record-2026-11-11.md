# Release record: Admin Platform 2.0 to production, 11 Nov 2026

**Approved by the owner in chat ("release to production"), 11 Nov 2026. Released between 14:23 and 14:35 UTC.**

## Gates at release

| Gate | Evidence |
|---|---|
| G1 Owner approval | Given in chat on 11 Nov. |
| G2 DB password rotated | PASS (9 Nov). |
| G3 Owner Hub login password rotated | Owner statement: changed on 11 Nov. |
| G4 Plaintext export removed | The 9 Nov plaintext export (105 files) was deleted permanently on 11 Nov. No other copy was found in the user folder or OneDrive. |
| G5 Fresh encrypted backup | `full-jokyyhvtahiypuzmfydp-2026-11-11T14-11-47-338Z.pgbk`, 1.84 MB, sha256 `0834bc89…f4bd1b21`. It holds 134 tables, 9,628 rows, 11 accounts and 15 files. **`verify-restore`: PASS**: 286 foreign keys with 0 broken, 15 of 15 files matched, RLS on every table after rolling forward to 00127, and anonymous access refused on leads. |
| G6 `CRON_SECRET` | Set on 11 Nov (Worker `5ebd2fb1`), before the release. |

## What changed

| Step (UTC) | Result |
|---|---|
| 14:23:50 to 14:24:02 | `db-migrate --hold=00118,00123` applied 23 migrations: 00103–00117, 00119–00122 and 00124–00127. |
| 14:24:11 to 14:24:56 | Hub deployed from `main` `ea3b023` as Worker **`58424661-cefc-4ade-8744-2397b87e82df`**, with the `IMAGES` binding. The build target was verified as `jokyyhvtahiypuzmfydp`. The old Hub ran on the new schema for about 1 minute. |
| 14:25 to 14:27 | Marketplace (ID) deployed as **`9e88defd-fc47-4c33-b357-367dc76e6fcb`**, build target verified. The MY marketplace (`propertiguru-www-my`, `486ec94a`) was **not** redeployed. |
| 14:27:51 | `countries.settings.prospect_retention_days = 90` for MY and ID. Owner decision D-6, for now. Audited as `country.prospect_retention_set`. |
| after owner check | 00118 and 00123 applied. Production is at **00127**: 127 applied, 0 pending. |

## Checks

- **Hub:** login 200; no staging label. The owner signed in and confirmed that Admin 2.0 shows.
- **Marketplace:** `/` and `/en` return 200. A live listing page returns 200 and shows "Laporkan listing ini". `submit_public_inquiry` (9 arguments) and `submit_listing_report` (5 arguments) exist, and anon may execute both.
- **Cron:**
  - `photo_processing` runs: claimed 0, cap 4,500;
  - `prospect_retention` runs: deleted 0;
  - without the secret, the endpoint returns 401.
- **After 00118 and 00123:**
  - the profile-media owner policies are gone (0), and `trg_profiles_avatar_guard` exists;
  - `log_audit` is not executable by anon or authenticated, and `log_audit_as` by `service_role` only;
  - the three gallery functions are SECURITY DEFINER.
- **Photo scan:** the listing bucket is empty. The profile bucket holds 2 WebP files, with no EXIF, GPS or XMP.
- **Not yet verified** (needs an admin action or upload on production):
  - a Hub audit row carrying a real `actor_id` through `log_audit_as`;
  - a new profile-photo upload: 512 px WebP, one file per folder, audited, and Images usage incremented.

## Rollback targets (pre-release)

- Hub: `5ebd2fb1-cde6-45e3-ad8b-50e1a8e6154f`.
- Marketplace: `86a4c983-149f-4658-935a-7990872b2489`.
- After 00118: revert it first, using `p1b4-profile-photos-release.md`.

## Still off, pending owner decisions

- D-1: agent activation declarations (counsel).
- D-2: the admin committing imports for the agent.
- D-3: `import_photos` for real agents.
- D-4: AI provider.
- D-5: locations.
- D-7: portal re-sync.
- D-8: the Images cap split (production stays at 4,500).
- D-9: Malay reviewer.

## Follow-up release, 12 Nov 2026: super admin registers a person directly

**Approved by the owner in chat ("Yes, release it"), 12 Nov 2026.**

- **Code:** PR #44, merged as `05c02e0`. Hub only; no migration (production stays at 00127).
- **Hub:** deployed as **`0e4ad37f-5068-47cf-acd4-ad073ba2a73a`**, with the `IMAGES` binding; build target verified as `jokyyhvtahiypuzmfydp`. **Rollback target: `58424661`.**
- **Staging before release:** 23/23 end-to-end checks on hub-staging (`a583c7b0`), covering:
  - registration, the role grant, audit with the real actor and the activation email;
  - no sign-in before activation; re-send; the link not spent on open; expiry and reuse;
  - choosing a password; access scope; active accounts untouched; a country admin refused.
- **Production smoke:** `/login` 200; `/activate` shows the Continue button; `/admin/users` without a session redirects to login.
- **Not yet verified on production:**
  - an email delivered to a real inbox, and how it looks;
  - how long the activation link stays valid.

## Follow-up release, 13 Nov 2026: country at signup; licence types per country

**Approved by the owner in chat ("Yes, release it"), 13 Nov 2026.**

- **Code:** PR #46, merged as `48fe50a`. CI (checks and the full RLS suite on staging) passed.
- **Migration:** `00128_signup_country_licence.sql` applied to production at 01:07 UTC, after staging. Production is at **00128** (128 applied).
- **Hub:** deployed as **`145de9f6-cbdd-4355-9b5d-75132ef9f434`**; build target verified as `jokyyhvtahiypuzmfydp`. **Rollback target: `0e4ad37f`.** To roll back the migration, restore `handle_new_user` from 00001 and drop `trg_profiles_country_guard` and `guard_profile_country()`.
- **Production checks:**
  - login 200;
  - `/register` offered AE, ID and MY at release. The UAE was switched off afterwards on the owner's decision (audited as `country.updated`), so it now offers **ID and MY**;
  - `licence_fields` are MY REN/REA/PEA and ID AGEN_PROPERTI/BROKER;
  - the guard trigger is present and `handle_new_user` reads the signup country;
  - the backfill filled 3 profiles: profiles without a country went from 11 to 8 of 12.
- **Staging before release:**
  - RLS test `signup-country` 5/5, including the negative test: an agent cannot move or clear their country;
  - end to end 8/8.
- **Not yet verified:**
  - a real signup through the form, end to end (staging's auth email rate limit refused the confirmation email during testing);
  - the 8 profiles still without a country choose one on Verification.

## Follow-up release, 13 Nov 2026: instant access for new agents; voluntary Verified badge; approval switch; ban

**Approved by the owner in chat ("Yes, release it"), 13 Nov 2026.**

- **Code:** PR #47, merged as `d0bbdc6`.
  - The first CI run passed all 832 tests, but its cleanup check failed: the new test left 2 rows behind. Fixed in `a396559`; the re-run was green.
- **Migration:** `00129_agent_instant_access.sql` applied to production at 02:28 UTC, after staging. Production is at **00129** (129 applied).
- **Hub:** deployed as **`a34f4a28-aa24-491f-97ea-9cc93883af37`**; build target verified as `jokyyhvtahiypuzmfydp`. **Rollback target: `145de9f6`.** To roll back the migration, recreate the previous policies, views and functions named in the 00129 header.
- **Production checks:**
  - login and register return 200;
  - `agent_approval_required` is **off**;
  - all 12 profiles have `access_granted_at` and access; 5 hold the Verified badge;
  - both guard triggers are present;
  - anon cannot execute `agent_has_access` or `admin_ban_agent`;
  - `public_agent_profiles` now returns 12 profiles (it returned the 5 verified before). The marketplace reads it by slug only (`getAgentBySlug`), so there is no new directory listing.
- **Staging before release:**
  - RLS `agent-instant-access` 7/7, including the negative tests;
  - related suites 43/43;
  - Hub end to end 12/12.
- **Not yet verified on production:**
  - a real new agent working straight away;
  - a ban in use.

## Follow-up release, 16 Nov 2026: agency directory; AG Hero card only for partner agencies

**Approved by the owner in chat ("Yes, release it"; partners "Both IQI ID and MY"), 16 Nov 2026.**

- **Code:** PR #48, merged as `beca05e`. CI (checks and the full RLS suite) passed.
- **Migration:** `00130_agency_directory_hero_partner.sql` applied to production at 17:04 UTC, after staging. Production is at **00130** (130 applied).
- **Hub:** deployed as **`46d4f3ff-b950-4441-8c18-ce6d9cb38b7c`**; build target verified as `jokyyhvtahiypuzmfydp`. **Rollback target: `a34f4a28`.** To roll back the migration, drop the three functions and the three agency columns.
- **Data, after release** (one transaction; each change audited as `agency.hero_partner_set`, `agency.created` or `agent.agency_set`):
  - IQI Indonesia (ID) confirmed and made an AG Hero partner;
  - IQI Malaysia (MY) created as a confirmed partner;
  - the 2 Malaysian profiles with "IQI Realty Sdn Bhd" (Test Agent One and Supply Sally, both test accounts) linked to it.
- **Production checks:**
  - login 200; `/profile` without a session redirects to login;
  - all 4 agents linked to the two IQI agencies pass `agency_is_hero_partner`;
  - anon cannot execute the three new functions.
- **Staging before release:** RLS `agency-directory` 6/6, including the negative tests; Hub end to end 12/12.
- **Noted, not changed:** Budi Santoso's profile country is MY, but the profile is linked to IQI Indonesia (agency text "IQI Bandung"). An admin should confirm which is right.
- **Not yet verified on production:** an agent adding their own company through the profile page.

## Follow-up releases, 17 Nov 2026

**Signup confirmation** (owner: "fix the link expiry and add resend button"; "Yes, release it")
- **Supabase Auth setting:** Email OTP expiration changed from 3600 to **86400 s** on staging and production, in the dashboard (production re-read after saving). Supabase shows an advisory recommending under an hour.
- **PR #52** merged as `d2a166e`. Hub deployed as **`c6deb779`** (rollback `867ee226`).
  - Sign-in on an unconfirmed account says "confirm your email" and offers a resend form.
  - "Didn't get the confirmation email?" appears under the login form and on `/verify-email`.
  - Verified on production: the form shows on the login page and on `/verify-email`.
- **One account fixed by hand:** the owner's test signup ("Nury") was confirmed by an admin, audited as `user.email_confirmed_by_admin`.

**Agent certificates** (owner: Indonesian government requirement; "Yes, release it")
- **PR #53** merged as `48956ff`. CI (checks and the full RLS suite) passed.
- **Migration:** `00131_agent_certificates.sql` applied to production at 14:44 UTC, after staging. Production is at **00131**.
- **Deploys:**
  - Hub **`addccbdf`** (rollback `c6deb779`);
  - ID marketplace **`d0af661e`** (rollback `9e88defd`);
  - MY marketplace not redeployed (Malaysia offers no certificate yet).
- **Production checks:**
  - `public_agent_profiles` has the new columns (16 profiles, 0 certified);
  - ID `certificate_types` is `[SERTIFIKAT_KOMPETENSI]`;
  - the bucket `agent-certificates-private` is private;
  - anon cannot execute the submit and review functions, and authenticated cannot run the reminder;
  - the `certificate_expiry` cron runs (0 reminded);
  - the hub card, the www agent page, www `/` and `/en`, and Hub login all return 200.
- **Staging before release:** RLS `agent-certificates` 6/6, including the negative tests; Hub end to end 15/15.
- **Not yet verified on production:** a real certificate submitted and approved.

## Encrypted backup, 19 Nov 2026

- **File:** `full-jokyyhvtahiypuzmfydp-2026-11-19T01-58-47-332Z.pgbk`, 2.0 MB, sha256 `37acda142d22515a…`. It is in the owner's encrypted backups folder, made with a new passphrase that the owner holds.
- **Encryption:** the file has the PGBK1 header, and a search found no readable SQL or email addresses inside. No unencrypted files were left behind.
- **`verify-restore`: PASS.**
  - Decryption: AES-256-GCM, authentication tag verified.
  - Backup content: 143 tables, 9,800 rows, 16 accounts and 18 files.
  - Schema: at 00131, with 0 migrations missing from the repo.
  - Integrity: 290 foreign keys with 0 broken; 18 of 18 files matched (size and sha256).
  - Security: RLS is on all 137 public tables (310 policies); anonymous users see the 30 public listings and are refused on leads.
- **Note:** a passphrase was typed at the shell prompt by mistake and pasted into chat before this backup. It was never used to encrypt this file, and the owner removed it from the PowerShell history.
- **Old backup removed:** the 11 Nov backup (`…2026-11-11T14-11-47-338Z.pgbk`) was encrypted with the passphrase later exposed in chat. The owner approved its deletion, and it was deleted permanently on 19 Nov after the new backup passed. No other copy was found under the user folder. The 19 Nov backup is now the only production backup.

## Follow-up release, 19 Nov 2026: admin-led agent onboarding, publish on behalf (D-2 lifted), Help playbook

**Approved by the owner in chat ("Yes, release all three"), 19 Nov 2026.**

- **Code:** PRs #56, #57 and #58, merged as a stack into main as `29f103a`. CI passed on each PR and again on the combined code before it entered main.
- **Migrations** (after staging), applied to production at 04:51 UTC. Production is at **00133**.
  - `00132_admin_onboard_agent.sql`: `must_change_password`, `agent_onboarding_consents`, `agent_allows`.
  - `00133_admin_publish_on_behalf.sql`:
    - on-behalf commit (lifts **D-2**);
    - the same admin may approve on-behalf listings while the consent stands;
    - **fix:** `guard_listing_comarketing_notice` is now SECURITY DEFINER. Before this, agents could not change the status or price of any live listing (they got "permission denied for function notify_comarketing_agents").
- **Hub:** deployed as **`b06b6009`**; build target verified as `jokyyhvtahiypuzmfydp`. **Rollback target: `addccbdf`.** To roll back the migrations, use the rollback notes in each file header.
- **Production checks:**
  - login 200;
  - `/help`, `/admin/help` and `/admin/agents/onboard` exist and require sign-in;
  - the notice trigger is SECURITY DEFINER;
  - both guard triggers are present;
  - anon cannot execute `admin_import_batch_commit_authorise` or `agent_allows`;
  - 0 consents recorded so far.
- **Staging before release:**
  - onboarding end to end 18/18;
  - publish on behalf end to end 10/10;
  - RLS: `admin-onboard-agent` 4/4, `publish-on-behalf` 5/5, related suites 44/44;
  - Help 8/8.
- **Declined:** watermark removal on imported portal photos, for copyright reasons. Agents supply original photos.
- **Not yet verified on production:** a real admin-opened account (email delivery, first-login password change), and a real on-behalf publish.

## Follow-up release, 19 Nov 2026 (evening): picture walkthroughs for Help

- **What:** PR #60 (merge `36268de`). Every Help guide is now an interactive walkthrough:
  - a screenshot of the real screen with the thing to press highlighted;
  - Back / Next and arrow keys, a progress bar, tick-off saved per device, and a step list;
  - an English / Indonesia switch.
  - Links both ways: "Open this screen" from a guide, and "? Guide" on 14 key admin and agent screens (`?step=N`).
- **Database:** no changes (schema stays at 00133).
- **Hub:** production `5e0d0fa4` (rollback `b06b6009`); staging `1e3023f4`.
- **Screenshots:**
  - 55 × 2 languages (4.3 MB), captured on staging only (demo data) by `apps/hub/scripts/capture-help-shots.mjs`;
  - emails and phone numbers masked;
  - staff names on the staging access list blurred.
- **Checks on staging:** 31/32 browser checks as admin and agent. The one failure was test timing on the language switch, re-checked by hand. Typecheck, lint and i18n parity pass. CI: checks and rls green.
- **Checks on production:** pictures are served (`image/webp`, 200); `/help`, `/admin/help` and deep links redirect to sign-in, so the routes exist.
- **Not yet verified on production:** walking a guide while signed in (no production test account is used, by design).

## Follow-up release, 20 Nov 2026: larger sidebar, phone menu, wider pages, fuller Content studio

- **What:** PR #62 (merge `8f128a9`). The shell shared by agents and admins was rebuilt:
  - sidebar 288px wide with 44px rows, 15px labels and outline icons; it folds to an icon strip, groups fold, and both are remembered per device;
  - admins get a "Find a page" box over their 30 destinations; only one item is ever marked current;
  - phones and tablets get a Menu drawer with every page, and the agent bottom tabs mark the current page;
  - pages are wider (agents 1024px / 1400px, admins up to 1600px) and double padding was removed from 8 admin pages;
  - Content studio has real buttons, four stat tiles from live counts, and a three-step empty state with a sample post;
  - stat cards use icons instead of emoji.
- **Database:** no changes (schema stays at 00133).
- **Hub:** production `d084778a` (rollback `5e0d0fa4`); staging `dbd4c8b9`.
- **Help:** all 110 walkthrough pictures re-taken on staging with the new menu; a note about the menu added to the admin and agent daily guides (EN and ID).
- **Checks on staging:** 35/35 targeted browser checks as admin and agent; a sweep of 50 pages at 3 screen sizes found no load or console errors (the sideways-scroll and header findings it raised were fixed, and the full sweep was not repeated afterwards). An independent design review raised 15 points, all addressed. Typecheck and lint pass. CI: checks and rls green on the branch after it was brought up to date with main.
- **Checks on production:** signed in through the owner's browser session, read-only: `/studio` and `/admin` show the 288px sidebar, 44px rows, one current item, the stat tiles and empty state, the admin find box with 30 items, and no sideways scroll at 1920px.
- **Not checked:** dark mode, Malay, the country-admin role, and phone widths on production.
- **Known follow-ups:** `/wanted` shows the public layout to signed-in agents; two document-type labels are missing under Legal content; the name-card avatar sits behind its banner; some forms stretch on very large monitors; small links on the sign-in page are under 24px tall.
