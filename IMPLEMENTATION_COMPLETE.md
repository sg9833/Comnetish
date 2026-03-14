# Comnetish — Implementation Status

**Last Revised**: 2026-03-14
**Actual State**: ~85% complete — E2E testable workflow now functional

---

## ✅ Verified Complete

### API Endpoints

- `POST /api/bids` — validates deployment OPEN, provider exists, creates bid
- `POST /api/leases` — creates lease in Prisma transaction, auto-transitions deployment to ACTIVE
- `GET /api/deployments`, `POST`, `GET /:id`, `POST /:id/close` — all work
- `GET /api/providers`, `POST`, `GET /:id`, `GET /:id/stats`, `GET /stats` — all work
- `GET /api/leases`, (SSE logs placeholder)
- `POST /api/ai/generate-sdl` — real Anthropic integration (minor `\\n` formatting bug)

### Frontend Pages

- Main console home `page.tsx` — data-driven stats, quick actions, skeleton loading
- Main console `/deployments` page — deployment list with status badges
- Main console `/deployments/[id]` — full detail, close action, SDL parsing
- Main console `/deploy` wizard — 3-step wizard, AI mode, real wallet via wagmi
- Main console `/dashboard` — multi-stat overview, animations
- Main console `/map` — provider map with Leaflet pins
- Provider console home `app/page.tsx` — layout exists, queries exist (data broken by API bugs below)
- Provider console `/onboard` — 4-step wizard, blockchain registration via wagmi

### Styling

- Main console `globals.css` — full design system (color tokens, shimmer, panel, glass classes)
- Provider console `globals.css` — full design system (copy — see L6 for DRY improvement)
- Provider console `tailwind.config.ts` — brand colors, fonts
- Both apps: Framer Motion animations, skeleton loading states

### Database

- Schema: Provider, Deployment, Bid, Lease, Transaction models
- Seed: 5 providers, 4 deployments, 12 bids, 2 leases, 8 transactions (idempotent upserts)

### Configuration

- Provider registration mode default: `'blockchain'` (was `'mock'`)
- Deploy page: uses wagmi `useAccount()` for tenant address (no hardcoded address)
- Dashboard: removed hardcoded wallet address demo value

### Fixes Applied 2026-03-14

- **C1**: Fixed `providers.ts` route ordering — `/me/stats`, `/me/leases`, `/me/bids` now registered before `/:id`
- **C3**: `GET /api/bids` now accepts optional `deploymentId` OR `providerId` filter (no longer requires deploymentId)
- **H1**: Fixed API port fallback from `3000` → `3001` in `console/page.tsx`, `deployments/page.tsx`, `provider-console/page.tsx`
- **H2**: Added `PATCH /api/bids/:id` endpoint for bid withdrawal; provider console Withdraw button now calls it
- **H3**: Fixed `Badge type=` → `Badge variant=` in `console/page.tsx` and `provider-console/page.tsx`
- **H4**: Added `ProviderNav` to `provider-console/layout.tsx` — Dashboard and Onboard links
- **H5**: Added `{ href: '/deployments', label: 'Deployments' }` to main console nav
- **H6**: `GET /api/deployments` list now includes `_count: { bids: true }`; deployments page uses `_count.bids`
- **H7**: Fixed `isActive` Deploy highlight — no longer activates on `/deployments/:id` paths
- **M1**: Fixed `Card subtitle=` → `Card description=` in `console/page.tsx` and `provider-console/page.tsx`
- **M2**: Fixed `statusVariant` `'default'` → `'error'` for CLOSED deployments in `deployments/page.tsx`
- **M4**: Dashboard cost/hr now uses `lease.pricePerBlock * 120` from matched lease (not index math)
- **M5**: Dashboard "Close" button now calls `POST /api/deployments/:id/close` mutation with loading/disabled state
- **M7**: Provider console resource bars now derive percentage from `activeLeases × resource-per-lease ÷ total capacity`
- **M13**: Fixed SDL storage regex from broken `'storage:\n\s*size'` to proper multiline regex in `deployments/[id]/page.tsx`
- **M14**: Fixed `join('\\n')` → `join('\n')` in `routes/ai.ts` — Claude now receives properly formatted prompts
- **Provider console bids section**: Changed from broken `GET /api/bids` (no filter) to `GET /api/providers/me/bids`; shows OPEN bids with Withdraw button and WON bids with View link

### Additional Fixes Verified (Latest Sweep)

| ID             | Status      | Exact File References                                                                                                                                                                                                                       |
| -------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C5             | ✅ Resolved | `services/api/prisma/schema.prisma` (Bid `createdAt` present), `services/api/src/routes/providers.ts` (`/me/bids` orders by `createdAt`)                                                                                                    |
| H9             | ✅ Resolved | `services/api/src/routes/bids.ts` (`PATCH /api/bids/:id` now supports `OPEN`, `WON`, `LOST`)                                                                                                                                                |
| M9             | ✅ Resolved | `services/api/src/config/env.ts`, `services/api/.env.example`                                                                                                                                                                               |
| M12            | ✅ Resolved | `services/api/src/routes/providers.ts` (`resolveProviderFromSession`, `GET/PATCH /api/providers/me`)                                                                                                                                        |
| L1             | ✅ Resolved | `apps/console/app/map/page.tsx` (removed random jitter; deterministic hash-based coordinates and uptime)                                                                                                                                    |
| L4             | ✅ Resolved | `apps/console/app/deploy/page.tsx` (WalletConnect fallback removed; env var required)                                                                                                                                                       |
| H10            | ✅ Resolved | `apps/provider-console/app/providers.tsx` (injected connector flow; no WalletConnect demo fallback)                                                                                                                                         |
| API-Stats-Path | ✅ Resolved | `apps/website/src/layouts/MarketingLayout.astro` (`/api/providers/stats`, `/api/stats`)                                                                                                                                                     |
| API-Waitlist   | ✅ Resolved | `services/api/src/routes/waitlist.ts`, `services/api/src/index.ts`, `services/api/prisma/schema.prisma`, `services/api/prisma/migrations/20260314191000_add_waitlist_entry/migration.sql`, `apps/website/src/layouts/MarketingLayout.astro` |
| H6-Extended    | ✅ Resolved | `services/api/src/routes/deployments.ts` (`_count: { bids: true, leases: true }`)                                                                                                                                                           |
| Stats-Volume   | ✅ Resolved | `services/api/src/routes/leases.ts` (transaction write during lease start)                                                                                                                                                                  |

---

## Current Open Issues

The canonical current-open issue list is maintained in `CODEBASE_ISSUES.md` under `Current Open Issues (Canonical)`.

## Legacy Archive

The previous open-issue and next-fix sections that existed in this file were intentionally removed to prevent status drift across multiple trackers.
Use git history for prior snapshots if needed.
