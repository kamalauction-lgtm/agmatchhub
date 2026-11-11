# Location data: proposal for review

Prepared 11 Nov 2026. These are **read-only findings** (production was queried in a read-only session).

- **No location row or listing has been changed.**
- **Every write below needs separate owner approval.**
- **Production writes** need their own approval, as data corrections; they are not migrations.

**Holds that stay in place:**
- The Bali leasehold decision (PRP-2026-800016) is pending.
- `import_photos` stays off for real agents.
- P0-c and P0-d-2 remain with counsel.

## 1. The six production listings with no location

**Status, 11 Nov 2026: applied to production (owner approved "Approve the six").**
- **Script:** `packages/db/scripts/set-listing-locations.mjs` (in PR #18, commit `c0417b0`).
- **How it ran:** a dry run first, then `--apply`, in one guarded transaction, with 6 `property.location_set` audit rows.
- **Result:**
  - all six now show their location in `public_listings`, and quality scores were recomputed by the trigger;
  - the live pages on www.propertiguru.id show Cengkareng / Jakarta Barat and Kab. Bekasi;
  - production has **0 listings without a location**;
  - a rerun is refused.
- **Not set:** `general_address`, and the Vasanta district (left unset; see below).
- **Rollback:** `node scripts/set-listing-locations.mjs --env=production --revert`.

**What I checked:**
- **Production** (read-only): each property's address, building, developer, postcode and coordinates columns, all empty, and its description, which names the project and unit number.
- **The import source in the repository,** `packages/db/scripts/import/ifca-normalized.json`. This is the normalised IFCA workbook these listings were imported from (`creation_source = import`). Each listing matches **exactly one** source record by its **unit number**, and each source record carries a full `address_raw`.

| Listing / property | Project, unit (from the listing) | Source record and its address | Proposed location | Confidence |
|---|---|---|---|---|
| LST-2026-000107 / PRP-2026-000137 | Green Park View, unit **G1854** | `source_property_no` 7: "Daan Mogot Rd No.1 - 4, RT.1/RW.5, Duri Kosambi, **Cengkareng, West Jakarta City**, Jakarta, Kodepos 11750" | DKI Jakarta › Jakarta Barat › **Cengkareng** (district `f516bd1a-…`) | **Confirmed.** The address names the district and the city. |
| LST-2026-000108 / PRP-2026-000138 | Vasanta Innopark, unit **A#C38-19** | no. 8: "JL. Kalimantan Kavling CB2, Kawasan Komersial, Kota Industri MM2100, **Cikarang, Jawa Barat**, Kodepos 17530" | Jawa Barat › **Kab. Bekasi** (regency `21bb7ad9-…`) | **Regency confirmed. District flagged.** |
| LST-2026-000109 / PRP-2026-000139 | Vasanta Innopark, **A#C38-18** | no. 9, the same address | Jawa Barat › Kab. Bekasi | Same |
| LST-2026-000112 / PRP-2026-000142 | Vasanta Innopark, **A#C38-01** | no. 12, the same address | Jawa Barat › Kab. Bekasi | Same |
| LST-2026-000119 / PRP-2026-000150 | Vasanta Innopark, **A#A38-17** | no. 20, the same address | Jawa Barat › Kab. Bekasi | Same |
| LST-2026-000120 / PRP-2026-000151 | Vasanta Innopark, **A#A38-16** | no. 21, the same address | Jawa Barat › Kab. Bekasi | Same |

**Why only the regency for the five Vasanta units.**
- **Regency:** the address says "Cikarang, Jawa Barat", not which Cikarang district. In the platform's own location table, every Cikarang district sits under **Kab. Bekasi** (Cikarang Barat, Pusat, Selatan, Timur and Utara). So the regency follows from the evidence.
- **District:** the specific district would rest on outside knowledge of where MM2100 lies, or on reading postcode 17530. Neither is in the records, so the district is **not established and is flagged**.
- **Precedent:** setting the regency only matches how 24 production listings are already located, including the other Bekasi listings, LST-2026-000101 to -000105.

**Records whose correct location cannot be fully established from existing evidence:**
- **District level:** LST-2026-000108, -000109, -000112, -000119 and -000120 (a district under Kab. Bekasi). An agent or the developer's documents can confirm it.
- **Regency and province:** none. All six are established at that level.

**Proposed change, once approved, per property:**
- `location_id` (the district for 000137; the regency for the other five);
- `ancestor_location_ids`, from that location row;
- `province_name` and `regency_name`, plus `district_name` for 000137, from that row's `path_names`;
- `general_address`, set to the source `address_raw`, but **only if you want it**. It is a developer office or estate address, not the unit's, so I'd leave it empty.

**How it would run, and what it touches:**
- **The script:** the same pattern as the vocabulary script, `packages/db/scripts/correct-listing-vocabulary.mjs`. That means one transaction, a guard that each row's `location_id` is still null, an audit row (`property.location_set`) with the source record number as the basis, and `--revert` to undo.
- **Production needs its own explicit approval,** and staging has no copies of these rows to rehearse on. The rehearsal would be a dry run that prints the planned changes without writing.
- **Dependants:** all six are **published** with 0 leads, 0 photos and 0 embeddings.
  - The `listing_quality_on_property` trigger recomputes quality.
  - The listings become findable by location on www. That is the point of the change, and it is a visible change on the live marketplace.
- **Rollback:** `--revert` sets the four columns back to null, guarded on the values written.

## 2. Malaysian districts: Sabah and Sarawak

**What the platform has (production and staging are identical):**
- **Sabah:** 14 districts. Beaufort, Keningau, Kinabatangan, Kota Kinabalu, Kudat, Lahad Datu, Papar, Penampang, Putatan, Ranau, Sandakan, Semporna, Tawau and Tuaran.
- **Sarawak:** 12 rows, which are **the 12 divisions**. Betong, Bintulu, Kapit, Kuching, Limbang, Miri, Mukah, Samarahan, Sarikei, Serian, Sibu and Sri Aman.

**What the sources say.** I found no clean official list:

| Sabah | Sarawak |
|---|---|
| <ul><li>Secondary sources give **27 or 28** districts in 5 divisions (West Coast, Kudat, Sandakan, Tawau and Interior), plus sub-districts that some sources count separately.</li><li>I found no official Sabah government list in the search.</li><li>Sources: [Sabah (Wikipedia)](https://WWW.wikipedia.org/wiki/Sabah), [List of districts in Malaysia](https://Www.wikipedia.org/wiki/Jajahan) and [Daily Express on sub-district administration](https://dailyexpress.com.my/news/225127/the-complex-dilemmas-of-sub-district-administration/).</li></ul> | <ul><li>The official portal's [Administrative Division and Districts page](https://www.sarawak.gov.my/web/home/article_view/358/298) has a table of divisions, districts and sub-districts. When fetched it came back flattened and showed only one district per division, so **I could not extract the district list reliably**.</li><li>The legal basis is the [Administrative Areas Order, 2016](https://lawnet.sarawak.gov.my/lawnet_file/Subsidiary/SUB_Issue%20No.%2050_L.N.%20204w(H).pdf) on Sarawak LawNet, in force from 1 Aug 2015, with any later amendments.</li><li>Secondary sources give about **40** districts. Kuching Division, for example, has Kuching, Bau and Lundu.</li></ul> |

**Proposal (not built):**

1. **The source first.** The lists to seed are:
   - **Sabah:** the Sabah State Government's list, or the Department of Statistics Malaysia's administrative boundary publication;
   - **Sarawak:** the Administrative Areas Order 2016, as amended, or the same DOSM publication.

   **I have not seeded from secondary sources, and recommend not doing so.** A wrong district in the location tree propagates into every listing, search facet and SEO page that uses it.
2. **Sabah:** add the districts missing from that list. They are additive rows under each state, at the `district` level, with path `[Sabah, <district>]`.
3. **Sarawak:** keep the 12 division rows; listings may already point at them, and on staging and production none do. Then either:
   - **(a) recommended:** add the districts as children of their divisions. Path `[Sarawak, <division>, <district>]`, at a new level `division` → `district`. This needs the level constraint widened, which is a migration.
   - **(b) simpler:** re-label the 12 rows as divisions and add the districts at the `district` level directly under the state. The 12 rows would then no longer be offered in the form.

   Option (a) keeps every existing reference valid. Option (b) changes what the form offers.
4. **Tooling:** seeding goes through the existing `packages/db/scripts/seed-locations-my.mjs` (staging first), with the source cited in the file.

**Dependency:** this needs the official lists in hand. Getting them is the next step if you approve.

## 3. Townships in the listing form

**Today:**
- The form (P0-d-1b) offers Malaysian **state › district**.
- **129 townships** exist in production and staging, under districts. They are what buyers search for, such as Mont Kiara, Bangsar and Cyberjaya.
- The form doesn't offer them, so a Kuala Lumpur agent picks "Kuala Lumpur › Kuala Lumpur" and types the area by hand.

**Proposal (not built), smallest version:**
- **The form:** the Malaysian location step gets an optional third select, **Township**. It is filtered to the chosen district and lists only active `township` rows. When the agent picks one, `location_id` is the township, `ancestor_location_ids` includes the district and state, and `district_name` is filled in.
- **The server:** the `createListing` level check (`WIZARD_LOCATION_LEVELS`) allows `township` for MY, still restricted to the agent's own country.
- **Indonesia:** unchanged.
- **Acceptance:**
  - an MY agent can save state › district › township;
  - the listing appears under the township's facets on www;
  - a township from another country is refused;
  - an ID agent sees exactly today's form.
- **Gap:** 129 townships is a starter set, as the `00075` comment says. Coverage outside the Klang Valley, Penang and Johor Bahru is thin.

## Decisions needed

1. **The six production listings:** approve setting the locations as in the table (Cengkareng for 000107, Kab. Bekasi for the five Vasanta units), with or without `general_address`. Then decide whether to confirm the Vasanta district with the agent or developer, or leave it at the regency.
2. **Sabah and Sarawak:** approve obtaining the official lists and seeding them on staging, and choose option (a) or (b) for Sarawak.
3. **Townships:** approve the optional third form level.
