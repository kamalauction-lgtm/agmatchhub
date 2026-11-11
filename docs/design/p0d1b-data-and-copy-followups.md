# P0-d-1b follow-ups: data findings, proposed corrections and copy localisation

Prepared 11 Nov 2026. These are **read-only findings**:

- No row was changed in production or staging.
- The production queries ran in a session set to `default_transaction_read_only = on`. The runner aborts unless the database confirms that setting.

**Corrections:** every change proposed below needs **separate owner approval**, and none is applied. Production migrations stay behind their own approval.

## 1. CI on PR #17

The latest head is `86dd883`, which is also the remote branch tip.

| Check | Result |
|---|---|
| `checks` (typecheck, lint, build, unit tests) | **SUCCESS** |
| `rls` (the full suite against staging) | **SUCCESS: 68 of 68 test files passed** |

No regression, so the branch needed no fix.

## 2. Production: listing markets (project `jokyyhvtahiypuzmfydp`)

**What production holds:**

- **30 listings on 45 properties.** The other 15 properties have no listing, and all of them are `ID`.
- **All 30 listings:**
  - property `ID`, `IDR`, `sqm`, language `id`;
  - `creation_source = import`, status `published`;
  - **one agent**, whose profile has **no country** (`country_code` is NULL);
  - all created on 22 Aug 2026, in one import.
- **Locations of the 30:**
  - 24 have an Indonesian location: Jawa Barat 14, Jawa Timur 6, DKI Jakarta 2, Jawa Tengah 1 and Banten 1;
  - **6 have no location at all.**
- **No production listing:**
  - belongs to a Malaysian agent;
  - carries an `MY` country;
  - has a Malaysian location;
  - uses another market's vocabulary.
- The only Malaysian profile in production is in `draft` status and owns nothing.
- Production migrations stop at `00102`, so none of `00103`–`00111` is applied.

**Classification:**

| Class | Count | Records | Evidence |
|---|---|---|---|
| **Confirmed market mismatch** | **0** | — | — |
| **Ambiguous market** | **0** | — | — |
| **Consistent with ID, but no location** (a data-quality gap, not a market error) | 6 | LST-2026-000107, -000108, -000109, -000112, -000119 and -000120 (PRP-2026-000137, -138, -139, -142, -150 and -151) | <ul><li>Same import and same date as the 24 that have Indonesian locations.</li><li>Indonesian titles ("Apartemen 2BR – Vasanta Innopark", "Apartemen – Green Park View").</li><li>`id` language, `IDR`, and prices of 250–800 million, which fit rupiah.</li></ul> |

**Conclusion:** production has **no market mismatch to correct**.

The 6 listings with no location are a separate gap. Each needs a location chosen from a real address, which is a content task. It should not be inferred from the title.

## 3. Production: Malaysian locations for the form

**What exists:**

- **Counts:** 16 states and territories, **117 districts** and 129 townships.
- **Matches staging exactly**, compared state by state.
- **Every district is active** and has the two-level path (`[state, district]`) that the form needs.
- **`match_location(p_country, p_text)`** exists.

| State | Districts seeded | Gap |
|---|---|---|
| Johor 10, Kedah 12, Kelantan 10, Melaka 3, Negeri Sembilan 7, Pahang 11, Perak 12, Perlis 1, Pulau Pinang 5, Selangor 9, Terengganu 8 | 88 | None apparent |
| Kuala Lumpur, Labuan, Putrajaya | 1 each | The form offers a single entry for each. The townships are seeded but the form does not offer them (see "Gaps" below). |
| **Sabah** | **14** | **Incomplete.** Sabah has more districts than this (about 27, which should be checked against the official list). Missing include, for example, Kota Belud, Kota Marudu, Tenom, Tambunan, Sipitang, Beluran and Kunak. |
| **Sarawak** | **12** | **Wrong level.** The 12 rows are Sarawak's **divisions** (Kuching, Miri, Sibu and the others), not its districts. That is usable for a first listing, but an agent can't pick, for example, Bau or Lundu. |

**Gaps that affect the form:**

1. **Sabah** is incomplete.
2. **Sarawak** is seeded at division level.
3. **Townships are not offered.** The form's second level is the district, so an agent in Kuala Lumpur picks "Kuala Lumpur › Kuala Lumpur" and types the area, such as Mont Kiara, as free text. The 129 townships exist, but the form doesn't list them.

**Proposed fix (not built):**

- An additive data migration that seeds the missing Sabah and Sarawak districts from the official administrative lists, with Sarawak's districts nested under their divisions.
- Optionally, a third form level offering townships for Malaysia.

Both need your approval, and the source list should be cited in the migration.

## 4. Staging: the "four mis-tagged records", re-examined

**I was wrong earlier.** On 11 Nov I called these four records mis-tagged because their agents' profiles say `MY`. That is exactly the inference you warned against, and the evidence contradicts it:

| Record | Created, source | Agent | Location | Copy, price, vocabulary | Verdict |
|---|---|---|---|---|---|
| LST-2026-800019 / PRP-2026-800019 | 21 Oct; `manual`, from the demo seed `seed-staging-demo.mjs` item 19 (owner "MYA") | the rehearsal account `pilot-my-a` (MY), whose account was created on 9 Nov, after the listing | Jakarta Selatan (an ID regency) | "Townhouse 3 lantai Tebet…", IDR 3.3 billion, SHM | **Correctly ID.** The seed deliberately gives a Malaysian cross-border agent an Indonesian property. **Its type `townhouse` is a Malaysian key** on an Indonesian property (see 5). |
| LST-2026-800020 / PRP-2026-800020 | 20 Oct; `manual`, demo seed item 20 (owner "MYA") | the same rehearsal account | Jakarta Pusat | "Apartemen 3BR Thamrin…", IDR 32 million a month, `apartemen` and `strata` | **Correctly ID.** No change. It has 3 leads attached. |
| LST-2026-000100 / PRP-2026-000100 | 9 Nov; `manual`, through the old Indonesia-only form (a browser walkthrough of that date, in `.playwright-mcp/`) | the same rehearsal account | Jakarta Selatan | "Dijual Condominium 2KT di Kawasan Kemang…", IDR 1.85 billion, `kondominium` | **Consistent with ID.** The old form offered only Indonesian locations, but the title independently names Kemang in Jakarta. No market change. |
| LST-2026-000153 / PRP-2026-000153 | 10 Nov; `import`, from a **rumah123.com** page (an Indonesian portal), agent self-import | a staging agent account with `MY` on the profile | Depok, Jawa Barat | "2 LT Cash KPR Tanpa DP…", IDR 600 million, `rumah` | **Correctly ID.** The source page, location and price are all Indonesian. |

**Classification:**

| Class | Count |
|---|---|
| Confirmed market mismatches on staging | **0** |
| Ambiguous | 0 |
| No change to country, currency, unit or language is justified | all four |

The real fault, now fixed in #17, was that an agent's own **Malaysian** listing could not be entered correctly. None of these four is such a listing.

## 5. A different defect found: market vocabulary on the wrong market (staging only)

**Status, 11 Nov 2026:** the owner approved the four corrections and the seed fix, and both are applied.
- **Staging data:** PRP-2026-800009 → `rumah`, PRP-2026-800015 → `kantor`, PRP-2026-800019 → `rumah` and PRP-2026-000236 → `terrace`.
  - They ran in one transaction, with a guard on each row checking the old value.
  - There is one `property.vocabulary_corrected` audit row per change.
  - A second run is refused and rolls back.
  - A re-scan finds only PRP-2026-800016 left, which is held for your decision.
- **Seed fix:** items 9, 15 and 19 in `seed-staging-demo.mjs` are fixed in PR #17 (`cb8d4df`).
- **Rollback:** `npm run correct:vocabulary:staging -w @pg/db -- --revert`, from `packages/db/scripts/correct-listing-vocabulary.mjs` (kept in PR #17, `ae58f4b`), with the same guards.

The database accepts both vocabularies on any property (`00075`). The P0-d-1b form now prevents mixing them. Before that, five staging records mixed them. **Production has none.**

| Property / listing | Status | Stored | Proposed | Why | Dependants |
|---|---|---|---|---|---|
| PRP-2026-800009 / LST-2026-800009 | draft | ID, `cluster_home` | `property_type = 'rumah'` | `cluster_home` is a Malaysian key. Indonesian ingest already maps a cluster house to `rumah` (`lib/ingest/normalise.ts`). | 1 photo, 0 leads |
| PRP-2026-800015 / LST-2026-800015 | paused | ID, `office_space` | `property_type = 'kantor'` | The Malaysian `office_space` corresponds to the Indonesian `kantor`, the same mapping ingest uses. | 1 photo, 0 leads; not public |
| PRP-2026-800019 / LST-2026-800019 | pending_review | ID, `townhouse` | `property_type = 'rumah'` | The Indonesian ingest maps `townhouse` → `rumah`. | 1 photo, 0 leads |
| PRP-2026-800016 / LST-2026-800016 | **published** | ID villa, `ownership_type = 'leasehold_other'` | **No change proposed; owner decision needed** | A Bali "leasehold 25 tahun" is a real arrangement (a lease, *hak sewa*), but the Indonesian vocabulary has no key for it. Changing it to `lainnya` (Other) would lose information, and the Malaysian `leasehold_other` misstates it. A proper fix is a new Indonesian key, `hak_sewa`, which is a constraint change. | 1 photo, **3 leads**; public |
| PRP-2026-000236 / LST-2026-000236 | pending_review | MY, `rumah` | `property_type = 'terrace'` | This is my own P0-a regression fixture ("[staging test] P0-a MY listing"), created with an Indonesian key. The check scripts reuse it (`ids.json` `myListing`), so it should stay but carry a Malaysian key. | 0 photos, 0 leads |

**Also proposed:** fix the source of four of them, `packages/db/scripts/seed-staging-demo.mjs` items 9, 15, 16 and 19. Otherwise a reseed brings them back. Items 9, 15 and 19 become `rumah`, `kantor` and `rumah`. Item 16 follows your decision above.

**How it would be applied, once approved, on staging only:**

- **One audited script.** It takes no arguments, refuses any project other than `aylzekkeurjsudazzxjv`, and runs in one transaction.
- **Each row is a conditional update.** For example, `update properties set property_type = 'rumah' where id = <id> and property_type = 'cluster_home'`. A row that has changed since this report is skipped and reported.
- **An audit row per change.** `log_audit('property.vocabulary_corrected', 'property', id, {property_type: old}, {property_type: new}, reason)`, with the reason "P0-d-1b vocabulary correction, owner-approved <date>".
- **What else is affected:**
  - The `listing_quality_on_property` trigger recomputes quality. That is expected.
  - No `listing_embeddings` rows exist for these listings, so nothing goes stale.
  - Leads, photos and status history keep their foreign keys to the listing, not to the type, so they are unaffected.
  - The two non-public listings (draft and paused) change nothing on www.
  - The pending ones change only the moderator's view.

**Rollback:** the same script run in reverse, from the audit rows' `previous_values` and with the same conditional guard. No other table is touched, so reverting the properties is a complete rollback.

**Production:** nothing to correct (section 2).

## 6. The Malaysian copy assistant: where its language comes from, and the smallest fix

**Status, 11 Nov 2026:** approved and built as P0-d-1c in [PR #18](https://github.com/kamalauction-lgtm/agmatchhub/pull/18) (`6ab458a`), stacked on #17.
- Staging-validated 15/15 through the normal entry points, on version `0b908954…`.
- Staging has no AI provider configured, so the live-model path is covered by unit tests only.

**Where the language is chosen today:**

| Path | Language source | Effect for a Malaysian listing |
|---|---|---|
| **AI draft** (`draftListingCopy` → `draftListing` → `runAi('listing_copy', …, { locale })`) | **The UI locale** (`getLocale()` in `app/(agent)/listings/ai-actions.ts`). It picks the `ai_prompts` row and the "Write in …" line (`lib/ai/prompts.ts` `COMMON`). | A Malaysian agent using the Indonesian UI gets Indonesian copy for an English-language listing. |
| **Rules fallback** (`writeTitles`, `writeDescription` in `lib/ai/listing-writer.ts`) | **None.** It is always Indonesian ("Kamar Tidur", "SPESIFIKASI", "HARGA", "Dijual"). | Since #17 it uses RM and sq ft, but the sentences are Indonesian. |
| **Studio** (`writeWhatsappBroadcast`, `writeSocialCaption`) | **The listing's stored `language`**, through `langOf()` | `langOf` maps everything except `en` to `id`, so **a Malay (`ms`) listing gets Indonesian**. |
| **Fields sent to the AI** | `land_size_sqm` and `building_size_sqm`, whatever the unit | A Malaysian sq ft value is labelled as square metres to the model. |

**Smallest follow-up (P0-d-1c, proposed, not built):**

1. **The language follows the listing, not the UI.**
   - In `draftListingCopy`, pass `locale: market.language` to `draftListing`. That is the listing's stored language, because a new listing stores `countries.default_language` (MY gives `en`, ID gives `id`).
   - Studio already uses the stored `listing.language`; keep that.
2. **The rules writer takes a language.**
   - `writeTitles` and `writeDescription` accept `language`.
   - Their fixed Indonesian phrases move into the existing `T` phrase table, which already has `id` and `en` for Studio.
   - The Indonesian output stays byte-for-byte the same, which the existing `listing-writer` tests pin down.
3. **`langOf`:** `ms` maps to `en` rather than `id` until a reviewed Malay phrase set exists. A Malay reader should not be served Indonesian. Adding `ms` phrases needs a localisation check and is a separate step.
4. **Units and currency to the AI.**
   - Send `land_size` and `building_size` together with `size_unit`, plus `currency` (the market's).
   - Tell the template to quote sizes in that unit and prices in that currency.
   - `priceText` and `withUnit` from #17 stay as they are, so the rules path keeps RM and sq ft.

**Tests:**

- unit tests showing that an `en` MY draft has English headings, RM and sq ft, and no Indonesian words such as "Kamar Tidur", "HARGA" or "Dijual";
- unit tests showing that `id` output is unchanged;
- a unit test that `langOf('ms')` gives `en`;
- an engine-context test showing that the AI call receives the listing's language, not the UI's.

**Scope:**

- **Files:** `ai-actions.ts`, `listing-assistant.ts`, `listing-writer.ts` and `prompts.ts`.
- **No migration**, and no new UI strings beyond the `en` phrase set already in `T`.

## Decisions needed

1. **Staging vocabulary corrections (section 5):** approve the 4 updates (800009, 800015, 800019 and 000236) plus the seed fix.
2. **PRP-2026-800016:** leave the Bali leasehold as it is, or add an Indonesian `hak_sewa` key (a constraint migration) and move it there.
3. **Malaysian locations:** approve seeding the missing Sabah districts and Sarawak's districts, and say whether to offer townships as a third level.
4. **P0-d-1c (copy language):** approve the follow-up in section 6.
5. **The 6 production listings without a location:** someone needs to set those locations from the real addresses. That is a content task, not a migration.
