# @pg/db

Single owner of the PropertiGuru Next database: migrations, seeds, the RLS
test suite, and the privileged batch jobs. Both applications share the one
schema that lives here — neither app carries migrations of its own.

## Environments

Every script takes `--env=staging` or `--env=local` (default; the production
project) and prints the target host before touching anything. Shell variables
win over file values, standard dotenv precedence.

| File | Points at |
|---|---|
| `.env.local` | Production (`jtruwmwinymflkrvuuwd`, Tokyo) |
| `.env.staging` | Staging (`jokyyhvtahiypuzmfydp`, Mumbai) |

Both are git-ignored. The direct `db.<ref>.supabase.co` hosts are IPv6-only on
this network — always use the IPv4 Supavisor pooler, and note staging needs
the `aws-1-` prefix.

**Migrations run staging → production, never production first.**

## Commands

```bash
npm run status:staging       # applied / pending migrations
npm run dry-run:staging      # apply pending in a transaction, report, ROLL BACK
npm run migrate:staging      # apply pending for real
npm test                     # RLS suite (47 tests; needs TEST_* credentials)
npm run ghl-drain:staging    # drain ghl_sync_pending leads (dry-run by default)
node scripts/verify-public-boundary.mjs --env=staging
                             # prove the anon boundary from outside, over HTTP
node scripts/seed-staging-catalogue.mjs --env=staging
                             # seed test catalogue (refuses production)
```

### Test credentials

`TEST_RA_*`, `TEST_SA_*` and `TEST_ADMIN_*` drive most of the suite. The
co-marketing pool tests need a second pair — a marketing agent and a listing
agent with a live open-pool offer between them, which the RA/SA fixtures do not
have:

```bash
TEST_MA_EMAIL / TEST_MA_PASSWORD    # marketing agent (picks listings up)
TEST_LA_EMAIL / TEST_LA_PASSWORD    # listing agent  (publishes the offer)
```

`scripts/seed-staging-comarketing.mjs` creates exactly that pair on staging.
Without these four variables `comarketing-pool.test.ts` skips rather than
passing vacuously — a skipped block is visible in the run output; a vacuous
pass is not.

## GHL drainer

`ghl-drain.mjs` pushes pending leads to GoHighLevel as contacts +
opportunities. With `GHL_LIVE=false` (the default) the entire pipeline runs
against synthetic ids, so it is fully testable with no GHL account. The first
`GHL_LIVE=true` run automatically resets dry-run-synced rows and replays them
for real. Failures record `ghl_last_error` and increment `ghl_attempts`; rows
at the attempt cap (5) are reported as dead-letter every run and need a manual
reset. An inquiry never waits on GHL — that is the entire reason this is a
drainer and not a call in the request path.

## Hard-won rules (each one cost an incident)

1. Never subquery a table inside its own RLS policy — `SECURITY DEFINER`
   helpers or triggers instead (four separate `42P17` incidents).
2. Confidential columns live in `*_private` companion tables; RLS filters
   rows, not columns.
3. Audit/actor FK columns point at `auth.users`, never `profiles` — a second
   `profiles` FK breaks every PostgREST embed on the table.
4. Supabase default privileges grant `anon`/`authenticated` ALL on new tables,
   views **and functions** (EXECUTE). Every public object gets an explicit
   `revoke all` + minimal grant-back. Views: SELECT only. Functions: EXECUTE
   to the intended role only.
5. A write rejected over HTTP is not proof a grant is revoked — PostgreSQL
   checks view updatability before privileges. Assert grants in
   `information_schema.role_table_grants`.
6. Fire-and-forget inserts hide RLS denials. If a trail matters, verify the
   rows actually landed.
7. Guard triggers run for every role, including ones that bypass RLS — service
   contexts need an explicit door (see 00035).
8. **Never consult `current_user` inside a SECURITY DEFINER function** — it
   names the function's owner, not the caller, so a
   `current_user = 'postgres'` "service door" admits everyone. Guard triggers
   are SECURITY INVOKER; use `session_user` for connection identity (00039,
   which closed a real self-publish privilege escalation).
9. **A NOT NULL column with no default and no trigger is a table nobody can
   insert into.** 00040 declared `human_readable_id not null unique` on both
   co-marketing tables, documented the intended format in a trailing comment,
   and never assigned it. Every row that existed came from a seed script that
   happened to pass one, so the gap stayed invisible until the first insert
   from the application (00045).
10. **`create or replace function` is a silent overwrite.** Reusing an existing
    guard's name swaps its body — an insert guard landing on an UPDATE trigger
    would have let `accepted_terms` be rewritten on every update. Caught in
    00044 only because the trigger name collided too, which errors where the
    function does not. Check `pg_proc` before naming a new guard.
11. **"Zero rows visible" is the wrong assertion for a `*_private` leak test.**
    An agent owns the private rows of their own listings and offers. Assert
    that every visible row belongs to the caller, not that none exist —
    otherwise the test breaks the moment the fixture agent publishes anything.

## Test environment

The RLS suite reads `.env.local`. Beyond `TEST_RA_*`, `TEST_SA_*` and
`TEST_ADMIN_*`, the co-marketing pool tests need a marketing/listing agent pair
with a live open-pool offer between them:

```
TEST_MA_EMAIL=     # marketing agent — picks listings up
TEST_MA_PASSWORD=
TEST_LA_EMAIL=     # listing agent — publishes offers
TEST_LA_PASSWORD=
```

`scripts/seed-staging-comarketing.mjs` creates exactly that pair. Without these
the block skips rather than passing vacuously.
