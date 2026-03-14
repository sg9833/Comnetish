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

---

## ❌ Remaining Open Issues (14 total)

### Critical

| ID | Issue | Location |
|---|---|---|
| C2 | `/ws/deployments/:id/logs` WebSocket never registered — logs always fake | `services/api/src/index.ts` |

### Medium Priority

| ID | Issue | Location |
|---|---|---|
| M3 | `?provider=` query param ignored by map and deploy pages | `map/page.tsx`, `deploy/page.tsx` |
| M6 | Deploy page shows hardcoded `1,248.34 CNT` balance | `deploy/page.tsx` |
| M8 | Stale `connectionState` closure — fake logs always shown even on real WS connect | `deployments/[id]/page.tsx` |
| M9 | CORS defaults to `localhost:3000` only — multi-origin setups blocked | `services/api/src/config/env.ts` |
| M10 | AI agent `/inference` and `/batch` are stubs — no real inference | `services/ai-agent/src/index.ts` |
| M11 | 4 pages have inner `QueryClientProvider` wrapping (isolated from root) | dashboard, deploy, map, deployments/[id] |
| M12 | `/me/*` provider routes return first active provider for everyone (no auth) | `providers.ts` |

### Low Priority

| ID | Issue | Location |
|---|---|---|
| L1 | Map pins jitter on each data refresh (`Math.random()` in `hashToCoord`) | `map/page.tsx` |
| L2 | Live URL hardcoded to `comnetish.app` domain | `deployments/[id]/page.tsx` |
| L3 | `transpilePackages` missing `@comnetish/chain-client` | both `next.config.mjs` |
| L4 | WalletConnect fallback demo project ID is invalid | `deploy/page.tsx` |
| L5 | USDC approval is `setUsdApproved(true)` — no ERC-20 approve() call | `deploy/page.tsx` |
| L6 | Provider console CSS duplicates main console CSS | `provider-console/globals.css` |

---

## Next Fix Sequence (for Friend's Laptop / Multi-Provider)

### Batch 4 — Multi-Provider Prep
1. **M9**: Expand CORS origins default in `services/api/src/config/env.ts`
2. **M12**: Add auth context to `/me/*` routes (at minimum, support `?address=` query param)
3. **C2**: Implement per-deployment WebSocket log endpoint
4. **M8**: Fix stale `connectionState` closure in deployment logs fallback

### Batch 5 — Polish
5. **M3**: Wire `?provider=` param in map and deploy pages
6. **M6**: Fetch real CNT balance in deploy wizard
7. **L1**: Remove `Math.random()` from `hashToCoord` in map
8. **M11**: Remove nested `QueryClientProvider` from 4 pages

---

**Open Issues**: 14 total (1 Critical, 7 Medium, 6 Low)
