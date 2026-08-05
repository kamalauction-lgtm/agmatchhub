-- =============================================================================
-- 00043 — Revoke anon's default grants on the boost and credit tables
--
-- The same Supabase default-privilege trap as 00031/00032, hit again on the
-- tables 00042 created: `anon` receives ALL privileges on every new table in
-- `public`, and only RLS stands in the way. Verified after 00042 — anon got
-- HTTP 200 (with empty bodies) on listing_boosts, credit_wallets,
-- credit_transactions and boost_products.
--
-- Empty is not the same as unreachable. README rule 4 exists because this
-- keeps recurring: every new table needs an explicit revoke, or one mistaken
-- policy is the whole defence.
--
-- Money tables in particular should not even be addressable anonymously.
-- =============================================================================

revoke all on public.listing_boosts from anon;
revoke all on public.credit_wallets from anon;
revoke all on public.credit_transactions from anon;
revoke all on public.boost_products from anon;

-- Public promotion status reaches the marketplace through the `public_listings`
-- view's boost_weight / is_boosted columns, which is the only route it needs.
