# Cross-Layer Flow Validation Guide

## Overview

This document provides step-by-step validation of the updated Comnetish architecture across all 7 layers, ensuring each layer is properly wired and communication paths are correct.

## Layer Checklist

### Layer 1: Cosmos Chain (`chain/`)

- [x] **x/deployment** module registers deployments
- [x] **x/market** module creates orders and manages bids/leases
- [x] **x/provider** module registers providers
- [x] **x/cert** module manages TLS certificates
- [x] **x/escrow** module handles payment escrow
- [x] **x/audit** module tracks provider attributes
- [x] **x/take** module manages protocol fees

**Validation:**

```bash
# Run e2e tests
cd chain
make test

# Check module integration
grep -r "x/deployment\|x/market\|x/provider" chain/app/*.go
```

Expected: All modules should be imported and registered in `app/modules.go` and `app/app_configure.go`.

---

### Layer 2: EVM Smart Contracts (`contracts/`)

- [x] **CNTToken.sol** - ERC20 token for platform currency
- [x] **PaymentEscrow.sol** - Funds locking and settlement for leases
  - `depositForLease()` - Tenant locks CNT for provider
  - `markLeaseStarted()` - Oracle signals provider started
  - `settleLease()` - Provider claims payment
  - `cancelLease()` - Tenant cancels within 5-min window
- [⚠️] **Marketplace.sol** - Intentional placeholder (Cosmos-only)

**Validation:**

```bash
# Compile contracts
cd contracts
npx hardhat compile

# Deploy to local Hardhat
npx hardhat run scripts/deploy.ts --network localhost

# Verify contract addresses match env configs
grep -r "0x" contracts/src/*.sol | grep contract
```

Expected:

```
CNTToken deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
PaymentEscrow deployed to: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
```

---

### Layer 3: Off-Chain API (`services/api/`)

#### New Components (Phase 1-2)

- [x] **deployment-chain.ts** - Cosmos chain integration library
- [x] **POST /api/deployments/broadcast/create** - On-chain deployment broadcast
- [x] **provider-gateway.ts** - Provider gateway client library
- [x] **/ws/provider/:providerId/:owner/:seq/logs** - Provider logs proxy

#### Existing Components (Maintained)

- [x] **POST /api/deployments** - Off-chain deployment creation
- [x] **POST /api/leases** - Lease creation
- [x] **POST /api/deployments/:id/manifest** - Manifest submission
- [x] **GET /api/deployments/:id/runtime** - Runtime status polling
- [x] **POST /api/billing** - Billing transactions
- [x] **/ws/deployments/:id/logs** - Local deployment logs

**Validation:**

```bash
# Typecheck API
pnpm --filter @comnetish/api typecheck

# Check broadcast endpoint exists
grep -r "broadcast/create\|deployments/broadcast" services/api/src/routes/

# Verify env vars
grep -r "COMNETISH_" services/api/src/config/env.ts

# Confirm provider-gateway is imported
grep -r "provider-gateway" services/api/src/index.ts
```

Expected:

- API typechecks with zero errors
- `POST /api/deployments/broadcast/create` endpoint exists
- `COMNETISH_RELAYER_MNEMONIC` configured in env schema
- Provider gateway library imported in index.ts

---

### Layer 4: Tenant Console (`apps/console/`)

#### Updated Flow

The deploy wizard now:

1. **Escrow funding** (Step 3)
   - User connects MetaMask/SIWE wallet
   - Approves CNT token for PaymentEscrow contract
   - Deposits funds via `depositForLease()`
   - Stores escrow metadata

2. **On-chain broadcast** (Launch)
   - Tenant clicks "Launch Deployment"
   - Console calls `POST /api/deployments/broadcast/create`
   - API broadcasts `MsgCreateDeployment` to Cosmos
   - Returns on-chain deployment ID + tx hash

3. **Off-chain creation** (API fallback)
   - Console creates off-chain deployment record via `POST /api/deployments`
   - Links to on-chain tx hash if available
   - Proceeds with normal lease/manifest flow

**Validation:**

```bash
# Typecheck console
pnpm --filter @comnetish/console typecheck

# Verify broadcast call exists in deploy page
grep -r "broadcast/create" apps/console/app/deploy/page.tsx

# Check escrow funding flow
grep -r "depositForLease\|escrowFunding\|escrowTxHash" apps/console/app/deploy/page.tsx
```

Expected:

- Console typechecks with zero errors
- `POST ${API_BASE}/api/deployments/broadcast/create` call in launchMutation
- Escrow metadata captured and sent to deployment create
- On-chain creation happens before off-chain record creation

---

### Layer 5: Provider Console (`apps/provider-console/`)

#### Onboarding Flow (Chain Integration)

1. **Certificate Generation**
   - User enters Cosmos address
   - Browser generates Ed25519 keypair via Web Crypto
   - Creates self-signed certificate
   - Encrypts keypair + cert with user passphrase

2. **On-Chain Registration Sequence**
   - Calls `POST /api/providers/register` (future: or direct chain call)
   - Broadcasting:
     - `MsgCreateCertificate` - Registers cert on chain (x/cert module)
     - `MsgCreateProvider` - Registers provider attributes (x/provider module)

**Validation:**

```bash
# Typecheck provider console
pnpm --filter @comnetish/provider-console typecheck

# Check certificate generation
grep -r "createProviderCertificateMaterial\|generatePrivateKey" apps/provider-console/

# Check chain client usage
grep -r "createProviderCertificate\|registerProvider" apps/provider-console/app/onboard/page.tsx
```

Expected:

- Provider console typechecks with zero errors
- Certificate material generated via Web Crypto
- Chain client methods called for cert + provider registration
- Encrypted export available

---

### Layer 6: Chain Client Package (`packages/chain-client/`)

#### Message Broadcasting (With TODO Protobuf Comments)

- [x] `createDeployment()` → `MsgCreateDeployment` (TODO: replace JSON with protobuf)
- [x] `createBid()` → `MsgCreateBid` (TODO: replace JSON with protobuf)
- [x] `createLease()` → `MsgCreateLease` (TODO: replace JSON with protobuf)
- [x] `registerProvider()` → `MsgCreateProvider` (TODO: replace JSON with protobuf)
- [x] `createProviderCertificate()` → `MsgCreateCertificate` (TODO: replace JSON with protobuf)

#### Infrastructure Ready

- [x] `ts-proto` added to package.json
- [x] `PROTO_SETUP.md` documents migration procedure
- [x] TODO comments flag each encoding location
- [x] Mock mode still works for UI development

**Validation:**

```bash
# Typecheck chain-client
pnpm --filter @comnetish/chain-client typecheck

# Verify protobuf tooling is configured
grep -r "ts-proto\|proto:generate" packages/chain-client/package.json

# Check TODO comments are present
grep -r "TODO(protobuf)" packages/chain-client/src/index.ts | wc -l
```

Expected:

- Zero typecheck errors
- `ts-proto` in devDependencies
- At least 5 TODO(protobuf) comments in index.ts
- PROTO_SETUP.md guides protobuf migration

---

### Layer 7: Provider Node (`provider/`)

#### Manifest & Log Handling

- [x] **Gateway manifest endpoint** - Receives SDL from tenant (PUT `/lease/{owner}/{dseq}/manifest`)
- [x] **WebSocket logs endpoint** - Streams container logs (WS `/lease/{owner}/{dseq}/logs`)
- [x] **Provider status polling** - Returns endpoint + status (GET `/lease/{owner}/{dseq}/manifest`)
- [x] **mTLS/JWT auth** - Configurable auth type (via provider-services cmd flags)

**Validation:**

```bash
# Check gateway handlers
grep -r "manifest\|/logs" provider/gateway/rest/router.go | grep HandleFunc

# Verify event handlers
grep -r "WS\|WebSocket\|upgrade" provider/gateway/rest/router.go | head -20

# Check cluster integration
grep -r "LeaseLogs\|GetManifestGroup" provider/gateway/rest/router.go
```

Expected:

- Manifest handler exists (PUT, GET)
- Logs handler exists (WS)
- mTLS and JWT auth options present
- Cluster client integration for log/status retrieval

---

## End-to-End Flow Validation

### Scenario: Successful Deployment Launch

```
1. TENANT (Console) → COSMOS CHAIN (via API broadcast)
   └─ POST /api/deployments/broadcast/create
      └─ broadcastMsgCreateDeployment()
         └─ MsgCreateDeployment on-chain
            └─ x/market creates Order event

2. PROVIDER (Node) → COSMOS CHAIN (subscription/bidengine)
   └─ Reads Order from chain
      └─ Submits MsgCreateBid
         └─ x/market records bid

3. TENANT (Console) → API (REST)
   └─ POST /api/deployments (creates off-chain record)
      └─ POST /api/leases (links to provider bid)
         └─ MsgCreateLease on-chain
            └─ Escrow begins streaming

4. TENANT (Console) → EVM (via wagmi/viem)
   └─ approve() CNT to PaymentEscrow
      └─ depositForLease()
         └─ Funds locked on EVM

5. TENANT (Console) → API (manifest submission)
   └─ POST /api/deployments/{id}/manifest
      └─ proxyManifestToProvider()
         └─ PUT /lease/{owner}/{dseq}/manifest (provider gateway)
            └─ Manifest forwarded to cluster

6. PROVIDER (Node) → CLUSTER
   └─ Receives manifest
      └─ Deploys containers
         └─ Services come online

7. TENANT (Console) → API (logs streaming)
   └─ WS /ws/deployments/{id}/logs (local)
      └─ App calls connectProviderLogsStream()
         └─ WS /ws/provider/{providerId}/{owner}/{seq}/logs
            └─ Provider gateway streams logs from cluster
               └─ Real-time: containers starting, ports binding, services up

8. TENANT (Console) → API (runtime polling)
   └─ GET /api/deployments/{id}/runtime
      └─ Returns endpoint + status
         └─ Console displays: "Service online at ip:port"

9. TENANCY LIFECYCLE
   └─ Escrow drains per block while lease is active
   └─ Tenant can close lease (withdraw remaining escrow)
   └─ Provider stops serving if escrow runs dry
   └─ Tenant closes deployment after provider stops
```

### Test Commands

**1. Verify on-chain broadcast works:**

```bash
curl -X POST http://localhost:3001/api/deployments/broadcast/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <tenant_jwt>" \
  -d '{
    "tenantAddress": "cosmos1234...",
    "sdl": "version: \"2.0\"..."
  }'

# Expected response:
{
  "data": {
    "chainTxHash": "0xABC123...",
    "chainDeploymentId": "dseq-1710625200000-1234",
    "status": "BROADCAST",
    "message": "Deployment broadcasted to Cosmos chain"
  }
}
```

**2. Verify deployment creation with on-chain linkage:**

```bash
curl -X POST http://localhost:3001/api/deployments \
  -H "Content-Type: application/json" \
  -d '{
    "tenantAddress": "cosmos1234...",
    "sdl": "...",
    "onChainDeploymentId": "dseq-1710625200000-1234",
    "onChainTxHash": "0xABC123..."
  }'

# Expected: deployment record with chainDeploymentId + chainTxHash
```

**3. Verify provider logs proxy:**

```bash
# WebSocket connection to provider logs proxy
wscat -c "ws://localhost:3001/ws/provider/provider-123/cosmos1234/42/logs"

# Should stream log messages from provider gateway
```

**4. Verify runtime polling:**

```bash
curl -X GET http://localhost:3001/api/deployments/deployment-id-123/runtime

# Expected response:
{
  "data": {
    "deploymentId": "deployment-id-123",
    "status": "RUNNING",
    "endpoint": "34.56.78.90:8080",
    "manifestUploadedAt": "2026-03-17T12:34:56Z",
    "lastTransitionAt": "2026-03-17T12:35:10Z"
  }
}
```

---

## Validation Checklist

### Infrastructure

- [ ] all `COMNETISH_*` env vars present in API .env
- [ ] chain RPC is accessible from API
- [ ] provider gateway URLs are set for providers in DB
- [ ] Cosmojs + stargate dependencies are latest
- [ ] ts-proto is configured (ready for proto generation)

### API Layer

- [ ] `npm run typecheck` passes
- [ ] Deployment broadcast endpoint returns 200 on success (or 501 if relayer not configured)
- [ ] Provider logs proxy connects to provider gateway without errors
- [ ] Rate limiting is active on `/api/auth/*`
- [ ] CORS headers are set correctly

### Console Layer

- [ ] Wallet connection works (MetaMask / SIWE)
- [ ] Escrow funding flow completes (`approve()` → `depositForLease()`)
- [ ] Launch includes on-chain broadcast call
- [ ] Deployment detail page polls runtime and displays endpoint
- [ ] Console logs show successful chain broadcast

### Provider Console Layer

- [ ] Provider onboarding generates certificates
- [ ] Certificate material is encrypted with passphrase
- [ ] Export bundle download works
- [ ] (Future) Chain broadcast for provider registration

### Chain Layer

- [ ] `x/market` module recognizes orders
- [ ] `x/escrow` accepts and streams payments
- [ ] `x/provider` and `x/cert` modules accept registrations
- [ ] Events are emitted and indexable

### Integration

- [ ] Indexer service syncs chain events to API DB
- [ ] Deployment records link to on-chain IDs
- [ ] Leases have escrow metadata attached
- [ ] Provider logs flow through API to console in real-time

---

## Success Criteria

✅ **Deployment Lifecycle Complete**

- Tenant can deploy from console
- Console broadcasts to Cosmos chain
- Deployment recorded off-chain with chain linkage
- Provider receives bid notification from chain
- Tenant sees runtime endpoint and logs
- Escrow locks and unlocks correctly

✅ **Cross-Layer Communication Working**

- API ↔ Cosmos chain via cosmjs
- Tenant Console ↔ API via fetch/WS
- Provider Console → Cosmos chain (via API relay or direct)
- API ↔ Provider Gateway (logs proxy)

✅ **Production Ready (Pending)**

- [ ] Protobuf encoding deployed (when proto files available)
- [ ] Full mTLS provider authentication
- [ ] Rate limiting at provider node level
- [ ] Comprehensive error handling and retries
- [ ] Monitoring and alerting for cross-layer failures

---

## Troubleshooting

**API broadcast endpoint returns 501**

- Check `COMNETISH_RELAYER_MNEMONIC` is set in .env
- If intentionally not set, chain broadcast is disabled (expected for mock mode)

**Provider logs proxy times out**

- Verify provider's `gatewayUrl` is set in database
- Check provider node is running and reachable
- Try direct WS connection: `wscat -c "ws://provider-host/lease/owner/dseq/logs"`

**Deployment created but can't see runtime**

- Wait for lease creation (check /api/leases)
- Verify provider accepted manifest (check logs for proxy response)
- Try polling `/api/deployments/:id/runtime` multiple times

**Chain broadcast fails silently**

- Check API logs for chain client errors
- Verify Cosmos RPC is accessible: `curl http://localhost:26657/status`
- Ensure chainID and gasPrice match configured values

---

## References

- [Layer 1: Cosmos Chain](../chain/)
- [Layer 2: EVM Contracts](../contracts/)
- [Layer 3: API Service](../services/api/)
- [Layer 4: Tenant Console](../apps/console/)
- [Layer 5: Provider Console](../apps/provider-console/)
- [Layer 6: Chain Client](../packages/chain-client/)
- [Layer 7: Provider Node](../provider/)
- [Protobuf Migration](../packages/chain-client/PROTO_SETUP.md)
- [Marketplace Architecture](./MARKETPLACE_ARCHITECTURE.md)
