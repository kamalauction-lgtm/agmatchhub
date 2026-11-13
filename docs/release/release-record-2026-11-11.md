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
