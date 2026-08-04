# Changelog

## v1 — Phase 1 foundation (18 Jul 2026)

- Next.js 16 + TypeScript + Tailwind v4 scaffold; Supabase wired
- Migration 00001: roles/user_roles + authz helper fns, profiles +
  users_private (auto-provisioned on signup), append-only audit_logs,
  languages/currencies/countries (MY/ID/AE) seeds, brand_settings +
  brand_assets — RLS on all tables
- Auth: register / verify-email / login / logout / forgot / reset;
  Next 16 `proxy.ts` session refresh + route protection (verified E2E)
- i18n: EN / BM / ID via next-intl (cookie locale)
- Brand system (spec §70): central config, AG monogram extracted from banner
  (dark + light variants), wordmark SVGs, favicon + PWA icons; IQI logo
  placeholder pending official file
- Audit service wrapper, migration runner, CI workflow, repo docs
