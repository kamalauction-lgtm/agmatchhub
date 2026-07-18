# Security policy

- Confidential fields (Supply Agent identity, commission terms, minimum price,
  client identity) are protected by Row-Level Security AND server-side
  projections. Report any leak immediately to the platform owner.
- Never commit secrets. `.env*` is git-ignored except `.env.example`.
- Service-role key and `DATABASE_URL` are server-only; rotate them if exposed.
- Rotate the database password before production launch.
- Audit logs are append-only; do not grant UPDATE/DELETE on `audit_logs`.
- Dependencies are checked in CI; do not ignore security warnings without a
  documented reason.

Report vulnerabilities privately to the repository owner.
