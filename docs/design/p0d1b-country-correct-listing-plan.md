# P0-d-1b: country-correct listing creation (plan for review)

Prepared 11 Nov 2026.

**Status:** approved by the owner on 11 Nov 2026 and built in [PR #17](https://github.com/kamalauction-lgtm/agmatchhub/pull/17) (`86dd883`), stacked on #16.
- `00111` is applied to staging only.
- The staging Hub runs version `70081290…`.
- The staging checks pass 20/20, and the earlier slices still pass.
- CI is green at `86dd883` (68 of 68 test files).

**Correction (11 Nov 2026):** the "This already happens on staging" evidence below was wrong. The four listings it cites are genuinely Indonesian properties held by agents with Malaysian profiles, and production has no mismatch either. The code defect itself was real. See `p0d1b-data-and-copy-followups.md`.

**Where it sits in the approved sequence.** This is the rest of **D8**, which the approved plan assigns to P0-d ("take country, currency and language from the agent's profile and `countries`"). P0-d-1 (#14) fixed only the import commit.

- It does not depend on counsel, so P0-c and P0-d-2 stay on hold.
- It does not touch photos, so the `import_photos` restriction is unchanged.

**Why a scope decision is needed.** The fix is more than replacing literals. The hand-entry wizard is Indonesian throughout: its locations, property types and land titles. Making it work for Malaysian agents adds new Malaysian labels in id, en and ms, including **tenure terms**, which `00075` calls "a legal fact, not a label". The wizard is an agent screen, not one of the 14 admin screens.

## Evidence (rechecked 11 Nov 2026, staging, read-only)

**The wizard is Indonesia-only.** In `apps/hub/src/app/(agent)/listings/`:

- **`actions.ts`** writes these values regardless of the agent's country:
  - `country_code: "ID"` (line 160);
  - `measurement_unit: "sqm"` (175);
  - `currency: "IDR"` (203);
  - `language: "id"` (206).
- **`new/page.tsx:41`** loads locations only where `country_code = 'ID'`, at the `province` and `regency` levels.
- **The vocabulary:** `new/page.tsx:9–14` and `components/listings/listing-wizard.tsx:56` offer only the Indonesian property types (`rumah`…) and land titles (`shm`, `hgb`…). The `actions.ts` zod enum accepts only those.
- **The display:** `listing-wizard.tsx:620,669,788` always formats prices as `IDR … id-ID`.

**This already happens on staging.** 3 hand-entered listings by MY agents are stored as `ID` / `IDR`, plus 1 import committed before the P0-d-1 fix. Because www filters by `properties.country_code`, **a Malaysian agent's hand-entered listing would appear on the Indonesian marketplace, priced in rupiah.** Production has not been checked.

**Two smaller hard-codings:**

- `submit_public_inquiry` stamps `consent_records.country_code = 'ID'` for every inquiry, including Malaysian ones (`00033:335`).
- An organisation's fixed-price policy is always in `IDR` (`A/organisations/actions.ts:79`). `agencies.country_code` exists but is not used.

**What already exists to build on:**

- the Malaysian vocabulary, in `lib/ingest/normalise.ts` `PLATFORM_TYPES` and the `00075` check constraints;
- Malaysian locations on staging: 16 `state`, 117 `district` and 129 `township` rows;
- `countries` defaults: MY uses MYR, `en` and sqft; ID uses IDR, `id` and sqm;
- the `match_location(country)` function;
- the P0-d-1 pattern in `commit-actions.ts:64–77`.

**Missing:** the hub has no labels for any Malaysian property type or tenure in en, id or ms.

## Exact changes

### 1. The new-listing wizard (`/listings/new`, agent screen)

| Step | Today | After |
|---|---|---|
| Type | 15 Indonesian types, always | The type list for **the agent's country**, from one shared `lib/listings/vocabulary.ts` (moved out of `lib/ingest/normalise.ts`, so the wizard and ingest share a single list). An ID agent sees exactly today's list. |
| Location | ID provinces and regencies | The agent's country levels: **ID** province → regency (unchanged); **MY** state → district. Labels come from the level, e.g. "State" or "District". |
| Unit | Sizes saved as `sqm`, labelled m² | The country's `measurement_unit`: MY shows **sq ft**, ID shows m². The number is stored exactly as entered, with that unit. |
| Price | Shown as `IDR … id-ID` | The country's `default_currency`, formatted with the existing `formatMoney` in `lib/entitlements.ts`. |
| Tenure | SHM, HGB… | The tenure list for the agent's country. **MY:** freehold, leasehold, malay_reserve, bumi_lot, strata (the `00075` keys). |
| Review | IDR | The same currency and unit as the steps above |

**Server side:**

- `createListing` resolves the country from the agent's own `profiles.country_code`, never from the form.
- It validates the type and tenure against that country's list, and rejects a location from another country.
- It writes `country_code`, `currency`, `measurement_unit` and `language` from `countries`.
- `province_name` and `regency_name` take the first two levels of the path, as the import commit does.

The **AI price advice** comparables already receive the listing's currency. Only the label changes.

### 2. The listing edit page (`/listings/[id]/edit`)

- **No change.** Country and currency stay as stored.
- I checked the edit page on 11 Nov: it shows no fixed `IDR` or m².

### 3. `submit_public_inquiry` (new migration `00111`)

- The function is `create or replace`, with the same signature and grants.
- `consent_records.country_code` is taken from the inquired listing's `properties.country_code`.
- Nothing else in the function changes.

### 4. Organisations (`/admin/organisations/[id]`)

- A fixed-price policy uses the agency's `country_code` → `countries.default_currency`.
- If the agency has no country, the action refuses with a message, rather than guessing `IDR`.

### 5. Strings

- New `propertyTypes.*` and `ownershipTypes.*` keys for every Malaysian type and tenure, in **en, id and ms**, plus "State", "District" and "sq ft".
- **The Malay and Indonesian tenure wording needs a localisation check.** It follows the format of `docs/design/localisation-review-batch-1.md` and is not legal text.

### Not in this slice

- Correcting the existing mis-tagged rows. On staging those are 3 hand-entered listings plus 1 import. Any correction is a separate, audited migration that the owner approves, as the risk register says.
- A read-only report of affected production rows, which needs owner approval to run.
- www changes. www already renders whatever currency and unit the listing carries.

## Acceptance criteria (staging)

1. **An MY agent** opens `/listings/new` and sees:
   - Malaysian property types and tenures only;
   - MY states and districts only;
   - sizes in sq ft and prices in MYR.

   The saved listing has `country_code = MY`, `currency = MYR`, `measurement_unit = sqft` and `language = en`, and appears in `public_listings` only for MY.
2. **An ID agent** sees and saves exactly what they do today: the same types, locations, IDR, sqm and `id`. This is a regression check field by field against a listing made before the change.
3. **Forged forms are refused.** An MY agent posts an Indonesian type (`rumah`), an ID location id, or a forged currency. Each is refused, and no row is written. These are negative tests.
4. **Inquiries:** an inquiry on an MY listing writes `consent_records.country_code = 'MY'`, and an ID listing still writes `'ID'`. This is an RLS-suite test through the anon role.
5. **Organisations:** a fixed-price policy for an MY agency is stored in MYR. An agency with no country is refused with a message.
6. **Strings:** the i18n parity test passes, and the new Malay and Indonesian labels have had a localisation check.
7. **Regression:** the P0-a, P0-b, P0-d-1, P0-e-1a and P0-e-2a checks and the full staging suite all pass.

## Dependencies

- **Code:** PR #14 for the D8 pattern. It would stack on #16 to keep the migration numbers in order (`00111`). It shares no files with the photo work, apart from the message files.
- **Data:** none. The Malaysian locations are on staging. **Production location coverage is unverified** and would need a read-only check before any production migration.
- **Counsel:** none. This slice does not touch declarations or photos.

## Decision needed

**Approve P0-d-1b as above**, on staging only: the wizard, `00111` for the inquiry country, and the organisation currency.

Two parts of the scope could be changed:

- **(a) Dropping the wizard.** Leaving it out reduces the slice to two small fixes: the inquiry country and the organisation currency. MY agents would still be unable to enter a correct listing by hand.
- **(b) Blocking instead of fixing.** Instead of a Malaysian wizard, an MY agent would be **refused** at `/listings/new` and pointed to import, which is already country-correct. That is a stopgap that needs no new labels.

After this, the next items in the approved sequence are:

- **P0-e-3:** the partner-ingest photo fix (D6) and the gallery editor. D6 needs a decision on the rights basis recorded for partner photos.
- **P1-a:** moderation reason codes, quality score and bulk actions (screen 9), plus the `/admin/media` queue (screen 7).
