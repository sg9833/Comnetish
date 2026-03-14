# Issues by File — Quick Reference

**Last Updated**: 2026-03-14
**Format**: File → Issues with line numbers, severity, and fix notes

## Resolution Delta (Latest Remediation)

The entries below were closed in the latest remediation pass and are superseded from historical sections further down this file.

| ID                       | Resolved                                                                     | Exact File References                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C5                       | ✅ Bid ordering field mismatch no longer blocks `/api/providers/me/bids`     | `services/api/prisma/schema.prisma`, `services/api/src/routes/providers.ts`                                                                                                                                                                 |
| H9                       | ✅ Bid patch route supports full status transitions (`OPEN`, `WON`, `LOST`)  | `services/api/src/routes/bids.ts`                                                                                                                                                                                                           |
| M9                       | ✅ CORS defaults now include `localhost:3001`                                | `services/api/src/config/env.ts`, `services/api/.env.example`                                                                                                                                                                               |
| M12                      | ✅ Authenticated provider settings and `/me` profile endpoints added         | `services/api/src/routes/providers.ts`                                                                                                                                                                                                      |
| L1                       | ✅ Map behavior made deterministic (no random pin jitter)                    | `apps/console/app/map/page.tsx`                                                                                                                                                                                                             |
| L4                       | ✅ WalletConnect demo fallback removed from tenant deploy page               | `apps/console/app/deploy/page.tsx`                                                                                                                                                                                                          |
| H10                      | ✅ Provider wallet connector flow no longer depends on demo project fallback | `apps/provider-console/app/providers.tsx`                                                                                                                                                                                                   |
| H6 (extended)            | ✅ Deployment list now includes both bid and lease counts                    | `services/api/src/routes/deployments.ts`                                                                                                                                                                                                    |
| API website stats path   | ✅ Frontend now correctly targets backend `/api` stats routes                | `apps/website/src/layouts/MarketingLayout.astro`                                                                                                                                                                                            |
| API waitlist persistence | ✅ Waitlist endpoint + DB model/migration + website submission flow added    | `services/api/src/routes/waitlist.ts`, `services/api/src/index.ts`, `services/api/prisma/schema.prisma`, `services/api/prisma/migrations/20260314191000_add_waitlist_entry/migration.sql`, `apps/website/src/layouts/MarketingLayout.astro` |

---

## Current Open Pointers (Canonical)

Canonical source of truth is `CODEBASE_ISSUES.md` → `Current Open Issues (Canonical)`.

Use this section as a quick file index for currently open items only.

| ID  | File(s)                                                                 |
| --- | ----------------------------------------------------------------------- |
| C6  | `services/api/src/routes/*`, `packages/chain-client`, `README.md`       |
| C8  | `chain/go.mod` and chain packages                                       |
| L6  | `apps/provider-console/app/globals.css`, `apps/console/app/globals.css` |

## Legacy Archive

The previous long-form file-by-file issue inventory was removed from this tracker to prevent stale contradictions with the canonical table.
Historical snapshots remain available through git history.
