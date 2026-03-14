# Comnetish Marketplace Workflow — Current Gaps

**Last Updated**: 2026-03-14
**Status**: E2E testing NOT yet possible — critical blockers remain

---

## Workflow Status Map

```
┌─────────────────────────────────────────────────────────────────┐
│                         TENANT SIDE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. DEPLOYMENT CREATION                                          │
│     ├─ Tenant creates deployment (POST /api/deployments) ✅     │
│     ├─ Wallet address from wagmi useAccount() ✅                │
│     └─ Deployment created with OPEN status ✅                   │
│                                                                   │
│  2. WAIT FOR BIDS                                                │
│     ├─ GET /api/deployments list works ✅                       │
│     ├─ /deployments page loads data ✅                          │
│     ├─ ⚠️ Bids count always shows 0 (API doesn't include it)   │
│     └─ ⚠️ /deployments missing from nav (must know URL)        │
│                                                                   │
│  3. REVIEW BIDS                                                  │
│     ├─ GET /api/deployments/:id includes bids ✅                │
│     ├─ Deployment detail page renders ✅                        │
│     └─ ⚠️ Log stream is always fake (WS endpoint missing)      │
│                                                                   │
│  4. ACCEPT BID → CREATE LEASE                                    │
│     ├─ POST /api/leases works ✅                                │
│     ├─ Deployment auto-transitions to ACTIVE ✅                 │
│     └─ Transaction recorded ✅                                  │
│                                                                   │
│  5. MONITOR DEPLOYMENT                                           │
│     ├─ ❌ Log stream always fake (WS broken)                    │
│     ├─ ❌ CPU/Memory charts are random walk simulation          │
│     ├─ ❌ Live URL is hardcoded comnetish.app domain            │
│     └─ ⚠️ Storage always shows N/A (regex bug)                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

                            ⬆️  ⬇️
                (Marketplace matching + Blockchain)

┌─────────────────────────────────────────────────────────────────┐
│                      PROVIDER SIDE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. PROVIDER REGISTRATION                                        │
│     ├─ 4-step onboard wizard exists ✅                          │
│     ├─ `REGISTRATION_MODE` defaults to 'blockchain' ✅         │
│     ├─ wagmi hooks for transactions ✅                          │
│     └─ ⚠️ Dependency checks are simulated timeouts (not real)  │
│                                                                   │
│  2. NAVIGATE TO DASHBOARD                                        │
│     ├─ ❌ No navigation shell in provider console               │
│     └─ Must manually type URL to reach dashboard                 │
│                                                                   │
│  3. VIEW PROVIDER STATS                                          │
│     ├─ ⚠️ /me/stats returns first ACTIVE provider without auth  │
│     ├─ ⚠️ /me/leases returns first ACTIVE provider without auth │
│     └─ ❌ /me/bids can fail (orders by missing createdAt)       │
│                                                                   │
│  4. SUBMIT BID                                                   │
│     ├─ POST /api/bids endpoint exists ✅                        │
│     ├─ Validates deployment is OPEN ✅                          │
│     └─ Provider console has no "Submit Bid" UI (must use API)   │
│                                                                   │
│  5. MONITOR AND MANAGE BIDS/LEASES                              │
│     ├─ ⚠️ GET /api/bids requires explicit filters               │
│     ├─ ❌ GET /api/providers/me/bids can fail at runtime        │
│     ├─ ❌ Accept/Decline buttons are not a complete workflow    │
│     ├─ ⚠️ PATCH /api/bids/:id exists but only supports LOST    │
│     └─ ❌ Resource usage bars show hardcoded 65%/42%/28%        │
│                                                                   │
│  6. EARN REVENUE                                                 │
│     ├─ ⚠️ Transaction model in DB but no UI                    │
│     └─ Earnings calculation in stats (when route is fixed) ✅   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Endpoint Status

| Endpoint                   | Method    | Status         | Notes                                                         |
| -------------------------- | --------- | -------------- | ------------------------------------------------------------- |
| `/deployments`             | GET       | ✅ Works       | Missing bids count in response                                |
| `/deployments/:id`         | GET       | ✅ Works       | Includes bids and leases                                      |
| `/deployments`             | POST      | ✅ Works       |                                                               |
| `/deployments/:id/close`   | POST      | ✅ Works       |                                                               |
| `/bids`                    | GET       | ⚠️ Partial     | Requires at least one filter (`deploymentId` or `providerId`) |
| `/bids`                    | POST      | ✅ Works       | Validates deployment OPEN, provider exists                    |
| `/bids/:id`                | PATCH     | ⚠️ Partial     | Withdraw-only (`LOST`); no accept/win transition              |
| `/leases`                  | GET       | ✅ Works       | Optional filters                                              |
| `/leases`                  | POST      | ✅ Works       | Creates lease, transitions deployment                         |
| `/leases/:id/logs`         | GET (SSE) | ⚠️ Placeholder | 20 fake ticks then closes                                     |
| `/providers`               | GET       | ✅ Works       |                                                               |
| `/providers`               | POST      | ✅ Works       |                                                               |
| `/providers/:id`           | GET       | ✅ Works       |                                                               |
| `/providers/:id/stats`     | GET       | ✅ Works       |                                                               |
| `/providers/me/stats`      | GET       | ⚠️ Partial     | No auth; defaults to first ACTIVE provider                    |
| `/providers/me/leases`     | GET       | ⚠️ Partial     | No auth; defaults to first ACTIVE provider                    |
| `/providers/me/bids`       | GET       | ⚠️ Partial     | No auth + query orders by missing `Bid.createdAt`             |
| `/ws/deployments/:id/logs` | WS        | 🔴 MISSING     | Entire deployment log system relies on this                   |
| `/ai/generate-sdl`         | POST      | ✅ Works       | Real Anthropic integration                                    |
| `/stats`                   | GET       | ✅ Works       |                                                               |

---

## UI/UX Gaps

| Screen                           | Gap                                                               | Type           |
| -------------------------------- | ----------------------------------------------------------------- | -------------- |
| Main console — all pages         | No link to /deployments in nav                                    | Navigation     |
| Main console — deployments list  | Bids count always 0                                               | Data bug       |
| Main console — dashboard         | "Close" button navigates instead of closing                       | UX bug         |
| Main console — dashboard         | Fake index-based cost per hour                                    | Data bug       |
| Main console — deploy wizard     | Hardcoded 1,248.34 CNT balance                                    | Fake data      |
| Main console — deploy wizard     | USDC approval is a no-op                                          | Stub           |
| Main console — deployment detail | Logs are always fake                                              | Broken feature |
| Main console — deployment detail | CPU/Memory charts are random                                      | Fake data      |
| Main console — deployment detail | Storage always N/A                                                | Regex bug      |
| Main console — map               | Provider pins jump on refresh                                     | UX bug         |
| Main console — map               | ?provider= param ignored                                          | Broken nav     |
| Provider console — all pages     | No navigation header/sidebar                                      | Navigation     |
| Provider console — dashboard     | `/me` stats/leases are not provider-isolated; `/me/bids` can fail | Critical bug   |
| Provider console — dashboard     | Accept/Decline buttons do nothing                                 | Stub           |
| Provider console — dashboard     | Resource bars always 65%/42%/28%                                  | Fake data      |
| Both consoles — stat cards       | Badge renders unstyled (`type=` not `variant=`)                   | UI bug         |
| Both consoles — stat cards       | Card subtitle text invisible (`subtitle=` not `description=`)     | UI bug         |

---

## Blocker Chain for E2E Testing

```
Test: "Provider sees a bid and accepts it"
→ BLOCKED by: Provider UI actions are incomplete / inconsistent (H2)
→ BLOCKED by: PATCH /api/bids/:id only supports LOST, not accept/win (H9)
→ BLOCKED by: /api/providers/me/bids orders by missing Bid.createdAt field (C5)
→ BLOCKED by: /api/providers/me/bids/leases/stats can still return the wrong provider without auth (M12)

Test: "Tenant sees deployment logs"
→ BLOCKED by: WS endpoint /ws/deployments/:id/logs missing (C2)
→ Falls back to: Hardcoded fake messages

Test: "Provider navigates to dashboard after onboarding"
→ BLOCKED by: No navigation in provider console (H4)

Test: "New developer follows setup docs and runs verification"
→ BLOCKED by: `verify.sh` still targets API port 3000 while API defaults to 3001 (C4)
→ BLOCKED by: LOCAL_SETUP_GUIDE / QUICK_START / README_SETUP / SETUP_CHECKLIST still point curl examples at 3000 (H8)
→ BLOCKED by: setup/start scripts disagree on provider console port (H8)

Test: "Provider connects wallet during onboarding on a fresh machine"
→ BLOCKED by: `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` falls back to invalid `comnetish-demo-project-id` (H10)

Test: "Repo checks pass before a PR"
→ BLOCKED by: root `pnpm typecheck` fails in `contracts` (C7)
→ BLOCKED by: `cd chain && go test ./...` fails broadly before market tests run (C8)
```

---

## What Works End-to-End Today

```
TENANT:
1. Open main console
2. Click Deploy → fill wizard → deploy (POST /api/deployments) ✅
3. Navigate to /dashboard or /deployments manually ✅
4. Click deployment → accept bid → create lease ✅

PROVIDER:
1. Submit bid via curl/API client (no UI exists for this yet)
2. Check provider stats via: GET /api/providers/{actual-id}/stats ✅
   (Note: `/me/stats` is unauthenticated and not provider-isolated, so `/providers/{id}/stats` is the only reliable path today)

BLOCKCHAIN / CONTRACTS:
1. Contracts compile path is not currently validated by root `pnpm typecheck` ❌
2. Chain path is documented as optional, but not wired into the API/frontends ❌
3. `go test ./...` in `chain/` currently fails in the present workspace state ❌
```

---

## Required Before Friend's Laptop / Multi-Provider Testing

1. Fix M12 (auth on /me/\* routes) — both providers need separate data
2. Fix C5 (`Bid.createdAt` mismatch) — `/me/bids` should not crash
3. Fix M9 (CORS) — friend's machine will have different origin
4. Friend's machine needs: API URL env var, database access or its own DB
5. Consider Docker Compose setup for isolated multi-node testing
6. Fix the setup/verification docs to agree on the actual API/provider-console ports (C4, H8)
7. Provide a real WalletConnect project ID for provider onboarding (H10)
8. Decide whether the multi-laptop demo depends on real chain integration or the current PostgreSQL-only path (C6)

---

## Expanded Repo-Wide Audit

### Setup and Validation Gaps

- `verify.sh` still targets `http://localhost:3000` even though the API defaults to `3001`
- `LOCAL_SETUP_GUIDE.md`, `QUICK_START.md`, `README_SETUP.md`, `SETUP_CHECKLIST.md`, and `SCRIPTS_README.md` still send users to stale API URLs
- `setup.sh` helper text disagrees with `start-services.sh` about where services come up
- `start-services.sh` is macOS-only because it depends on `osascript`
- Setup docs still advertise Node `18+` / pnpm `8+` even though the repo requires Node `>=20` and pnpm `9.12.0`

### Contracts and Chain Gaps

- Root `pnpm typecheck` currently fails in `contracts`, so repo-wide TypeScript validation is not green
- `cd chain && go test ./...` currently fails early in a transitive dependency (`github.com/bytedance/sonic/internal/rt`) and does not reach meaningful market regression coverage
- `chain/x/market/query/types.go` still returns placeholder `TODO` strings for market objects
- `chain/x/market/handler/handler_test.go` still skips close-order tests with `TODO CLOSE LEASE`
- `chain/x/market/genesis.go` still panics on duplicate state/store failures instead of surfacing controlled errors

### Architecture Gap

- The repo docs expose `@comnetish/chain-client` and chain env vars as part of the product story, but the current apps/API runtime still executes marketplace flows entirely against PostgreSQL
- Until the chain path is actually wired in, the product should be treated as a hybrid demo with optional blockchain artifacts, not a fully integrated on-chain workflow

---

**Generated**: 2026-03-14
