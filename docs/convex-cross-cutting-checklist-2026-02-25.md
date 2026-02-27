# Convex Cross-Cutting Hardening Checklist (2026-02-25)

Scope: `dashboard.ts`, `automation.ts`, `planning.ts`, `governance.ts`, `reliability.ts`, `http.ts`

## Release Gates

- [x] No schema pushes from repo scripts until local schema alignment is reconstructed and reviewed
- [x] Public financial mutations require authenticated viewer (shared `requireViewerUserId` used at entry points)
- [x] Owned-record mutations validate row ownership (shared `assertOwnedDocOrThrow` delegates)
- [x] Financial mutations write `financeAuditEvents` (shared `auditWriteSafe` delegates + sweep gap patches)
- [x] Phase 3 purchase/ledger posting stores immutable native currency/amount + FX snapshot at post time
- [x] Due/reminder/cycle calculations are timezone-aware using `financePreferences.timezone`
- [x] Final pass includes compile/lint/build verification

## Module Audit Summary

- `convex/dashboard.ts`
  - Auth: enforced for core CRUD, Phase 3 posting/templates, preferences, seed flows
  - Ownership: shared `assertOwnedDocOrThrow` delegate
  - Audit: shared `auditWriteSafe` delegate
  - Currency/FX: Phase 3 posting uses shared FX snapshot helpers
  - Timezone: dashboard schedules/upcoming items use shared timezone helpers
- `convex/automation.ts`
  - Auth: enforced for public rule/suggestion/preferences/sweep mutations
  - Ownership: shared `assertOwnedDocOrThrow` delegate
  - Audit: shared `auditWriteSafe` delegate + sweep-generated suggestions/alerts audited
  - Timezone: due alerts/monthly automation run calculations use shared timezone helpers
- `convex/planning.ts`
  - Auth: enforced for public planning/goals mutations
  - Ownership: shared `assertOwnedDocOrThrow` delegate
  - Audit: shared `auditWriteSafe` delegate
- `convex/governance.ts`
  - Auth: enforced for exports/privacy/retention/deletion public handlers and export action generation
  - Ownership: shared `assertOwnedDocOrThrow` delegate
  - Audit: shared `auditWriteSafe` delegate
  - Server-side audit filters: date range/action/entity/search/limit supported
- `convex/reliability.ts`
  - Auth: queries degrade safely for unauthenticated callers; telemetry ingest returns unauthorized result instead of throwing
  - Timezone: due reminders and dedupe keys use shared timezone helpers
- `convex/http.ts`
  - Access control: tokenized signed download URL + internal payload validation + best-effort access logging
  - CORS: explicit `CLIENT_ORIGIN` allowlist match

## Schema Alignment Note

- Local `convex/schema.ts` was reconstructed from:
  - dev snapshot export table list (`/tmp/finance-convex-export/_tables/documents.jsonl`)
  - Convex dry-run index diff catalog (`/tmp/convex-prod-dryrun.log`)
- Generated artifact:
  - `convex/schema.index-catalog.json`
- Runtime schema validation is intentionally disabled in reconstructed schema until the original typed schema source is restored:
  - `schemaValidation: false`
  - `strictTableNameTypes: false`

## Follow-up (non-blocking)

- Replace reconstructed `v.any()` schema with the original typed schema source when available.
- Verify prod/dev index parity explicitly if deployment schemas are expected to diverge.
