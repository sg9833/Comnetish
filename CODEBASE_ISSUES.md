# Comnetish Codebase — Issues Tracker

**Last Scanned**: 2026-03-14
**Status**: 16 previously tracked fixes verified — expanded repo-wide audit found additional unresolved issues across setup, contracts, and chain

## Canonical Audit Snapshot

- API/schema/db complete audit: `API_SCHEMA_DB_AUDIT_2026-03-14.md`
- Canonical current-open list: this file (`Current Open Issues` section)

> See `IMPLEMENTATION_COMPLETE.md` for implementation/fix log details.
> See `ISSUES_BY_FILE.md` for quick per-file pointers.
> This file is the canonical source of current-open status.

---

## ✅ RESOLVED (Batches 1-3 Complete)

| ID  | Fix Applied                                                                         |
| --- | ----------------------------------------------------------------------------------- |
| C1  | providers.ts route ordering — /me/\* before /:id                                    |
| C3  | GET /api/bids deploymentId made optional; providerId filter added                   |
| H1  | Port 3000→3001 in console/page.tsx, deployments/page.tsx, provider-console/page.tsx |
| H2  | PATCH /api/bids/:id endpoint added; provider console Withdraw button wired          |
| H3  | Badge type= → variant= fixed                                                        |
| H4  | ProviderNav added to provider-console layout                                        |
| H5  | /deployments added to main console nav                                              |
| H6  | Deployments list API includes \_count.bids; page uses it                            |
| H7  | isActive no longer highlights Deploy on /deployments/:id pages                      |
| M1  | Card subtitle= → description= fixed                                                 |
| M2  | statusVariant 'default' → 'error' for CLOSED                                        |
| M4  | Dashboard cost/hr uses lease.pricePerBlock \* 120 (real data)                       |
| M5  | Dashboard Close button calls POST /api/deployments/:id/close mutation               |
| M7  | Provider resource bars derived from activeLeases vs total capacity                  |
| M13 | Storage regex fixed with proper multiline regex                                     |
| M14 | AI route join('\n') fixed (was '\\n')                                               |

## ✅ RESOLVED (Latest Remediation Delta)

| ID             | What Was Closed                                                         | Exact File References                                                                                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C5             | `/api/providers/me/bids` ordering mismatch no longer blocks runtime     | `services/api/prisma/schema.prisma`, `services/api/src/routes/providers.ts`                                                                                                                                                                 |
| H9             | Bid status update route expanded beyond withdraw-only                   | `services/api/src/routes/bids.ts`                                                                                                                                                                                                           |
| M9             | CORS default now includes full local origin set                         | `services/api/src/config/env.ts`, `services/api/.env.example`                                                                                                                                                                               |
| M12            | `/me/*` provider flows now support authenticated provider context       | `services/api/src/routes/providers.ts`                                                                                                                                                                                                      |
| L1             | Map pin jitter removed (deterministic coordinates/uptime)               | `apps/console/app/map/page.tsx`                                                                                                                                                                                                             |
| L4             | Invalid WalletConnect demo fallback removed from deploy flow            | `apps/console/app/deploy/page.tsx`                                                                                                                                                                                                          |
| H10            | Provider wallet flow hardened (injected connector, no demo WC fallback) | `apps/provider-console/app/providers.tsx`                                                                                                                                                                                                   |
| API-Stats-Path | Website stats path mismatch fixed (`/api` prefix handling)              | `apps/website/src/layouts/MarketingLayout.astro`                                                                                                                                                                                            |
| API-Waitlist   | Waitlist persistence implemented end-to-end                             | `services/api/src/routes/waitlist.ts`, `services/api/src/index.ts`, `services/api/prisma/schema.prisma`, `services/api/prisma/migrations/20260314191000_add_waitlist_entry/migration.sql`, `apps/website/src/layouts/MarketingLayout.astro` |
| H6-Extended    | Deployment list counts now include leases as well as bids               | `services/api/src/routes/deployments.ts`                                                                                                                                                                                                    |
| Stats-Volume   | Lease creation now writes transactions for stats volume aggregation     | `services/api/src/routes/leases.ts`                                                                                                                                                                                                         |

---

## Current Open Issues (Canonical)

| ID  | Severity | Open Issue                                                         | Primary File(s)                                                         |
| --- | -------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| C6  | Critical | Chain client path is still not wired into the runtime request path | `services/api/src/routes/*`, `packages/chain-client`, `README.md`       |
| C8  | Critical | Chain `go test` flow is not green in this workspace baseline       | `chain/go.mod` and chain packages                                       |
| L6  | Low      | Provider console and console global CSS still duplicated           | `apps/provider-console/app/globals.css`, `apps/console/app/globals.css` |

---

## Archived Legacy Snapshot (Superseded)

The sections below are intentionally retained as historical context from earlier audit passes.
Do not use the entries below as current status; use `Current Open Issues (Canonical)` above.

## Executive Summary

The web stack has progressed significantly, but a repo-wide audit shows the remaining blockers are broader than the current frontend/API list. In addition to the known workflow gaps, setup automation still points developers at inconsistent ports, the provider bids route orders by a Prisma field that does not exist, root TypeScript validation is red because of contracts typing issues, and the Go chain is neither integrated into the runtime path nor currently buildable in this workspace.

**Current State**: core CRUD works in parts of the web demo, but developer setup, provider bid management, contracts validation, and chain validation are still not reliable end-to-end.

---

## 🔴 CRITICAL

### C1 — API Route Ordering Bug: `/me/*` Provider Routes Unreachable

- **File**: `services/api/src/routes/providers.ts`
- **Problem**: `GET /:id` is registered before `/me/stats`, `/me/leases`, `/me/bids`. Hono matches `/:id` first when the segment is `me`, so all `/me/*` routes return 404 "Provider not found".
- **Impact**: Provider dashboard stats, active leases, and bids list all fail silently. Provider console shows nothing.
- **Fix**: Move `/me/stats`, `/me/leases`, `/me/bids` registrations BEFORE `/:id` and `/:id/stats`.

### C2 — WebSocket Log Endpoint Doesn't Exist

- **File**: `services/api/src/index.ts` + `apps/console/app/deployments/[id]/page.tsx`
- **Problem**: Frontend connects to `ws://localhost:3001/ws/deployments/${id}/logs`. Only `/ws` (platform stats broadcast) is registered on the server. No per-deployment log stream exists.
- **Impact**: Deployment detail page always falls back to fake pre-scripted log messages every 2.2 seconds.
- **Fix**: Register a `GET /ws/deployments/:id/logs` WebSocket handler in the API.

### C3 — `GET /api/bids` Requires `deploymentId` but Provider Console Omits It

- **File**: `services/api/src/routes/bids.ts` line 8 + `apps/provider-console/app/page.tsx` line ~100
- **Problem**: The bids GET route has `deploymentId` as a required query param. Provider console calls `/api/bids` without it → always returns 400 validation error.
- **Impact**: Provider dashboard bids section always fails to load.
- **Fix**: Either make `deploymentId` optional in the GET route (add `providerId` filter instead), or query bids differently in the provider console.

### C4 — Verification Script Still Targets `localhost:3000`

- **File**: `verify.sh`
- **Problem**: `API_URL="http://localhost:3000"` conflicts with the API service default of port `3001`.
- **Impact**: `./verify.sh` reports API failures on a clean setup even when the API is running correctly.
- **Fix**: Default `verify.sh` to `3001` or derive its base URL from the same shared config as the startup scripts.

### C5 — `/api/providers/me/bids` Orders By Missing `Bid.createdAt`

- **Files**: `services/api/src/routes/providers.ts`, `services/api/prisma/schema.prisma`
- **Problem**: The provider bids query uses `orderBy: { createdAt: 'desc' }`, but the `Bid` model has no `createdAt` field.
- **Impact**: Provider bids can still fail at runtime even after the route-ordering fix.
- **Fix**: Add `createdAt` to `Bid` with a migration, or order by an existing field.

### C6 — Blockchain Path Is Not Wired Into the Runtime

- **Files**: `README.md`, `services/api/src/routes/*`, `packages/chain-client`, `pnpm-workspace.yaml`
- **Problem**: The architecture/docs present `@comnetish/chain-client` as part of the live product path, but the apps and API do not import it and marketplace state is persisted only in PostgreSQL.
- **Impact**: The advertised on-chain/decentralized workflow is not verifiable from the main product surface.
- **Fix**: Either wire real chain RPC/REST flows into the API/frontends, or explicitly document the chain as separate/optional.

### C7 — Root `pnpm typecheck` Fails in `contracts`

- **Files**: `contracts/scripts/deploy.ts`, `contracts/scripts/seed.ts`, `contracts/test/Marketplace.ts`
- **Problem**: Workspace typecheck currently fails on possibly-undefined signers and untyped `BaseContract` method calls such as `mint`, `approve`, `depositForLease`, `settleLease`, and `cancelLease`.
- **Impact**: Repo-wide TypeScript validation is red; contracts code blocks CI confidence for the whole workspace.
- **Fix**: Narrow signer types, use generated contract types, and avoid calling contract-specific methods through `BaseContract`.

### C8 — `chain/go test ./...` Fails Before Market Tests Run

- **Files**: `chain/go.mod` (dependency set), failing build output in transitive `github.com/bytedance/sonic/internal/rt/stubs.go`
- **Problem**: The current Go test run fails with `undefined: GoMapIterator`, which causes broad build failure across the chain packages.
- **Impact**: The chain cannot be regression-tested in the current workspace state.
- **Fix**: Pin a compatible Go toolchain/dependency set and document the required chain build environment.

---

## 🟠 HIGH

### H1 — Port Mismatch: Three Files Use `localhost:3000` Instead of `3001`

- **Files**:
  - `apps/console/app/page.tsx` line 8 — fallback `http://localhost:3000`
  - `apps/console/app/deployments/page.tsx` line 9 — fallback `http://localhost:3000`
  - `apps/provider-console/app/page.tsx` line 8 — fallback `http://localhost:3000`
- **Problem**: API server defaults to port `3001`. These three files use `3000` as fallback when `NEXT_PUBLIC_API_URL` is unset, causing all API calls to fail silently in local dev.
- **Fix**: Change fallback to `http://localhost:3001` in all three files.

### H2 — Bid Accept/Decline Buttons Are Stubs (No API Call)

- **File**: `apps/provider-console/app/page.tsx` lines 208–211
- **Problem**: Accept and Decline buttons only do `console.log('Accept bid', bid.id)`. No API call is made.
- **Also Missing**: No `PATCH /api/bids/:id` endpoint exists to accept/reject bids.
- **Impact**: Provider cannot accept or decline incoming tenant bids. Core provider workflow is broken.
- **Fix**: Add `PATCH /api/bids/:id` endpoint with `status` update, wire button to call it.

### H3 — `Badge` Used with Wrong Prop (`type=` instead of `variant=`)

- **Files**:
  - `apps/console/app/page.tsx` lines 114, 151
  - `apps/provider-console/app/page.tsx` line 137
- **Problem**: `Badge` component only accepts `variant?: BadgeVariant`. Using `type=` silently applies no styling — badges render unstyled.
- **Fix**: Change `type={...}` to `variant={...}` in all three locations.

### H4 — No Navigation Shell in Provider Console

- **File**: `apps/provider-console/app/layout.tsx`
- **Problem**: Provider console has no persistent navigation. Users can reach `/onboard` but cannot navigate back to the dashboard (`/`) without manually editing the URL.
- **Fix**: Add a nav header (or sidebar) to `provider-console/app/layout.tsx` with links to Dashboard and Onboard.

### H5 — `/deployments` Route Missing from Main Console Nav

- **File**: `apps/console/app/console-shell.tsx` lines 12–16
- **Problem**: The nav only has Dashboard, Provider Map, Deploy. There's no link to the `/deployments` list page.
- **Fix**: Add `{ href: '/deployments', label: 'Deployments' }` to `navItems`.

### H6 — Deployments List Always Shows 0 Bids Per Deployment

- **File**: `apps/console/app/deployments/page.tsx` + `services/api/src/routes/deployments.ts`
- **Problem**: The `GET /api/deployments` list endpoint doesn't include `bids` in the Prisma query. The frontend accesses `deployment.bids?.length ?? 0` — always 0.
- **Fix**: Add `include: { _count: { select: { bids: true } } }` to the list query, update frontend to use `deployment._count?.bids`.

### H7 — `isActive` Logic Wrongly Highlights "Deploy" When on `/deployments/:id`

- **File**: `apps/console/app/console-shell.tsx` line 23
- **Problem**: `isActive('/deploy')` returns true when `pathname.startsWith('/deployments/')`. User on a deployment detail page sees "Deploy" highlighted, not useful.
- **Fix**: Remove `|| pathname.startsWith('/deployments/')` from the Deploy active check.

### H8 — Setup Docs and Helper Scripts Still Advertise the Wrong Ports

- **Files**: `LOCAL_SETUP_GUIDE.md`, `QUICK_START.md`, `README_SETUP.md`, `SETUP_CHECKLIST.md`, `SCRIPTS_README.md`, `setup.sh`
- **Problem**: Many setup docs and helper messages still tell developers to hit the API on `3000` and the provider console on `3001`, while `start-services.sh` actually uses API `3001` and provider console `3002`.
- **Impact**: Local setup, curl verification, and multi-laptop instructions are misleading even before product bugs are hit.
- **Fix**: Standardize one port map across docs and scripts, ideally from shared env defaults.

### H9 — `PATCH /api/bids/:id` Only Supports Withdrawal

- **File**: `services/api/src/routes/bids.ts`
- **Problem**: The endpoint exists, but the request schema only accepts `LOST`, so it only supports withdrawing an open bid.
- **Impact**: There is still no accept/win path for the provider-side bid workflow.
- **Fix**: Define and implement full bid state transitions, then wire the UI to the supported actions.

### H10 — Provider Onboarding Ships an Invalid WalletConnect Fallback

- **File**: `apps/provider-console/app/onboard/page.tsx`
- **Problem**: The page falls back to `comnetish-demo-project-id`, which is not a valid WalletConnect Cloud project ID.
- **Impact**: Wallet connection fails unless the env var is configured manually.
- **Fix**: Require the env var and fail with explicit setup guidance when it is missing.

### H11 — Startup Automation Is macOS-Only

- **Files**: `start-services.sh`, `setup.sh`
- **Problem**: The startup path depends on `osascript` and Terminal.app automation, with no supported Linux/Windows fallback.
- **Impact**: The documented “one-command” start flow is not portable.
- **Fix**: Document the platform restriction prominently or add a cross-platform fallback (foreground, tmux, or task runner).

---

## 🟡 MEDIUM

### M1 — `Card` Used with Wrong Prop (`subtitle=` instead of `description=`)

- **Files**:
  - `apps/console/app/page.tsx` lines 98, 135
  - `apps/provider-console/app/page.tsx` lines 121, 191
- **Problem**: `Card` component only accepts `description?: ReactNode`. Using `subtitle=` silently discards the stat label (e.g., "3 running"). Cards show no sub-label.
- **Fix**: Change `subtitle={...}` to `description={...}` in all 4 usages.

### M2 — `statusVariant` Returns Invalid `'default'` BadgeVariant

- **File**: `apps/console/app/deployments/page.tsx` lines 45–49
- **Problem**: `BadgeVariant` is `'active' | 'pending' | 'error' | 'success'`. Returning `'default'` for CLOSED deployments causes undefined class lookup — badge renders broken.
- **Fix**: Change return value to `'error'` or `'success'` for CLOSED state.

### M3 — `?provider=` Query Param Never Read by Map or Deploy Pages

- **Files**:
  - `apps/console/app/map/page.tsx` — never reads `searchParams.get('provider')`
  - `apps/console/app/deploy/page.tsx` — never reads `searchParams.get('provider')`
- **Impact**: "View provider page" from deployment detail → map shows no pre-selection. "Deploy Here" from map → deploy page ignores pre-selected provider.
- **Fix**: Read `useSearchParams()` in both pages and apply pre-selection logic.

### M4 — Hardcoded Fake Cost Per Hour in Dashboard

- **File**: `apps/console/app/dashboard/page.tsx` line 346
- **Problem**: Cost is calculated as `((index + 1) * 0.83 + 1.2).toFixed(2)` — an index-based formula, not real pricing data.
- **Fix**: Use `deployment.pricePerBlock` (or sum from leases) to calculate actual cost per hour.

### M5 — "Close" Button in Dashboard Navigates Instead of Closing

- **File**: `apps/console/app/dashboard/page.tsx` line 372
- **Problem**: Button labeled "Close" calls `router.push('/deployments/${item.id}')` — it navigates to the detail page, doesn't close the deployment.
- **Fix**: Call `POST /api/deployments/:id/close` mutation or rename to "View" and navigate.

### M6 — Hardcoded CNT Wallet Balance in Deploy Page

- **File**: `apps/console/app/deploy/page.tsx` line 754
- **Problem**: `1,248.34 CNT` — never fetched from wallet or API. Always the same.
- **Fix**: Fetch balance from wallet provider (wagmi `useBalance` hook) or from API.

### M7 — Resource Usage Bars Are Hardcoded (65% / 42% / 28%)

- **File**: `apps/provider-console/app/page.tsx` lines 159, 168, 177
- **Problem**: Hardcoded `style={{ width: '65%' }}` etc. The `stats` API response contains real cpu/memory/storage values which aren't used.
- **Fix**: Calculate `width` from `stats.resources` values (e.g., `${(stats.cpu.used / stats.cpu.total) * 100}%`).

### M8 — Stale Closure in Deployment Log Fallback Timer

- **File**: `apps/console/app/deployments/[id]/page.tsx` lines 208–223
- **Problem**: `connectionState` is captured in `useEffect` at mount time and never updates. The check `if (connectionState === 'connected') return` never evaluates to true — fake logs fire even when WebSocket actually connects.
- **Fix**: Use a `useRef` for `connectionState` so the interval reads current value, or restructure the fallback to use a cleanup flag ref.

### M9 — CORS Defaults Still Miss One Local App Origin

- **File**: `services/api/src/config/env.ts` line 10
- **Problem**: `API_CORS_ORIGIN` currently defaults to `http://localhost:3000,http://localhost:3002`, which still omits the app when it is served from `3001`.
- **Fix**: Allow all documented local origins, e.g. `http://localhost:3000,http://localhost:3001,http://localhost:3002`.

### M10 — AI Agent Service Is Completely Stubbed

- **File**: `services/ai-agent/src/index.ts`
- **Problem**: `/inference` and `/batch` endpoints return `Processed: ${prompt.substring(0,100)}...` with `Math.floor(prompt.length / 4)` fake token counts. No Anthropic API key is set up. Service is disconnected from the main API (which calls Anthropic directly via `services/api/src/routes/ai.ts`).
- **Fix**: Either wire real Anthropic calls with API key, or clearly mark the service as a future integration point.

### M11 — Nested `QueryClientProvider` in 4 Pages

- **Files**: `dashboard/page.tsx`, `deploy/page.tsx`, `map/page.tsx`, `deployments/[id]/page.tsx`
- **Problem**: Each creates its own `QueryClient` and `QueryClientProvider`. The root layout already provides one. Inner providers create isolated cache instances — React Query cache deduplication and cross-page stale invalidation don't work.
- **Fix**: Remove inner `QueryClientProvider` wrappers. Use the layout-level provider (export only the `*Content` component, not wrapped in provider).

### M12 — `/api/providers/me/*` Has No Authentication

- **File**: `services/api/src/routes/providers.ts` lines 123–210
- **Problem**: `GET /me/stats`, `/me/leases`, `/me/bids` all do `findFirst({ where: { status: 'ACTIVE' } })` — returns the first active provider for everyone. Every provider sees the same data.
- **Fix**: Implement auth middleware (JWT or session) and filter by the authenticated provider's ID.

### M13 — SDL Storage Regex Is Broken

- **File**: `apps/console/app/deployments/[id]/page.tsx` line 397
- **Problem**: `parseSdlValue(deployment.sdl, 'storage:\n\\s*size')` — the double-escaped `\\s` creates a literal `\s` text token in the regex, not a whitespace class. Storage display always shows `N/A`.
- **Fix**: Change to a proper regex pattern or use a YAML parser to extract SDL fields.

### M14 — AI Route Joins SDL Instructions with Literal `\n` Text

- **File**: `services/api/src/routes/ai.ts` line 27
- **Problem**: `.join('\\n')` creates a string with literal `\n` characters (two chars: backslash + n), not actual newlines. Prompt sent to Claude has garbled formatting.
- **Fix**: Change `'\\n'` to `'\n'`.

### M15 — AI Agent Service Remains a Disconnected Stub

- **Files**: `services/ai-agent/src/index.ts`, `services/api/src/routes/ai.ts`
- **Problem**: The standalone AI agent still returns fake `Processed: ...` responses while the main API calls Anthropic directly.
- **Impact**: Service ownership is unclear and local demos can exercise the wrong integration path.
- **Fix**: Route the API through the AI agent, or explicitly document the AI agent as a mock/future service.

### M16 — Next.js Configs Still Exclude Shared Runtime Packages

- **Files**: `apps/console/next.config.mjs`, `apps/provider-console/next.config.mjs`
- **Problem**: Only `@comnetish/ui` is listed in `transpilePackages` even though the repo documents `@comnetish/chain-client` and `@comnetish/types` as shared runtime packages.
- **Impact**: Partial or future chain-client adoption can still fail at the Next.js package boundary.
- **Fix**: Add the shared client-side packages to `transpilePackages`, or document why they are intentionally excluded.

### M17 — Setup Guides Understate the Required Tool Versions

- **Files**: `LOCAL_SETUP_GUIDE.md`, `package.json`
- **Problem**: The guide says Node `18+` / pnpm `8+`, but the repo declares Node `>=20.0.0` and `pnpm@9.12.0`.
- **Impact**: Developers can begin from unsupported tooling and hit avoidable failures.
- **Fix**: Align all setup docs with the enforced engine and package manager versions.

### M18 — Chain Query Stringers Still Return Placeholder `TODO`

- **File**: `chain/x/market/query/types.go`
- **Problem**: `Order`, `Bid`, and `Lease` string methods all return `"TODO see deployment/query/types.go"`.
- **Impact**: Logs, CLI output, and debugging are not actionable when chain code does run.
- **Fix**: Implement real string formatting for the market query types.

### M19 — Market Close-Order Tests Are Still Skipped

- **File**: `chain/x/market/handler/handler_test.go`
- **Problem**: Three close-order tests are still `t.Skip("TODO CLOSE LEASE")`.
- **Impact**: Core order/lease close behavior remains unverified.
- **Fix**: Restore or rewrite the tests and make them pass in CI.

### M20 — Market Genesis Initialization Panics on Validation/State Errors

- **File**: `chain/x/market/genesis.go`
- **Problem**: Initialization uses repeated `panic(...)` calls on duplicate state and store write failures.
- **Impact**: Malformed genesis or migration issues crash the chain instead of surfacing controlled errors.
- **Fix**: Validate before mutating state or return richer errors through the init path.

---

## 🟢 LOW

### L1 — `Math.random()` in `hashToCoord` Causes Map Pin Jitter

- **File**: `apps/console/app/map/page.tsx` lines 92–94
- **Problem**: `hashToCoord` adds `Math.random() * 2` to lat/lng. Called inside `useMemo([providers, leases])`, so every data refresh recalculates coordinates with new random jitter — pins visibly jump.
- **Fix**: Remove `Math.random()` calls from `hashToCoord` to make positions deterministic.

### L2 — Hardcoded `comnetish.app` Domain for Live URL

- **File**: `apps/console/app/deployments/[id]/page.tsx` line 398
- **Problem**: `liveUrl = https://${deploymentId}.comnetish.app` — domain doesn't resolve in dev; subdomain scheme is assumed.
- **Fix**: Store actual endpoint URL in the lease/deployment record, display it from there.

### L3 — `transpilePackages` Missing `@comnetish/chain-client` in Next Configs

- **Files**: `apps/console/next.config.mjs`, `apps/provider-console/next.config.mjs`
- **Problem**: Only `@comnetish/ui` is in `transpilePackages`. If `chain-client` or `types` packages are imported in client components, Next.js may fail to process them.
- **Fix**: Add `@comnetish/chain-client` and `@comnetish/types` to `transpilePackages` as needed.

### L4 — WalletConnect Demo Project ID

- **File**: `apps/console/app/deploy/page.tsx` line 806
- **Problem**: `'comnetish-demo-project-id'` fallback is not a valid WalletConnect Cloud ID. WalletConnect modal will fail to initialize without a real ID.
- **Fix**: Document requirement in `.env.example`; at minimum display a clear error if ID is missing.

### L5 — Fake USDC Approval (No Contract Call)

- **File**: `apps/console/app/deploy/page.tsx` lines 741-744
- **Problem**: USDC approval just sets `setUsdApproved(true)` with no ERC-20 approve() transaction.
- **Impact**: Low for demo/dev; required for real blockchain testing.
- **Fix**: Implement wagmi `useContractWrite` call to ERC-20 approve, or clearly gate behind an `isDev` condition.

### L6 — Provider Console CSS Duplicated from Main Console

- **File**: `apps/provider-console/app/globals.css`
- **Problem**: Byte-for-byte copy of `apps/console/app/globals.css`. Any design change must be made twice.
- **Fix**: Move shared CSS to `packages/ui/src/globals.css` and import from both apps.

---

## ✅ Previously Completed (Verified)

- `POST /api/bids` endpoint — creates bids, validates deployment is OPEN, provider exists
- `POST /api/leases` endpoint — creates lease, auto-transitions deployment to ACTIVE
- Provider console `globals.css` — full design system (colors, shimmer, panel classes)
- Provider console `tailwind.config.ts` — brand theme, fonts
- Main console home `page.tsx` — data-driven stats cards and quick actions
- Provider console home `page.tsx` — fetches stats, leases, bids (with stubs noted above)
- Removed hardcoded wallet address from `dashboard/page.tsx`
- Deploy page now uses wagmi `useAccount()` for tenant address
- Provider registration mode default changed from `'mock'` to `'blockchain'`
- Enhanced seed data (5 providers, 4 deployments, 12 bids, 2 leases, 8 transactions)
- AI service basic endpoint structure (`/health`, `/models`, `/inference`, `/batch` — stubs)
- `GET /api/providers/me/stats` added — but unreachable due to C1 route ordering bug

---

## Fix Priority for E2E Testing

### ✅ Batches 1–3 — All Complete (16 fixes applied)

See the RESOLVED table above.

### Batch 4 — Required for Multi-Provider / Friend's Laptop Setup

1. **M9** — Fix CORS to allow multiple origins (`services/api/src/config/env.ts`)
2. **M12** — Add provider identity to `/me/*` routes (at min, `?address=` param support)
3. **C2** — Implement `/ws/deployments/:id/logs` WebSocket endpoint
4. **M8** — Fix stale `connectionState` closure in fallback log timer

### Batch 5 — Polish

5. **M3** — Read `?provider=` param in map and deploy pages
6. **M6** — Fetch real CNT wallet balance in deploy wizard
7. **L1** — Remove `Math.random()` from `hashToCoord`
8. **M11** — Remove nested `QueryClientProvider` from 4 pages

---

**Open Issues**: the earlier 14-item web audit is no longer exhaustive; the expanded findings above add setup, contracts, and chain blockers that still need triage.
