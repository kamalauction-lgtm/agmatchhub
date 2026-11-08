# IQI AG MatchHub — application

**One Requirement. Multiple Opportunities. Controlled Collaboration.**

Private property co-broke platform for IQI AG. See `../docs/` for the master
specification (§1–86) and the Phase 0 architecture & plan; `CLAUDE.md` for
working rules.

## Stack

Next.js 16 · TypeScript · Tailwind v4 · Supabase (Postgres + RLS, Auth,
Storage) · next-intl (EN / BM / ID) · Cloudflare-ready.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys + DATABASE_URL
node scripts/db-migrate.mjs  # apply database migrations
npm run dev                  # http://localhost:3000 (project convention: 8151)
```

## Checks

```bash
npm run lint && npx tsc --noEmit && npm run build
```

## Structure (short)

- `src/app` — routes: `(auth)`, `(agent)`, `(admin)`, `r/[token]` request
  links, `p/[token]` client presentations
- `src/lib` — supabase clients, audit, projections (client-safe DTOs), authz
- `src/config/brand.ts` — central brand config (spec §70)
- `supabase/migrations` — SQL migrations (RLS everywhere)
- `messages/` — en / ms / id translations

## Status

Phase 1 (foundation) — done: schema 00001, auth E2E, i18n, design tokens,
brand assets, audit service, CI workflow. Next: Phase 2 agent verification.
