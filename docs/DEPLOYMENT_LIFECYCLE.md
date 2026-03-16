# Comnetish — Deployment Lifecycle

> **Purpose:** End-to-end walkthrough of how a compute deployment travels from a tenant's browser to a running container on a provider node — covering file transfer, on-chain transactions, monitoring, automation, and error handling.

---

## Table of Contents

1. [Overview — The Full Journey](#1-overview--the-full-journey)
2. [Step 1 — SDL Authoring (Browser)](#2-step-1--sdl-authoring-browser)
3. [Step 2 — Provider Selection & Bidding (On-chain)](#3-step-2--provider-selection--bidding-on-chain)
4. [Step 3 — Launching: On-chain Transactions](#4-step-3--launching-on-chain-transactions)
5. [Step 4 — Manifest Upload (File Transfer to Provider)](#5-step-4--manifest-upload-file-transfer-to-provider)
6. [Step 5 — Container Orchestration on Provider](#6-step-5--container-orchestration-on-provider)
7. [Step 6 — Tenant Receives Endpoints & Monitors](#7-step-6--tenant-receives-endpoints--monitors)
8. [Step 7 — Log Streaming](#8-step-7--log-streaming)
9. [Step 8 — Escrow Lifecycle & Auto-close](#9-step-8--escrow-lifecycle--auto-close)
10. [Step 9 — Closing a Deployment](#10-step-9--closing-a-deployment)
11. [Current State vs Target State](#11-current-state-vs-target-state)
12. [Automation — How It All Works Without Human Intervention](#12-automation--how-it-all-works-without-human-intervention)
13. [Error Handling & Recovery](#13-error-handling--recovery)

---

## 1. Overview — The Full Journey

```
TENANT BROWSER                  COSMOS CHAIN              PROVIDER NODE
─────────────                   ────────────              ─────────────

Step 1: Write SDL ──────────────────────────────────────────────────────
Step 2: Browse bids  ◄── (bids arrive from providers) ◄── auto-bid engine
Step 3: Sign MsgCreateDeployment ──► chain stores SDL hash / locks escrow
        Sign MsgCreateLease ────────► chain creates lease
Step 4: Upload manifest (SDL) ──────────────────────────► gateway mTLS
Step 5:                                                    orchestrate containers
        poll status ◄──────────────────────────────────── returns endpoints
Step 6: Monitor / logs  ◄── WebSocket ──────────────────── log stream
Step 7: Close or let expire ──────────────────────────────── stop containers
```

---

## 2. Step 1 — SDL Authoring (Browser)

**File:** `apps/console/app/deploy/page.tsx` — Step 1 UI

The tenant creates a **Service Definition Language** (SDL) YAML document that describes:

- Container image(s) to run
- CPU, memory, storage requirements
- Port exposures
- Environment variables
- Placement constraints (region, provider attributes)

### Two authoring modes

#### AI Mode

1. Tenant describes workload in plain English (e.g. "Run a Node.js API with 2 CPUs and 4GB RAM")
2. Console sends `POST /api/ai/generate-sdl` with the description
3. API calls an LLM (GPT / local model) to generate an SDL YAML string
4. SDL shown to tenant for review / edits

#### Manual mode

Tenant fills in sliders and fields for image name, CPU, memory, storage, ports. SDL is generated client-side from the inputs.

### SDL example

```yaml
version: "3.0"
services:
  web:
    image: nginx:stable
    expose:
      - port: 80
        as: 80
        to:
          - global: true
profiles:
  compute:
    web:
      resources:
        cpu: { units: 1.0 }
        memory: { size: 512Mi }
        storage: { size: 1Gi }
  placement:
    westcoast:
      attributes:
        region: us-west
      pricing:
        web: { denom: ucnt, amount: 15 }
deployment:
  web:
    westcoast:
      profile: web
      count: 1
```

### SDL validation

Before proceeding to Step 2, the SDL must be validated:

- YAML parseable
- Required fields present (`version`, `services`, `profiles`, `deployment`)
- Port numbers valid
- Image name non-empty

`packages/chain-client/` has SDL utilities from the `pkg.akt.dev/go/sdl` Go package (referenced in `chain/go.mod`). A TypeScript SDL validator should be added to `packages/types/` or `packages/chain-client/`.

---

## 3. Step 2 — Provider Selection & Bidding (On-chain)

In the **target state** (with on-chain wiring), this step works as follows:

### Target state

```
1. Tenant broadcasts MsgCreateDeployment on-chain
        │
        ▼
2. x/deployment module:
   - Stores deployment (SDL hash, owner, resources)
   - Locks deposit in x/escrow
   - Calls x/market to create an Order
        │
        ▼
3. Provider bidengine (Go, provider/) watches chain via WS:
   - Receives EventOrderCreated
   - Evaluates: can I serve? resources available? price acceptable?
   - Broadcasts MsgCreateBid with price (ucnt per block)
        │
        ▼
4. Tenant console polls GET /api/bids?deploymentId=... every 3s
   (API DB synced by indexer from chain events)
        │
        ▼
5. Tenant reviews bids sorted by price / uptime / speed
```

### Current state (mocked)

- `GET /api/bids` returns bids from PostgreSQL (no real chain connection)
- Bids are seeded by mock data or manually inserted
- No provider bidengine is broadcasting real bids

### Bid data shown in UI

Each bid card shows:

- Provider name and region
- Price per hour (converted from ucnt-per-block × 360 blocks/hour avg)
- Provider uptime / reliability score
- GPU availability chips
- "Select" button → highlights the bid

---

## 4. Step 3 — Launching: On-chain Transactions

This is the most important step — where payment commitment happens.

### Target launch sequence (what should happen)

```javascript
// Step 3a — Pre-authorize CNT spending on EVM
await cntToken.approve(paymentEscrow.address, leaseAmount);

// Step 3b — Broadcast MsgCreateDeployment on Cosmos chain
const { deploymentId } = await chainClient.createDeployment(sdl, tenantWallet);

// Step 3c — Accept the chosen provider's bid (MsgCreateLease)
const { txHash } = await chainClient.createLease(
  deploymentId,
  selectedBid.id,
  tenantWallet,
);

// Step 3d — Deposit CNT into EVM escrow
await paymentEscrow.depositForLease(
  leaseId, // from chain lease ID
  providerAddress, // provider's EVM address
  amount, // pre-calculated from price × max duration
  maxDuration, // seconds
);

// Step 3e — Notify API (for DB cache)
await fetch("/api/deployments", {
  method: "POST",
  body: { leaseId, tenantAddress, sdl },
});
```

### Current state (missing pieces)

1. `launchMutation` in `apps/console/app/deploy/page.tsx` only calls `POST /api/deployments`
2. The `approve()` wagmi call exists in the UI but `depositForLease()` is never called after it
3. No Cosmos chain transactions are broadcast from the browser

### Wallet requirements

- **Cosmos wallet** (Keplr / Leap / chain-client HD wallet) — for Cosmos messages
- **EVM wallet** (MetaMask / RainbowKit) — for CNT approve + depositForLease
- These can be two separate wallets, or the same seed phrase imported into both

### Transaction ordering (non-negotiable)

Must happen in this order:

1. EVM `approve()` first — allows PaymentEscrow to pull CNT
2. `MsgCreateDeployment` — creates on-chain deployment record
3. `MsgCreateLease` — commits to a specific provider
4. EVM `depositForLease()` — locks CNT in escrow
5. Manifest upload to provider (Step 4)

Steps 2–4 should be batched / shown as a multi-step progress indicator in the UI.

---

## 5. Step 4 — Manifest Upload (File Transfer to Provider)

After the lease is created on-chain, the tenant must send the **full SDL manifest** directly to the provider.

> This is NOT sent through the API or chain. It is a **direct mTLS connection from browser (or API server) to the provider node's HTTP gateway.**

### Why direct, not via chain?

- SDL manifests can be large (multi-service deployments)
- Chain blocks are not for data storage — only SDL hash is stored on-chain
- Direct connection is faster (sub-second) vs waiting for a block

### How it works

```
1. Tenant console fetches provider's host_uri from x/provider on chain
   GET /comnetish/providers/{providerAddress}
   Response: { host_uri: "https://provider.example.com:8443", ... }

2. Tenant console (or API proxy) sends manifest:
   POST https://provider.example.com:8443/deployment/{owner}/{dseq}/manifest
   Headers: {
     Authorization: Bearer <jwt-signed-with-tenant-cert-key>
   }
   Body: { sdl: "..." }  // full SDL YAML

3. Provider gateway verifies:
   - Tenant's TLS cert matches on-chain x/cert record
   - Lease exists on-chain for this tenant + deployment
   - SDL matches hash stored on-chain

4. Provider responds 200 OK
```

### Certificate handshake (mTLS)

Both tenant and provider must have active certificates on-chain (`x/cert`):

- Provider creates cert via `MsgCreateCertificate` on onboarding
- Tenant creates cert via `MsgCreateCertificate` at first deploy or account setup
- Certificates are ED25519 or secp256k1 TLS certs with on-chain pub key
- The provider gateway validates the tenant's cert against the on-chain cert store

### Current state

- The Go provider binary (`provider/gateway/`) has full mTLS manifest endpoint implemented
- The tenant console has NO manifest upload step implemented yet
- After `launchMutation` succeeds, there is no follow-up manifest upload call

### What needs to be added to tenant console

```typescript
// In apps/console/app/deployments/[id]/page.tsx or after launchMutation success:

async function uploadManifest(
  providerHostUri: string,
  deploymentDseq: string,
  sdl: string,
) {
  const response = await fetch(
    `${providerHostUri}/deployment/${tenantAddress}/${deploymentDseq}/manifest`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tenantJwt}`, // JWT signed with tenant cert private key
      },
      body: JSON.stringify({ sdl }),
    },
  );
  if (!response.ok) throw new Error("Manifest upload failed");
}
```

For browser-side mTLS (cert-based auth), use the Web Crypto API to sign a JWT with the tenant's on-chain cert private key, or proxy through the API service.

---

## 6. Step 5 — Container Orchestration on Provider

After receiving the manifest, the provider node:

```
provider/cluster/ (Go)
    │
    ├─ Parses SDL YAML
    ├─ Converts SDL to Kubernetes manifests:
    │   - Deployment (replicas, image, env vars)
    │   - Service (port exposures, ingress)
    │   - PersistentVolumeClaim (storage)
    │   - NetworkPolicy (isolation)
    │
    ├─ Applies manifests to Kubernetes cluster (kubectl apply / client-go)
    │
    ├─ Watches pod status:
    │   - Pending → ContainerCreating → Running
    │
    └─ When Running: returns service endpoint(s) to tenant
```

### Resource isolation

Each tenant deployment runs in its own Kubernetes namespace: `comnetish-{deploymentId}`.  
This provides:

- Network isolation (no cross-tenant traffic)
- Resource quotas (CPU/memory limits enforced from SDL)
- Storage isolation (separate PVCs)

### GPU support

If SDL requests GPU resources, the provider's `bidengine` only bids if it has a NVIDIA device plugin installed and GPU nodes available. Provider advertises GPU attributes via `x/provider`.

---

## 7. Step 6 — Tenant Receives Endpoints & Monitors

After containers are Running, the tenant can query service endpoints:

```
GET /deployment/{owner}/{dseq}/status
Response: {
  services: {
    web: {
      name: "web",
      available: 1,
      total: 1,
      uris: ["web.abc123.comnetish.network"],
      observed_generation: 1,
      replicas: 1,
      updated_replicas: 1,
      ready_replicas: 1,
      available_replicas: 1
    }
  }
}
```

The tenant console shows these endpoints on the deployment detail page (`/deployments/:id`) so the user can click through to their running service.

### Status polling

The tenant console polls `GET /api/deployments/:id` every 5–10 seconds.  
The API checks:

1. Deployment status in DB (synced by indexer from chain)
2. Provider-reported service status (fetched from provider gateway via API proxy)

---

## 8. Step 7 — Log Streaming

Real-time container logs are streamed from the provider to the tenant via WebSocket:

```
Tenant Browser
    │
    │ WS: ws://localhost:3001/ws/deployments/:id/logs
    ▼
API Service (WebSocket proxy)
    │
    │ WS: wss://provider.example.com:8443/deployment/{owner}/{dseq}/logs
    ▼
Provider Gateway
    │
    │ (streams) stdout/stderr from Kubernetes pods
    ▼
Container process
```

### Current state

- WebSocket route `/ws/deployments/:id/logs` is registered in `services/api/src/index.ts`
- The actual piping from provider gateway to client WebSocket is not yet implemented
- Need to add: when a client connects, API opens a WebSocket to the provider and proxies the stream

---

## 9. Step 8 — Escrow Lifecycle & Auto-close

### Streaming payment (Cosmos side)

Every Cosmos block (~2 sec):

- `x/escrow` deducts `pricePerBlock × numBlocks` from tenant's escrow account
- Amount transferred to provider's account on-chain
- If `escrowBalance < pricePerBlock`, the module closes the lease automatically

### EVM side (PaymentEscrow.sol)

- Tenant deposits CNT for `maxDuration` seconds
- Oracle calls `settleLease()` when the Cosmos lease closes
- Provider receives full CNT (or prorated if tenant replenishes Cosmos escrow)

### Replenishment

Tenant can call `MsgDepositDeployment` to add more `ucnt` to escrow, extending the lease.  
In the tenant console this shows as a "Top Up" button on the deployment detail page (to be implemented).

### Auto-close flow

```
x/escrow: escrow balance < pricePerBlock
    │
    └─► EventDeploymentClosed emitted
            │
            ├─► Indexer: UPDATE Deployment SET status='CLOSED'
            ├─► Provider bidengine: stops serving workload
            ├─► Oracle: calls PaymentEscrow.settleLease() on EVM
            └─► Tenant console: shows "Deployment Closed - Out of Funds" banner
```

---

## 10. Step 9 — Closing a Deployment

Tenant can manually close a deployment at any time:

```
1. Tenant signs MsgCloseDeployment on Cosmos chain
        │
        ▼
2. x/deployment: marks deployment CLOSED
   x/escrow: refunds remaining balance to tenant
        │
        ▼
3. x/market: closes all associated leases
        │
        ▼
4. Provider receives EventLeaseClosed:
   - Stops containers
   - Deletes Kubernetes namespace
   - Releases resources for new bids
        │
        ▼
5. API indexer syncs: Deployment CLOSED, Lease CLOSED
        │
        ▼
6. Tenant console: shows "Deployment Closed" status
```

On the API side: `POST /api/deployments/:id/close` currently only updates the DB record — it must also broadcast `MsgCloseDeployment` on-chain.

---

## 11. Current State vs Target State

| Step                              | Current                           | Target                               | Missing                            |
| --------------------------------- | --------------------------------- | ------------------------------------ | ---------------------------------- |
| SDL authoring                     | ✅ AI + manual modes              | ✅ same                              | —                                  |
| Provider listing                  | ✅ from API DB                    | ✅ from indexer (chain-synced)       | indexer service                    |
| Bid display                       | ⚠️ mock/seeded bids               | ✅ real bids from provider bidengine | real chain connection + indexer    |
| MsgCreateDeployment               | ❌ not called                     | ✅ signed by tenant wallet           | chain-client protobuf fix          |
| MsgCreateLease                    | ❌ not called                     | ✅ signed by tenant wallet           | same                               |
| CNT approve() + depositForLease() | ⚠️ approve shown, deposit missing | ✅ full sequence                     | wire deposit after approve         |
| Manifest upload                   | ❌ not implemented                | ✅ mTLS to provider                  | new code in console                |
| Container orchestration           | ✅ provider/ Go binary has it     | ✅ same (connect to real chain)      | chain wiring in Go provider        |
| Endpoint delivery                 | ❌ not implemented                | ✅ poll provider status endpoint     | new code in console                |
| Log streaming                     | ⚠️ route exists, no pipe          | ✅ WS proxy to provider              | implement WS proxy                 |
| Escrow auto-close                 | ❌ not triggered                  | ✅ x/escrow handles on-chain         | needs chain running                |
| Manual close                      | ⚠️ DB only                        | ✅ MsgCloseDeployment + DB           | add chain tx to API close endpoint |

---

## 12. Automation — How It All Works Without Human Intervention

Once the full stack is wired, the following is completely automated:

```
                    ┌─────────────────────────────────────┐
                    │  Tenant signs 2 txs + upload SDL    │
                    │  (1–2 minutes of human interaction)  │
                    └───────────────┬─────────────────────┘
                                    │
           ┌────────────────────────┼──────────────────────────────┐
           │                        │                              │
    On-chain automation             │                    Payment automation
           │                        │                              │
    x/market creates        Provider bidengine              x/escrow deducts
    Order automatically     auto-submits bid                per-block payment
           │                within seconds                  automatically
           │                        │                              │
           └────────────────────────┤                              │
                                    │                              │
                          Tenant picks bid,                 If escrow drains:
                          signs MsgCreateLease              lease auto-closed,
                                    │                       provider stops,
                                    │                       refund sent
                          Provider starts containers
                          (manifest upload → k8s)
                                    │
                          Service up in 30–120 sec
                                    │
                          Tenant gets endpoint URL,
                          visits their running service
```

**Human interaction required:** ~3 wallet signature confirmations + picking a provider.  
**Automated:** bid collection, container startup, billing, auto-close on non-payment.

---

## 13. Error Handling & Recovery

| Scenario                        | Detection                                      | Recovery                                                                |
| ------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| No bids received                | Timer: 0 bids after 5 min                      | Notify tenant; suggest relaxing placement constraints                   |
| Manifest upload fails           | HTTP 4xx/5xx from provider gateway             | Retry 3x with backoff; show error in console                            |
| Container fails to start        | Provider status poll: `available=0` for >2 min | Show "Launch failed" with provider error; allow tenant to close + retry |
| Provider goes offline mid-lease | Escrow: no heartbeat + lease timeout           | x/market auto-closes lease; escrow refunds remaining; tenant notified   |
| Escrow funds insufficient       | x/escrow: balance < pricePerBlock              | Auto-close lease; show "Top Up" prompt before this happens              |
| TLS cert expired                | mTLS handshake failure                         | Tenant/provider must renew cert via MsgCreateCertificate                |
| Chain RPC unavailable           | HTTP timeout from chain-client                 | Retry with backoff; show "Chain connectivity issue"                     |
| EVM node unavailable            | wagmi error                                    | Retry; show "Network issue" in wallet modal                             |
