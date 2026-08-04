# PropertiGuru Next — monorepo guide

@AGENTS.md

## What this repo is

Two products, one database.

| Workspace | What | Deploys to |
|---|---|---|
| `apps/hub` | Agent operating system + MatchHub co-broke platform. **Live in production.** | `hub.propertiguru.id` |
| `apps/www` | Public property marketplace (Indonesia). | `www.propertiguru.id` *(not yet live)* |
| `packages/db` | **Single owner of the schema**: migrations, seeds, RLS test suite. | — |

Plan of record: `docs/stage-a-audit-and-architecture.md` (audit, architecture,
data model, role matrix, GHL/AI specs, MVP backlog, risk register). Product
requirements: `docs/master-prompt.md`. MatchHub's own spec lives in
`apps/hub/docs/`.

`propertiguru` is an **internal working name**. Never produce final brand assets
under it — see risk R1 (PropertyGuru Group owns Rumah123, the direct
competitor). All brand values come from `brand_settings` + env, never literals.

## Hard rules (never break)

1. **`apps/www` must never hold `SUPABASE_SERVICE_ROLE_KEY`.** Not "must not
   use" — must not *have*. The public app reads only through the
   `public_*` Postgres views with the anon key, and *writes nothing directly*:
   public writes are enqueued and processed with elevated privilege elsewhere.
   This is the control that stops a marketplace compromise from reaching
   MatchHub minimum prices, commission terms and client identities.
2. **Confidentiality by projection.** A client (buyer/tenant) must never receive
   supply-agent identity, commission data, minimum price or internal notes — in
   any payload, HTML, header, filename or error. Use
   `apps/hub/src/lib/projections/`.
3. **RLS on every new table.** Never disable RLS to make development easier.
   Roles live in `user_roles`, never in client-editable metadata.
4. **Never subquery a table inside its own policy**, directly or transitively.
   Use a `SECURITY DEFINER` helper or a `BEFORE UPDATE` trigger. This has caused
   four separate `42P17` production incidents (migrations 00020–00022).
5. **Confidential columns go in `*_private` companion tables.** RLS filters
   rows, not columns.
6. **Actor/audit FK columns point at `auth.users`, never `profiles`.** A second
   FK to `profiles` breaks every PostgREST embed on that table (migration
   00028).
7. **Money is `numeric`**, never float. Commission splits are validated
   server-side, in Postgres.
8. **Versioned immutables**: declarations, consents, commission agreements and
   disclosures get new version rows — accepted versions are never overwritten.
9. **Append-only audit** via `public.log_audit()` for every critical action.
10. **Migrations run staging → production.** Never production first.
11. **WhatsApp only, never SMS**, for all outbound messaging.
12. **No hard-coded** app name, colours, roles, countries, prices, plan IDs,
    GHL stage IDs, legal text or domains.

## Commands

Run from the repo root:

```bash
npm run dev:hub        # agent OS dev server (port 8151)
npm run dev:www        # marketplace dev server (port 8152)
npm run typecheck      # every workspace
npm run lint           # every workspace
npm run build          # every workspace
npm test               # RLS suite (packages/db)
npm run db:status      # list applied/pending migrations
npm run db:migrate     # apply pending migrations
npm run deploy:hub     # OpenNext build + deploy to Cloudflare
```

Migrations: add `packages/db/supabase/migrations/NNNNN_name.sql` (5-digit
prefix, ordered), then `npm run db:migrate`. Tracking table is Supabase
CLI-compatible.

## Stack

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 tokens ·
Supabase (Postgres/Auth/Storage) · next-intl (`id` default, then `en`, `ms`) ·
Zod in server actions · Vitest · Cloudflare Workers via OpenNext.

- Route protection and session refresh live in `src/middleware.ts` (Next 16's
  `proxy.ts` is Node-only; Cloudflare needs the edge middleware entry point).
- `next build --webpack` — OpenNext does not support Turbopack.
- `next/image` with SVG sources needs `unoptimized`; above-the-fold brand images
  need `priority`.
- Supabase clients: `lib/supabase/server.ts` (RLS, user session), `client.ts`
  (browser), `service.ts` (bypasses RLS — hub only, server-only, and only after
  an explicit authz check).

## Deploy gotchas (each one cost a debugging session)

- Stop the dev server and `rm -rf .next` before `npm run deploy` — a running dev
  server corrupts `.next/dev/types` and the build deadlocks on the lock file.
- `.env.production` is committed and contains only `NEXT_PUBLIC_*` values, which
  are inlined at build time. Real secrets go in via `wrangler secret put`.
- Adding a translation key with a dot in it creates a nested object in
  next-intl. Notification kinds use underscores for this reason.

## Before claiming done

Typecheck, lint and build pass; new tables have RLS policies **and** a negative
test proving the wrong role is blocked; critical actions are audited; UI strings
exist in all three locales; and you report honestly what was tested versus what
was not.
