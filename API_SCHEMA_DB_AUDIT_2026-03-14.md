# API, Schema, and DB Audit

Date: 2026-03-14
Scope: Full monorepo scan of frontend API consumers, backend routes, and Prisma schema usage.

## Implemented API Routes

All routes below are currently implemented in services/api.

| Method   | Path                          |
| -------- | ----------------------------- |
| GET      | /health                       |
| POST     | /api/providers                |
| POST     | /api/providers/auth/challenge |
| POST     | /api/providers/auth/verify    |
| GET      | /api/providers                |
| GET      | /api/providers/stats          |
| GET      | /api/providers/me             |
| PATCH    | /api/providers/me             |
| GET      | /api/providers/me/stats       |
| GET      | /api/providers/me/leases      |
| GET      | /api/providers/me/bids        |
| GET      | /api/providers/:id            |
| GET      | /api/providers/:id/stats      |
| POST     | /api/deployments              |
| GET      | /api/deployments              |
| GET      | /api/deployments/:id          |
| POST     | /api/deployments/:id/close    |
| POST     | /api/leases                   |
| GET      | /api/leases                   |
| GET      | /api/leases/:id/logs          |
| POST     | /api/bids                     |
| GET      | /api/bids                     |
| PATCH    | /api/bids/:id                 |
| GET      | /api/stats                    |
| POST     | /api/ai/generate-sdl          |
| GET (WS) | /ws                           |
| GET (WS) | /ws/deployments/:id/logs      |

## Frontend API Calls Found

### Provider Console

- POST /api/providers/auth/challenge
- POST /api/providers/auth/verify
- GET /api/providers/me/stats
- GET /api/providers/me/leases
- GET /api/providers/me
- PATCH /api/providers/me
- POST /api/providers (onboarding)

### Tenant Console

- GET /api/deployments
- GET /api/leases
- GET /api/providers
- GET /api/stats
- POST /api/deployments/:id/close
- GET /api/deployments/:id
- GET /api/leases?deploymentId=...
- GET /api/bids?deploymentId=...
- POST /api/deployments
- POST /api/ai/generate-sdl
- WS /ws/deployments/:id/logs

### Website

- GET ${API_BASE}/providers/stats
- GET ${API_BASE}/stats

## Missing or Broken API Endpoints

### 1) Broken website paths due to missing /api prefix

- Website calls ${API_BASE}/providers/stats but backend serves /api/providers/stats
- Website calls ${API_BASE}/stats but backend serves /api/stats

Impact:

- Home page live stats can silently fail and show placeholder values.

Fix:

- Update website requests to /api/providers/stats and /api/stats.

### 2) Waitlist submission has no backend persistence endpoint

- Join waitlist form currently handles submit in client logic but does not send data to backend.

Impact:

- User emails are not stored.

Fix:

- Add POST /api/waitlist endpoint and a Prisma model/table for waitlist entries.

## Missing Prisma Fields and Query Shape Gaps

### Deployments list does not include lease counts

Current list query includes only \_count.bids in some paths. Frontend expects lease count information.

Impact:

- Deployment cards can show leaseCount as 0 due to missing selected data.

Fix:

- Include \_count.leases (or include leases relation and derive length).

## Missing Models/Tables or Write Paths

### Transaction model exists but is not written anywhere

- Prisma has Transaction model.
- Stats endpoint aggregates CNT volume from Transaction.
- No route currently writes transaction rows.

Impact:

- CNT volume can remain 0 permanently.

Fix options:

- Add write path from settlement lifecycle.
- Add explicit POST /api/transactions internal ingestion endpoint.

## Unused Backend Routes

These routes are implemented but not currently called by frontend surfaces:

- GET /api/providers/me/bids
- GET /api/providers/:id
- GET /api/providers/:id/stats
- POST /api/leases
- GET /api/leases/:id/logs (frontend uses websocket stream path instead)
- POST /api/bids
- PATCH /api/bids/:id
- GET (WS) /ws

## Schema Fields with No Effective Runtime Usage

### Transaction model fields effectively unused in product flow

Because no writes occur, these fields are not materially used at runtime:

- id
- type
- from
- to
- txHash
- createdAt
- token (read in aggregate only)
- amount (read in aggregate only)

### AI generate SDL optional input not used by client

- Backend schema accepts optional constraints array.
- Current client payload does not send constraints.

## Priority Remediation Plan

### P0

1. Fix website API base paths to include /api.
2. Add waitlist persistence endpoint + table.

### P1

1. Ensure deployments list includes lease counts consistently.
2. Add transaction write flow so stats volume is real.

### P2

1. Decide whether to keep or remove unused routes.
2. If keeping, wire at least one client surface to each route or mark as internal.

## Validation Checklist

After fixes are applied:

- Website stats requests return 200 for /api/providers/stats and /api/stats.
- Waitlist submit creates a DB row.
- Deployments list returns lease counts and UI displays non-zero counts when applicable.
- Stats volume changes after transaction-generating actions.

## Notes

This document is intended to be the canonical audit snapshot for API/schema/db gaps as of 2026-03-14.
