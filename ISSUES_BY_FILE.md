# Issues by File — Quick Reference

**Last Updated**: 2026-03-14
**Format**: File → Issues with line numbers, severity, and fix notes

---

## API Routes

### `services/api/src/routes/providers.ts`

- **🟡 M12** — `/me/*` routes return first active provider for everyone (no auth)
  - Lines: 123–210 (`findFirst({ where: { status: 'ACTIVE' } })`)
  - Fix: Filter by authenticated provider from request context

- **🔴 C5** — `/me/bids` orders by `createdAt`, but the `Bid` model has no such field
  - Lines: ~170–185
  - Endpoint can fail at runtime until `Bid.createdAt` exists or the ordering changes

---

### `services/api/src/routes/bids.ts`

- **🟠 H9** — `PATCH /api/bids/:id` only supports withdrawal
  - Lines: ~14–17, ~76–95
  - The schema only accepts `LOST`, so there is still no accept/win transition for provider-side bid management

---

### `services/api/src/routes/deployments.ts`

- **🟠 H6** — List response doesn't include bids count
  - Line: ~20 (Prisma findMany query)
  - Frontend shows `deployment.bids?.length` but `bids` is not in the response → always 0
  - Fix: Add `_count: { select: { bids: true } }` to Prisma query

---

### `services/api/src/routes/ai.ts`

- **🟡 M14** — `join('\\n')` sends literal `\n` text instead of newlines to Claude
  - Line: ~27
  - Fix: Change `'\\n'` to `'\n'`

---

### `services/api/src/index.ts`

- **🔴 C2** — No `/ws/deployments/:id/logs` WebSocket endpoint
  - Only `/ws` exists (platform stats broadcast)
  - Deployment detail page always falls back to fake log stream
  - Fix: Add per-deployment WS handler

---

### `services/api/src/config/env.ts`

- **🟡 M9** — CORS default omits one documented local app origin
  - Line: ~10
  - Current default is `http://localhost:3000,http://localhost:3002`, so the app served from `3001` can still be CORS-blocked
  - Fix: Default to the full local origin set, including `3001`

---

### `services/ai-agent/src/index.ts`

- **🟡 M10** — `/inference` and `/batch` are stubs, no real AI calls
  - Lines: entire file (~30-60)
  - Returns `Processed: ${prompt.substring(0,100)}...` — no Anthropic API calls
  - Service is disconnected from main API (main API calls Anthropic directly)

---

## Console App

### `apps/console/app/page.tsx`

- **🟠 H1** — Wrong API port fallback (`localhost:3000` not `3001`)
  - Line: 8
  - Fix: Change to `http://localhost:3001`

- **🟠 H3** — `Badge type=` should be `variant=`
  - Lines: ~114, ~151
  - Fix: Rename prop to `variant`

- **🟡 M1** — `Card subtitle=` should be `description=`
  - Lines: ~98, ~135
  - Fix: Rename prop to `description`

---

### `apps/console/app/dashboard/page.tsx`

- **🟡 M4** — Fake cost per hour: `((index + 1) * 0.83 + 1.2).toFixed(2)`
  - Line: ~346
  - Math formula based on array index, not real pricing
  - Fix: Use `deployment.pricePerBlock` from API data

- **🟡 M5** — "Close" button navigates to deployment detail instead of closing
  - Line: ~372
  - Code: `router.push('/deployments/${item.id}')` — wrong action for a "Close" label
  - Fix: Call close mutation or rename button to "View"

---

### `apps/console/app/deploy/page.tsx`

- **🟡 M6** — Hardcoded CNT wallet balance `1,248.34 CNT`
  - Line: ~754
  - Fix: Use wagmi `useBalance` hook to fetch real balance

- **🟢 L4** — WalletConnect demo project ID fallback
  - Line: ~806
  - `'comnetish-demo-project-id'` is invalid; WalletConnect will fail
  - Fix: Require env var, log clear error if missing

- **🟢 L5** — Fake USDC approval (`setUsdApproved(true)` only)
  - Lines: ~741–744
  - No ERC-20 `approve()` transaction

---

### `apps/console/app/deployments/page.tsx`

- **🟠 H1** — Wrong API port fallback (`localhost:3000` not `3001`)
  - Line: 9
  - Fix: Change to `http://localhost:3001`

- **🟠 H6** — Bids count always 0 (not included in API response)
  - Line: `deployment.bids?.length ?? 0`
  - Fix: Fix API response, update frontend to use `_count.bids`

- **🟡 M2** — `statusVariant` returns invalid `'default'` for CLOSED deployments
  - Lines: ~45–49
  - `'default'` is not a valid `BadgeVariant` — badge renders broken
  - Fix: Return `'error'` for CLOSED state

---

### `apps/console/app/deployments/[id]/page.tsx`

- **🔴 C2** — WebSocket connects to non-existent endpoint
  - Line: ~155
  - `ws://localhost:3001/ws/deployments/${deploymentId}/logs` never served
  - Always falls back to fake logs

- **🟡 M8** — Stale `connectionState` closure in fallback log interval
  - Lines: ~208–223
  - `connectionState` is captured at mount, never reads updates
  - `if (connectionState === 'connected') return` never true → fake logs emit always
  - Fix: Use `ref` to track connection state inside interval

- **🟡 M13** — SDL storage regex always returns `N/A`
  - Line: ~397
  - `parseSdlValue(sdl, 'storage:\n\\s*size')` — `\\s` is literal text not regex whitespace
  - Fix: Use proper regex or YAML parser

- **🟡 M3** — `?provider=` query param from links is never consumed
  - Line: ~398 (outgoing link to `/map?provider=...`)
  - Map page doesn't read this param → no pre-selection

- **🟢 L2** — Hardcoded `comnetish.app` domain for live URL
  - Line: ~398
  - `https://${deploymentId}.comnetish.app` — won't resolve in dev
  - Fix: Store real endpoint in DB and display from there

---

### `apps/console/app/map/page.tsx`

- **🟡 M3** — Never reads `?provider=` query param from deployment detail links
  - Map shows no pre-selected provider when navigating from deployment detail

- **🟡 M3** — "Deploy Here" appends `?provider=` but deploy page never reads it
  - Line: ~480

- **🟢 L1** — `Math.random()` in `hashToCoord` causes pin jitter on refresh
  - Lines: ~92–94
  - Every data refetch recalculates positions with new random values → pins jump
  - Fix: Remove `Math.random()` calls

---

### `apps/console/app/console-shell.tsx`

- **🟠 H5** — `/deployments` route missing from nav
  - Lines: ~12–16
  - `navItems` has Dashboard, Provider Map, Deploy — no Deployments list link
  - Fix: Add `{ href: '/deployments', label: 'Deployments' }` to navItems

- **🟠 H7** — `isActive` wrongly highlights "Deploy" on `/deployments/:id`
  - Line: ~23
  - Logic: `pathname.startsWith('/deployments/')` included in Deploy check
  - Fix: Remove that check

---

## Provider Console App

### `apps/provider-console/app/page.tsx`

- **🔴 C3** — Bids query sends no `deploymentId` → always 400 error
  - Line: ~100 (query to `/api/bids`)
  - Fix: API route change (see `bids.ts` C3)

- **🟠 H1** — Wrong API port fallback (`localhost:3000` not `3001`)
  - Line: 8
  - Fix: Change to `http://localhost:3001`

- **🟠 H2** — Accept/Decline bid buttons are stubs
  - Lines: ~208–211
  - `onClick={() => console.log('Accept bid', bid.id)}` — no API call
  - Fix: Call `PATCH /api/bids/:id` with `{ status: 'ACCEPTED' | 'REJECTED' }`

- **🟠 H3** — `Badge type=` should be `variant=`
  - Line: ~137
  - Fix: Rename prop to `variant`

- **🟡 M1** — `Card subtitle=` should be `description=`
  - Lines: ~121, ~191
  - Fix: Rename prop to `description`

- **🟡 M7** — Resource usage bars hardcoded at 65% / 42% / 28%
  - Lines: ~159, ~168, ~177
  - `stats` API response has real values that are ignored
  - Fix: Calculate width from `stats.resources` data

---

### `apps/provider-console/app/layout.tsx`

- **🟠 H4** — No navigation shell/header
  - Provider console has no way to navigate between pages
  - Fix: Add nav component with links to `/` (Dashboard) and `/onboard`

---

### `apps/provider-console/app/globals.css`

- **🟢 L6** — Byte-for-byte duplicate of `apps/console/app/globals.css`
  - Design changes must be applied in two places
  - Fix: Extract to `packages/ui/src/globals.css`

---

### `apps/provider-console/app/onboard/page.tsx`

- Dependency checks simulate with `setTimeout` delays — no real system detection
- Onboard step 3 will always fail in browser context for Docker check (CORS + non-browser ports)

---

## Packages

### `apps/console/next.config.mjs` + `apps/provider-console/next.config.mjs`

- **🟢 L3** — `transpilePackages` only lists `@comnetish/ui`
  - `@comnetish/chain-client` and `@comnetish/types` may need to be added if used client-side

## Setup and Tooling

### `verify.sh`

- **🔴 C4** — Verification script targets `http://localhost:3000`
  - Line: ~25
  - Conflicts with API default `3001`; `./verify.sh` fails against the wrong port on a clean setup

### `LOCAL_SETUP_GUIDE.md`

- **🟠 H8** — API startup and curl examples still use `3000`
  - Lines: ~128, ~172, ~188, ~214
  - Conflicts with `services/api/src/config/env.ts` default `3001` and `start-services.sh`

- **🟡 M17** — Prerequisites say Node `18+` and pnpm `8+`
  - Lines: ~12, ~15
  - Repo root requires Node `>=20.0.0` and `pnpm@9.12.0`

### `QUICK_START.md`

- **🟠 H8** — Quick-start API commands and verification still point to `3000`
  - Lines: ~36, ~73, ~83, ~99
  - Users can follow the guide exactly and still miss the running API

### `README_SETUP.md`

- **🟠 H8** — Setup reference documents API on `3000` as the default live port
  - Multiple lines: ~98, ~147, ~228, ~287, ~309
  - Conflicts with `start-services.sh` and API env defaults

### `SETUP_CHECKLIST.md`

- **🟠 H8** — Setup checklist still verifies the API on `3000`
  - Multiple lines: ~84, ~126, ~177–210, ~298, ~378
  - Verification checklist is stale relative to the current startup script/defaults

### `SCRIPTS_README.md`

- **🟠 H8** — Script docs describe API on `3000` and provider console on `3001`
  - Multiple lines: ~82, ~116, ~124–126, ~205, ~233, ~381
  - The current `start-services.sh` launches API on `3001` and provider console on `3002`

### `setup.sh`

- **🟠 H8** — `--start-services` output still announces API `3000` and provider console `3001`
  - Lines: ~334, ~344, ~349, ~357–358, ~395, ~401
  - Helper output is inconsistent with `start-services.sh`

- **🟠 H11** — Startup path is tied to `osascript`
  - Lines: ~335, ~340, ~345, ~350
  - Cross-platform users do not get a supported alternative

### `start-services.sh`

- **🟠 H11** — Service automation is macOS-only
  - Lines: ~11–14, ~84, ~89, ~94, ~99
  - Uses AppleScript/Terminal automation with no Linux/Windows fallback

- **🟠 H8** — Actual startup ports differ from the docs
  - Lines: ~28, ~30–31
  - API uses `3001`, main console `3000`, provider console `3002`

### `README.md`

- **🔴 C6** — Architecture implies `packages/chain-client` is part of the live app path
  - Lines: ~18–24, ~235, ~255
  - Repo docs expose chain env vars and chain-client, but the apps/API do not actually use that path at runtime

## Additional API and App Findings

### `services/api/prisma/schema.prisma`

- **🔴 C5** — `Bid` model has no `createdAt`, but provider bids query orders by it
  - Lines: ~42–57
  - Runtime mismatch with `providers.ts` → `/api/providers/me/bids` can fail when queried

### `services/api/src/routes/bids.ts`

- **🟠 H9** — `PATCH /api/bids/:id` only accepts `LOST`
  - Lines: ~14–17, ~76–95
  - Endpoint supports bid withdrawal only; it does not implement accept/win transitions

### `apps/provider-console/app/onboard/page.tsx`

- **🟠 H10** — Invalid WalletConnect fallback project ID
  - Line: ~1252
  - `comnetish-demo-project-id` is not usable; onboarding wallet connection depends on manual env setup

## Contracts and Chain

### `contracts/scripts/deploy.ts`

- **🔴 C7** — Root typecheck fails because `deployer` may be `undefined`
  - Lines: ~14, ~18, ~24, ~29, ~34
  - Contract deployment script is not type-safe under the repo's current checks

### `contracts/scripts/seed.ts`

- **🔴 C7** — Root typecheck fails on signer narrowing and contract method typing
  - Lines: ~41–43
  - Calls like `cnt.connect(deployer).mint(...)` and `usdc.connect(deployer).mint(...)` are unresolved on `BaseContract`

### `contracts/test/Marketplace.ts`

- **🔴 C7** — Contract tests fail workspace typecheck on undefined signers and untyped methods
  - Lines: ~14, ~18, ~27, ~29, ~40–43, ~56–59, ~70–75
  - `mint`, `approve`, `depositForLease`, `settleLease`, and `cancelLease` are invoked through untyped contract instances

### `chain/x/market/query/types.go`

- **🟡 M18** — Market query stringers still return `TODO`
  - Lines: ~24, ~81–103
  - `Order`, `Bid`, and `Lease` string output is stubbed

### `chain/x/market/handler/handler_test.go`

- **🟡 M19** — Close-order tests are skipped with `TODO CLOSE LEASE`
  - Lines: ~1134, ~1147, ~1161
  - Core close-order behavior is still not covered by the suite

### `chain/x/market/genesis.go`

- **🟡 M20** — Genesis init panics on duplicate state/store errors
  - Lines: ~37–74
  - Initialization aborts the chain instead of surfacing recoverable validation failures

## Command-Level Failures

### `pnpm typecheck`

- **🔴 C7** — Root workspace typecheck is currently red
  - Verified 2026-03-14
  - Fails in `@comnetish/contracts` from `contracts/scripts/deploy.ts`, `contracts/scripts/seed.ts`, and `contracts/test/Marketplace.ts`

### `cd chain && go test ./...`

- **🔴 C8** — Chain test/build pass is currently broken
  - Verified 2026-03-14
  - Fails early in transitive dependency `github.com/bytedance/sonic/internal/rt/stubs.go` with `undefined: GoMapIterator`, then cascades across most chain packages

---

## Quick Fix Order for E2E

| Priority | Fix                                      | File                                      | ID  |
| -------- | ---------------------------------------- | ----------------------------------------- | --- |
| 1        | Move `/me/*` routes before `/:id`        | `providers.ts`                            | C1  |
| 2        | Make `deploymentId` optional in bids GET | `bids.ts`                                 | C3  |
| 3        | Fix port 3000→3001 in 3 files            | `page.tsx` (×3)                           | H1  |
| 4        | Add `PATCH /api/bids/:id` + wire buttons | `bids.ts` + `provider-console/page.tsx`   | H2  |
| 5        | Fix Badge `type=` → `variant=`           | 3 files                                   | H3  |
| 6        | Add `/deployments` to nav                | `console-shell.tsx`                       | H5  |
| 7        | Fix isActive Deploy highlight            | `console-shell.tsx`                       | H7  |
| 8        | Include bids count in deployments list   | `deployments.ts` + `deployments/page.tsx` | H6  |
| 9        | Add nav to provider console              | `provider-console/layout.tsx`             | H4  |
| 10       | Fix Card `subtitle=` → `description=`    | 4 usages                                  | M1  |
| 11       | Fix fake cost per hour                   | `dashboard/page.tsx`                      | M4  |
| 12       | Fix "Close" button action                | `dashboard/page.tsx`                      | M5  |
| 13       | Wire resource bars to real data          | `provider-console/page.tsx`               | M7  |
| 14       | Fix statusVariant `'default'`            | `deployments/page.tsx`                    | M2  |
| 15       | Fix `join('\\n')` in AI route            | `ai.ts`                                   | M14 |

---

**Total Open Issues**: the earlier quick-fix total is now incomplete; the expanded audit adds setup, contracts, and chain findings on top of the original web/API list.
