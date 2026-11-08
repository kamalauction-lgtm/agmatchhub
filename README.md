# PropertiGuru

Indonesia's AI-powered property marketplace and agent operating system.

> `propertiguru` is an **internal working name** (the folder and repo carry it;
> the public brand is still undecided). Do not create final branding
> assets under it — see risk R1 in the [plan of record](docs/stage-a-audit-and-architecture.md#j-risk-register).

## Layout

```
apps/
  hub/        Agent OS + MatchHub co-broke platform  →  hub.propertiguru.id (LIVE)
  www/        Public property marketplace            →  www.propertiguru.id
packages/
  db/         Migrations, seeds, RLS test suite — the single owner of the schema
docs/
  stage-a-audit-and-architecture.md    plan of record
  master-prompt.md                     product requirements
```

Both applications talk to one Supabase project, with **asymmetric privilege**:
`apps/hub` runs authenticated sessions and holds the service-role key;
`apps/www` serves anonymous traffic, holds no service-role key, reads only
through `public_*` views and writes nothing directly. That boundary is the
reason a marketplace compromise cannot reach co-broke confidential data.

## Getting started

```bash
npm install
npm run db:status      # check migration state
npm run dev:hub        # http://localhost:8151
npm run dev:www        # http://localhost:8152
```

Each application has its own `.env.local` (never committed); `.env.example`
documents every variable. `packages/db` keeps its own `.env.local` for
`DATABASE_URL` and the test-user credentials.

## Checks

```bash
npm run typecheck   # every workspace
npm run lint        # every workspace
npm run build       # every workspace
npm test            # RLS suite — negative tests proving cross-tenant access is blocked
```

## Documentation

- [Plan of record](docs/stage-a-audit-and-architecture.md) — audit, architecture, data model, role matrix, GHL and AI specs, MVP backlog, risk register
- [Contributor guide](CLAUDE.md) — hard rules, commands, deploy gotchas
- [MatchHub specs](apps/hub/docs/) — the co-broke module's own master spec
- [Security policy](apps/hub/SECURITY.md)
