# Comnetish — Architecture Overview

> **Purpose:** Reference document covering every layer of the system, what is real vs stub, what is wired vs placeholder, and the intended end-state design.

---

## Table of Contents

1. [System Layers at a Glance](#1-system-layers-at-a-glance)
2. [Honest Status — Real vs Stub](#2-honest-status--real-vs-stub)
3. [Layer 1 — Cosmos / App Chain](#3-layer-1--cosmos--app-chain)
4. [Layer 2 — EVM Smart Contracts](#4-layer-2--evm-smart-contracts)
5. [Layer 3 — Off-chain API Service](#5-layer-3--off-chain-api-service)
6. [Layer 4 — Tenant Console (apps/console)](#6-layer-4--tenant-console-appsconsole)
7. [Layer 5 — Provider Console (apps/provider-console)](#7-layer-5--provider-console-appsprovider-console)
8. [Layer 6 — Chain Client Package](#8-layer-6--chain-client-package)
9. [Layer 7 — Provider Node Service](#9-layer-7--provider-node-service)
10. [Cross-Layer Data Flow](#10-cross-layer-data-flow)
11. [What Needs to Be Built](#11-what-needs-to-be-built)

---

## 1. System Layers at a Glance

```
┌──────────────────────────────────────────────────────────────────┐
│  TENANT (Browser)               PROVIDER (Server / CLI)          │
│  apps/console (port 3000)       apps/provider-console (3002)     │
│       │                                     │                    │
│       │  REST / WS                          │  REST / WS         │
│       ▼                                     ▼                    │
│  ┌─────────────────────────────────────────────────┐             │
│  │           Off-chain API  (services/api, 3001)    │             │
│  │  Hono + Bun + PostgreSQL (Prisma)                │             │
│  └───────────────┬──────────────────────┬───────────┘             │
│                  │                      │                         │
│         CosmJS calls              viem  calls                    │
│                  │                      │                         │
│  ┌───────────────▼──────┐  ┌────────────▼────────┐               │
│  │  Cosmos App Chain    │  │  EVM (Hardhat/local) │               │
│  │  (chain/ dir)        │  │  CNTToken.sol        │               │
│  │  port 26657 / 1317   │  │  PaymentEscrow.sol   │               │
│  │  7 custom modules    │  │  Marketplace.sol     │               │
│  └──────────────────────┘  └─────────────────────┘               │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Provider Node  (provider/ Go service)                   │    │
│  │  Kubernetes / containerd workload orchestration          │    │
│  │  Receives manifests, runs containers, reports status     │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Honest Status — Real vs Stub

| Component                        | File(s)                                  | Status               | Notes                                                                                               |
| -------------------------------- | ---------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| Cosmos chain — `x/deployment`    | `chain/x/deployment/`                    | ✅ Real              | Full keeper, msgs, events, genesis                                                                  |
| Cosmos chain — `x/market`        | `chain/x/market/`                        | ✅ Real              | Bid/lease lifecycle, order matching                                                                 |
| Cosmos chain — `x/escrow`        | `chain/x/escrow/`                        | ✅ Real              | ucnt escrow, authz wired                                                                            |
| Cosmos chain — `x/provider`      | `chain/x/provider/`                      | ✅ Real              | Provider reg, attributes                                                                            |
| Cosmos chain — `x/audit`         | `chain/x/audit/`                         | ✅ Real              | Attestation                                                                                         |
| Cosmos chain — `x/cert`          | `chain/x/cert/`                          | ✅ Real              | TLS cert management                                                                                 |
| Cosmos chain — `x/take`          | `chain/x/take/`                          | ✅ Real              | Fee/revenue                                                                                         |
| EVM — `CNTToken.sol`             | `contracts/src/CNTToken.sol`             | ✅ Real              | Hand-rolled ERC-20, mintable                                                                        |
| EVM — `PaymentEscrow.sol`        | `contracts/src/PaymentEscrow.sol`        | ✅ Real              | Full escrow state machine (USDC today → CNT target)                                                 |
| EVM — `Marketplace.sol`          | `contracts/contracts/Marketplace.sol`    | ❌ Stub              | One constant. No logic.                                                                             |
| chain-client package             | `packages/chain-client/`                 | ⚠️ Partial           | Real @cosmjs wiring, BUT messages are JSON-encoded not protobuf                                     |
| Off-chain API — auth             | `services/api/src/routes/auth.ts`        | ✅ Real              | Email, OAuth, SIWE, sessions, JWT                                                                   |
| Off-chain API — deployments      | `services/api/src/routes/deployments.ts` | ✅ Real              | CRUD + close, RBAC                                                                                  |
| Off-chain API — providers        | `services/api/src/routes/providers.ts`   | ✅ Real              | Upsert, SIWE auth, stats, bids, leases                                                              |
| Off-chain API — billing          | (missing)                                | ❌ Missing           | `Transaction` model exists but no route                                                             |
| On-chain wiring in deploy wizard | `apps/console/app/deploy/page.tsx`       | ⚠️ Partial           | USDC `approve()` shown; `launchMutation` only calls REST API, not `PaymentEscrow.depositForLease()` |
| Provider node binary             | `provider/`                              | ✅ Real (Akash fork) | Full Go provider with cluster/gateway/bidengine                                                     |
| File transfer (manifest)         | `provider/gateway/`                      | ✅ Real              | mTLS manifest endpoint                                                                              |
| WebSocket logs                   | `services/api/src/index.ts`              | ⚠️ Partial           | Route registered; real log piping from provider node not implemented                                |

---

## 3. Layer 1 — Cosmos / App Chain

**Location:** `chain/`  
**Module:** `pkg.akt.dev/node` (Akash-network fork, comnetish-branded)  
**Runtime:** CometBFT v0.38 (fork), Cosmos SDK v0.53 (fork)  
**Native token:** `ucnt` (1 CNT = 1,000,000 ucnt)  
**Chain ID:** `comnetish-1`  
**Ports:** RPC `26657`, REST `1317`, gRPC `9090`

### Custom Modules

#### `x/deployment`

On-chain representation of a compute deployment.

- State machine: `OPEN → ACTIVE → CLOSED`
- Stored: SDL hash, owner address, deployment groups, resource requirements
- Key messages: `MsgCreateDeployment`, `MsgDepositDeployment`, `MsgCloseDeployment`, `MsgUpdateDeployment`
- Interacts with: escrow (locks funds), market (creates orders)

#### `x/market`

Bid and lease marketplace.

- When a deployment is OPEN, the module broadcasts an `Order`
- Providers pick up orders, submit `MsgCreateBid` with price
- Tenant accepts a bid via `MsgCreateLease`
- A lease ties a specific provider to a deployment; escrow drawdown begins
- Key messages: `MsgCreateBid`, `MsgCloseBid`, `MsgCreateLease`, `MsgCloseOrder`, `MsgCloseLease`

#### `x/escrow`

Payment rails for active leases.

- `ucnt` locked on deployment creation
- Streaming payment: per-block amount deducted from escrow to provider
- If escrow runs dry → lease auto-closes (provider may stop serving)
- Tenant can `DepositEscrow` to top up

#### `x/provider`

Provider identity and attributes on-chain.

- Providers register with: address, host URI, auditor attributes (GPU, CPU, region)
- Auditors (trusted third parties) attest attributes via `x/audit`

#### `x/cert`

TLS certificate chain.

- Providers and tenants publish self-signed TLS certs on-chain
- When tenant sends a manifest to a provider, mTLS handshake validates both certs against chain state
- Prevents man-in-the-middle attacks

#### `x/audit` / `x/take`

- `audit`: Auditor attestation of provider attributes (trust marks)
- `take`: Protocol fee on lease payments (configurable %)

---

## 4. Layer 2 — EVM Smart Contracts

**Location:** `contracts/`  
**Network today:** Local Hardhat only  
**Deployed addresses (local):**

```
CNTToken:       0x5FbDB2315678afecb367f032d93F642f64180aa3
PaymentEscrow:  0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
```

> See [PAYMENT_AND_BILLING.md](./PAYMENT_AND_BILLING.md) for the full plan to replace USDC with CNT.

### CNTToken.sol

Standard ERC-20 with owner-controlled minting. This **is** the platform token.

- Symbol: CNT, Decimals: 18
- Mintable by owner (bridge/faucet contract in production)
- Deployed as a sidecar to enable EVM-native tooling (MetaMask, wallets, exchanges)

### PaymentEscrow.sol

Full escrow for compute leases.

- `depositForLease(leaseId, provider, amount, maxDuration)` — tenant locks CNT
- `markLeaseStarted(leaseId)` — oracle signals provider started the workload
- `settleLease(leaseId)` — releases CNT to provider
- `cancelLease(leaseId)` — 5-minute cancellation window for tenants
- Currently hardcoded to accept USDC token address → **must be updated to accept CNT**

### Marketplace.sol (stub)

Currently a no-op. Long-term design options:

1. Keep marketplace logic fully on Cosmos chain (x/market) — EVM marketplace stays stub
2. Implement EVM Marketplace for EVM-native tenants who want MetaMask-driven deployments
3. Hybrid: EVM Marketplace emits events that a bridge relayer picks up to create Cosmos deployments

---

## 5. Layer 3 — Off-chain API Service

**Location:** `services/api/`  
**Runtime:** Bun  
**Framework:** Hono  
**Database:** PostgreSQL via Prisma  
**Port:** 3001

> The API is the coordination layer. It does **not** submit on-chain transactions — it is off-chain state only, acting as a cache and UX accelerator on top of the chain.

### What the API does

- Authenticates users (email/password, OAuth, SIWE wallet sign-in)
- Stores deployments, bids, leases in Postgres as a read-optimized cache
- Serves REST to frontends; the chain is the source of truth
- Broadcasts WebSocket events to frontends for real-time updates
- Provides the mock "launch" endpoint that currently stands in for on-chain broadcast

### What the API does NOT do yet

- It does not call the Cosmos RPC to broadcast `MsgCreateDeployment`
- It does not call `PaymentEscrow.depositForLease()` on behalf of any user
- The `Transaction` table exists but no route writes to it

### Database Schema Summary

See `services/api/prisma/schema.prisma` for full schema.  
Key models: `User`, `LinkedWallet`, `Session`, `Provider`, `Deployment`, `Bid`, `Lease`, `Transaction`.

---

## 6. Layer 4 — Tenant Console (apps/console)

**Location:** `apps/console/`  
**Framework:** Next.js 14 App Router  
**Port:** 3000

Key pages:

- `/` — Landing / dashboard
- `/deploy` — 3-step deployment wizard (SDL → Provider → Review & Pay → Launch)
- `/deployments/:id` — Deployment detail, status, logs
- `/map` — Network map of active providers

**Current deploy flow gaps:**

1. `launchMutation` calls `POST /api/deployments` (REST only)
2. The `approve()` call for USDC shown in Step 3 is not followed by `depositForLease()`
3. No Cosmos transaction is broadcast from the browser
4. See [DEPLOYMENT_LIFECYCLE.md](./DEPLOYMENT_LIFECYCLE.md) for the correct end-state flow

---

## 7. Layer 5 — Provider Console (apps/provider-console)

**Location:** `apps/provider-console/`  
**Framework:** Next.js 14 App Router  
**Port:** 3002

Key pages:

- `/` — Dashboard (earnings, active leases, bids)
- `/onboard` — Provider onboarding wizard (registers on-chain identity)
- `/leases` — Active and historical leases
- `/bids` — Incoming bids from deployments

**Current gaps:**

1. Onboarding does not submit a real `MsgCreateProvider` Cosmos transaction
2. Provider heartbeat / status updates go to API REST only, not on-chain attributes

---

## 8. Layer 6 — Chain Client Package

**Location:** `packages/chain-client/`  
**Package:** `@comnetish/chain-client`  
**Dependencies:** `@cosmjs/proto-signing`, `@cosmjs/stargate`

Wraps the Cosmos chain with a TypeScript SDK usable from Next.js or Node.js.

**Critical known issue:** Messages are currently encoded as `JSON.stringify()` bytes instead of proper protobuf. This works in mock/test mode but will fail against a real Cosmos node. Fix required:

1. Generate TypeScript protobuf types from `chain/proto/` using `buf` or `ts-proto`
2. Replace `textEncoder.encode(JSON.stringify(msg))` with `MsgCreateDeployment.encode(msg).finish()`

Mock mode (`mock: true`) returns hard-coded fake hashes — useful for UI development without a running chain.

---

## 9. Layer 7 — Provider Node Service

**Location:** `provider/` (Go, Akash-network fork)

The provider node is a full Go service that:

- Connects to the Cosmos chain RPC to watch for `Order` events
- Automatically submits `MsgCreateBid` when a matching order is found (`bidengine/`)
- Receives the deployment manifest from the tenant via mTLS HTTP endpoint (`gateway/`)
- Orchestrates containers using Kubernetes/containerd (`cluster/`)
- Streams logs back to the tenant via WebSocket

This layer is the most complete piece of Real infrastructure — it is a production-grade Akash fork.

---

## 10. Cross-Layer Data Flow

```
TENANT ACTION → CHAIN → PROVIDER → TENANT (feedback)

1. Tenant signs MsgCreateDeployment with wallet
      │
      ▼
2. Cosmos chain (x/deployment) stores SDL hash, locks escrow
      │
      ▼
3. x/market creates Order event on-chain
      │
      ▼
4. Provider node (bidengine) sees Order event via chain WS subscription
      │
      ▼
5. Provider submits MsgCreateBid on-chain (price per block)
      │
      ▼
6. Tenant console polls bids, tenant picks a provider
      │
      ▼
7. Tenant signs MsgCreateLease on-chain → escrow begins streaming ucnt
      │
      ▼
8. Tenant sends manifest (full SDL) to provider via mTLS HTTP (provider gateway)
      │
      ▼
9. Provider deploys containers, services come up
      │
      ▼
10. Provider returns service endpoints (IP:port, hostname) to tenant
      │
      ▼
11. Tenant console shows live endpoints + log stream via WebSocket
      │
      ▼
12. Escrow drains per block until tenant closes or runs dry
```

---

## 11. What Needs to Be Built

Priority order for moving from "mostly-API-mocked" to "fully on-chain":

| #   | Task                                                       | Files                                                                 | Effort |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------- | ------ |
| 1   | Protobuf codegen for chain-client                          | `packages/chain-client/`, `chain/proto/`                              | Medium |
| 2   | Wire `MsgCreateDeployment` in deploy wizard                | `apps/console/app/deploy/page.tsx`                                    | Medium |
| 3   | Wire `PaymentEscrow.depositForLease()` with CNT (not USDC) | `apps/console/app/deploy/page.tsx`, `contracts/src/PaymentEscrow.sol` | Medium |
| 4   | Wire `MsgCreateLease` after user picks a bid               | `apps/console/app/deploy/page.tsx`                                    | Small  |
| 5   | Provider node reads leases from chain (vs API)             | `provider/bidengine/`                                                 | Large  |
| 6   | Real manifest upload flow (mTLS) from console              | `apps/console/app/deployments/[id]`                                   | Large  |
| 7   | Billing route + Transaction model writes                   | `services/api/src/routes/billing.ts`                                  | Small  |
| 8   | Cosmos event indexer to sync API DB with chain             | new `services/indexer/`                                               | Large  |
| 9   | Provider onboarding submits MsgCreateProvider              | `apps/provider-console/app/onboard/`                                  | Medium |
| 10  | Fix Marketplace.sol (or decide to keep as Cosmos-only)     | `contracts/contracts/Marketplace.sol`                                 | Large  |
