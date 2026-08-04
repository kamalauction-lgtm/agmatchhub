# IQI AG MatchHub — Claude Code guide

@AGENTS.md

## What this is

Private, requirement-driven property co-broke platform (NOT a public listing
portal). Requesting Agent posts a client requirement → Admin approves → secure
password-protected link → Supply Agents submit properties → RA filters → only
approved properties reach the client via a separate presentation link.

Master spec lives at `../docs/master-spec-sections-1-69.md` and
`../docs/master-spec-sections-70-86.md`. Architecture + plan:
`../docs/phase0-architecture-and-plan.md`. Follow them; do not remove
requirements.

## Hard rules (never break)

1. **Confidentiality by projection**: the client (buyer/tenant) must NEVER
   receive Supply Agent identity, commission/co-broke data, minimum price, or
   internal notes — in any payload, HTML, header, filename, or error. Client
   pages use server-side client-safe projections only (`src/lib/projections/`).
2. **RLS on every new table.** Never disable RLS to make dev easier. Roles live
   in `user_roles` (server-side), never in client-editable metadata.
3. **Money = `numeric`**, never floats. Commission splits validated server-side.
4. **Versioned immutables**: declarations, consents, commission agreements,
   disclosures get new version rows — never overwrite accepted versions.
5. **Append-only audit** via `public.log_audit()` / `src/lib/audit.ts` for
   every critical action.
6. **No hard-coded** app name, colours, roles, countries, legal text, or
   domains. Brand → `src/config/brand.ts`; URLs → env; UI text → `messages/*`.
7. **Official logos**: IQI logo is a labelled placeholder until the official
   file arrives. Never generate or substitute lookalike official logos.

## Stack & conventions

Next.js 16 (App Router; note: `src/proxy.ts`, NOT middleware.ts) · TypeScript
strict · Tailwind v4 tokens in `globals.css` · Supabase (Postgres/Auth/Storage)
· next-intl (en/ms/id, cookie-based, no URL prefix) · Zod validation in server
actions.

- Supabase clients: `lib/supabase/server.ts` (RLS, user session),
  `client.ts` (browser), `service.ts` (bypasses RLS — server-only, only after
  explicit authz checks).
- `next/image` with SVG sources needs `unoptimized`; above-the-fold brand
  images need `priority`.
- Human-readable IDs via `public.next_human_id('REQ')` etc. — display only,
  never security tokens.

## Commands

```bash
npm run dev             # dev server (usually launched on port 8151)
npx tsc --noEmit        # typecheck
npm run lint            # eslint
npm run build           # production build
node scripts/db-migrate.mjs           # apply pending SQL migrations
node scripts/db-migrate.mjs --status  # list migration status
```

Migrations: add `supabase/migrations/NNNNN_name.sql` (5-digit prefix, ordered),
then run the migrate script. Tracking table is CLI-compatible
(`supabase_migrations.schema_migrations`).

## Environment

`.env.local` (never committed) holds Supabase keys + `DATABASE_URL` (used only
by the migration runner). `.env.example` documents every variable. Never log or
expose `SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL`.

## Before claiming done

typecheck + lint + build pass; new tables have RLS policies + a leak check
(query as anon/other role); critical actions audited; UI strings exist in all
three locales; report honestly what was tested vs not.
