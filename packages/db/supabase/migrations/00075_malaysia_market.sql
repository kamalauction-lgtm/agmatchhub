-- =============================================================================
-- 00075 — Malaysia as a second market
--
-- The platform was built multi-country: every profile, property and listing
-- carries `country_code`, and `countries` already holds the Malaysian row
-- (English then Malay, MYR, square feet, "Real Estate Negotiator"). What was
-- NOT multi-country was the vocabulary — `property_type` and `ownership_type`
-- are CHECK constraints listing Indonesian values only, so a Malaysian agent
-- could not have recorded a terrace house or a freehold title at all.
--
-- INDONESIAN VALUES ARE KEPT, NOT REPLACED
--   One database serves both markets. Dropping `rumah` or `shm` would orphan
--   every one of the 30 live Indonesian listings. The constraint becomes the
--   UNION of both vocabularies, and which subset an agent is offered is a
--   country question answered in the application, not in the constraint.
--
-- WHY THE KEYS ARE ENGLISH FOR MALAYSIA
--   The Indonesian keys are Indonesian words (`rumah`, `ruko`) because that is
--   what the market calls them and the UI translates from the key. Malaysia's
--   default language is English, so its keys are English (`terrace`,
--   `shoplot`) and the Malay UI translates them (`teres`, `rumah kedai`).
--   A key is an identifier, not a display string; what matters is that one
--   concept has exactly one key, and these concepts genuinely differ — an
--   Indonesian `ruko` and a Malaysian shoplot are not the same product.
--
-- TENURE IS A LEGAL FACT, NOT A LABEL
--   Malaysian titles are freehold, leasehold (commonly 99 or 60 years), Malay
--   reserve land and Bumi lots, held as individual or strata title. None of
--   those map onto SHM/HGB/girik, and presenting one as the other would
--   misstate what a buyer is purchasing. They are separate values.
-- =============================================================================

alter table public.properties drop constraint if exists properties_property_type_check;
alter table public.properties add constraint properties_property_type_check check (
  property_type = any (array[
    -- Indonesia (unchanged — 30 live listings depend on these)
    'rumah', 'apartemen', 'ruko', 'rukan', 'kondominium', 'villa', 'kost',
    'gudang', 'pabrik', 'kantor', 'toko', 'hotel', 'tanah', 'kavling',
    -- Malaysia
    'terrace',            -- link / terrace house, the volume product
    'semi_detached',
    'bungalow',
    'townhouse',
    'cluster_home',
    'condominium',        -- distinct from `kondominium`: different market, different key
    'serviced_residence', -- built on commercial title; not an apartment in law
    'apartment',
    'flat',
    'soho',               -- small office/home office
    'penthouse',
    'shoplot',
    'shop_office',
    'retail_space',
    'office_space',
    'factory',
    'warehouse',
    'agricultural_land',
    'residential_land',
    'commercial_land',
    -- Shared
    'lainnya'
  ])
);

alter table public.properties drop constraint if exists properties_ownership_type_check;
alter table public.properties add constraint properties_ownership_type_check check (
  ownership_type = any (array[
    -- Indonesia (unchanged)
    'shm', 'hgb', 'hgu', 'hp', 'hbg', 'girik', 'ppjb', 'adat',
    -- Malaysia
    'freehold',
    'leasehold_99',
    'leasehold_60',
    'leasehold_other',
    'malay_reserve',      -- transferable only between Malays; a hard restriction
    'bumi_lot',           -- Bumiputera-reserved unit, usually with a discount
    -- Shared
    'strata',             -- both markets use strata title for subdivided buildings
    'lainnya'
  ])
);

-- -----------------------------------------------------------------------------
-- Malaysian geography
-- -----------------------------------------------------------------------------
-- Three levels, matching the Indonesian shape (province → regency → district)
-- so one query serves both markets:
--
--   state    — the 13 states and 3 federal territories
--   district — daerah; the administrative division under a state
--   township — NOT an administrative unit, but what buyers actually type.
--              Nobody searches "Daerah Petaling"; they search "Mont Kiara".
--              Modelled at the district level so the existing location
--              hierarchy, facets and search all work unchanged.
--
-- Seeded from public administrative data. Townships are a starter set of the
-- areas that carry real listing volume; the set grows from live listings
-- rather than from an attempt to be exhaustive on day one.

alter table public.locations drop constraint if exists locations_level_check;
alter table public.locations add constraint locations_level_check check (
  level = any (array[
    -- Indonesia
    'province', 'regency', 'district', 'village',
    -- Malaysia
    'state', 'township'
    -- 'district' is shared: Indonesia's kecamatan and Malaysia's daerah sit at
    -- the same depth, so one value serves both rather than inventing a synonym.
  ])
);

comment on table public.locations is
  'Administrative geography per country. ID: province → regency → district. MY: state → district → township, where township is a market area (Mont Kiara, Setia Alam) rather than an administrative unit, because that is what buyers search.';
