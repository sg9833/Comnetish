# Comnetish — Blockchain Architecture Design

> **Purpose:** Deep-dive into the dual-chain architecture (Cosmos app chain + EVM layer), how the two chains interact, what the token model looks like, how consensus and P2P work, and the complete roadmap to production.

---

## Table of Contents

1. [Why Two Chains?](#1-why-two-chains)
2. [Cosmos App Chain — Architecture](#2-cosmos-app-chain--architecture)
3. [EVM Layer — Architecture](#3-evm-layer--architecture)
4. [Token Model — CNT (replacing USDC)](#4-token-model--cnt-replacing-usdc)
5. [P2P Network Topology](#5-p2p-network-topology)
6. [Consensus — CometBFT (Tendermint) BFT](#6-consensus--cometbft-tendermint-bft)
7. [Chain → Provider Bridge (Off-chain Listener)](#7-chain--provider-bridge-off-chain-listener)
8. [Cross-Chain: IBC and EVM Bridge](#8-cross-chain-ibc-and-evm-bridge)
9. [Transaction Lifecycle on Cosmos Chain](#9-transaction-lifecycle-on-cosmos-chain)
10. [Protobuf & Encoding — Critical Fix Needed](#10-protobuf--encoding--critical-fix-needed)
11. [Chain Indexer Service](#11-chain-indexer-service)
12. [Network Bootstrap & Validator Setup](#12-network-bootstrap--validator-setup)
13. [Production Launch Roadmap](#13-production-launch-roadmap)

---

## 1. Why Two Chains?

Comnetish uses two distinct blockchain layers for different reasons:

| Layer                | Technology                      | Purpose                                                                                                                                              |
| -------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cosmos App Chain** | Cosmos SDK v0.53 + CometBFT     | Core protocol: deployment lifecycle, lease escrow, provider registry, market matching. Fast finality (1–2 sec). Custom modules. Native token `ucnt`. |
| **EVM Layer**        | Solidity / EVM-compatible chain | Accessibility: MetaMask users, DeFi integrations, fiat on-ramps. CNT ERC-20 token. PaymentEscrow for EVM-native wallets.                             |

The two layers are connected by an oracle/bridge (see section 8). Long-term, IBC can bridge native `ucnt` from Cosmos to an EVM chain as a wrapped ERC-20.

**Why Cosmos SDK (not just EVM)?**

- Compute marketplace logic (bidding, order matching, lease streaming) needs sub-second block times and custom state machines that are expensive in Solidity.
- Cosmos modules (`x/deployment`, `x/market`, `x/escrow`) give us typed protobuf state, authz delegation, and governance for free.
- Cosmos SDK supports streaming payments per block — critical for pay-as-you-go compute.

---

## 2. Cosmos App Chain — Architecture

### Chain identity

```
Chain ID:      comnetish-1
Bech32 prefix: comnetish
Native token:  ucnt (micro-CNT, 1 CNT = 1,000,000 ucnt)
Block time:    ~2s (CometBFT BFT consensus)
RPC:           :26657
REST (LCD):    :1317
gRPC:          :9090
P2P:           :26656
```

### Module dependency graph

```
x/deployment ──────────────────────┐
     │ creates orders               │
     ▼                             │
x/market ──── tracks leases ──────►x/escrow
     │                             ▲
     │ provider attribute lookup   │
     ▼                             │
x/provider                         │
     │                    locks/drains ucnt
     ▼
x/audit (trust attestation)

x/cert (TLS cert storage)
x/take (protocol fee)
```

### State machine — Deployment

```
MsgCreateDeployment
      │
      ▼ (escrow funded, order created)
   OPEN ──── no bids within timeout ──► CLOSED (refund)
      │
      │ MsgCreateLease (tenant accepts bid)
      ▼
   ACTIVE ──── escrow drains per block ──────► escrow empty → auto-CLOSED
      │
      │ MsgCloseDeployment
      ▼
   CLOSED (remaining escrow refunded)
```

### State machine — Lease

```
MsgCreateLease (tenant signs)
      │
      ▼
  PENDING ──── provider sends manifest (off-chain mTLS) ──►
      │
      ▼
  ACTIVE  ──── per-block ucnt deducted from escrow ──────►
      │
      │ MsgCloseLease / escrow dry-up
      ▼
  CLOSED
```

### Key messages and who signs them

| Message                | Signed by                              | Module       |
| ---------------------- | -------------------------------------- | ------------ |
| `MsgCreateDeployment`  | Tenant wallet                          | x/deployment |
| `MsgDepositDeployment` | Tenant wallet                          | x/deployment |
| `MsgCloseDeployment`   | Tenant wallet                          | x/deployment |
| `MsgCreateProvider`    | Provider wallet                        | x/provider   |
| `MsgUpdateProvider`    | Provider wallet                        | x/provider   |
| `MsgCreateBid`         | Provider wallet (auto, from bidengine) | x/market     |
| `MsgCloseBid`          | Provider wallet                        | x/market     |
| `MsgCreateLease`       | Tenant wallet                          | x/market     |
| `MsgCloseLease`        | Tenant or Provider wallet              | x/market     |
| `MsgCreateCertificate` | Provider or Tenant wallet              | x/cert       |

---

## 3. EVM Layer — Architecture

### Current state

- Local Hardhat network only
- `CNTToken.sol`: ERC-20 platform token
- `PaymentEscrow.sol`: Lease escrow (full implementation, currently uses USDC → change to CNT)
- `Marketplace.sol`: Stub — one constant, no logic

### Intended EVM role

The EVM layer serves **EVM-native users** (MetaMask wallets) and **DeFi integrations**.  
It is **not** the primary protocol layer — Cosmos handles the protocol. EVM is the payment and accessibility layer.

### EVM contract interactions

```
Tenant (MetaMask)
      │
      │ approve(paymentEscrow, amount)  ── on CNT ERC-20
      │
      ▼
PaymentEscrow.depositForLease(leaseId, provider, amount, maxDuration)
      │
      │ (funds held in contract)
      ▼
Oracle / Bridge service
      │ markLeaseStarted(leaseId)      ── after provider confirms workload running
      │
      ▼
PaymentEscrow.settleLease(leaseId)    ── releases CNT to provider
      │
      ▼
Provider receives CNT
```

### The Oracle role

The `markLeaseStarted()` function can only be called by the registered oracle address. The oracle is:

- A backend service that monitors the Cosmos chain for `EventLeaseActive` events
- When a lease is active on the Cosmos chain, the oracle calls `markLeaseStarted()` on EVM to begin the EVM payment window
- This is the bridge connecting the two chains

---

## 4. Token Model — CNT (replacing USDC)

> **Decision:** Remove USDC from `PaymentEscrow.sol`. Use `CNTToken` for all EVM-side payments. On Cosmos side, use `ucnt` natively.

### Why remove USDC?

- USDC is an external dependency requiring a Circle integration or bridge
- CNT is Comnetish's own token — platform-native, mintable by governance
- Eliminates third-party stablecoin risk and regulatory complexity

### Token duality

```
Cosmos Chain                EVM Chain
─────────────────           ──────────────────────
ucnt (native denom)         CNT (ERC-20, 18 decimals)
     │                            │
     │    IBC + Bridge            │
     └─────────────────────────────┘
          1 ucnt = 0.000001 CNT
          (10^-6 Cosmos, 10^-18 EVM → bridge normalizes)
```

Bridging is handled by a **lock-and-mint** bridge:

- Lock `ucnt` on Cosmos chain → Mint `CNT` ERC-20 on EVM
- Burn `CNT` ERC-20 on EVM → Unlock `ucnt` on Cosmos chain

Until the bridge is built, CNT ERC-20 is minted directly by the owner (team/governance) for development purposes.

### Fiat on-ramp

"Fiat tokens for exchange" means users pay with credit card / bank transfer to get CNT:

```
User pays USD → Fiat on-ramp (e.g. Stripe, Transak)
    → CNT minted to user's EVM wallet
    → User deposits CNT into PaymentEscrow for lease
```

Implementation options:

1. **Transak / Ramp Network widget** embedded in tenant console — they handle fiat → crypto, send CNT to user wallet
2. **Centralized exchange listing** — user buys CNT on CEX, withdraws to wallet
3. **In-app fiat gateway** — Comnetish collects USD payment (Stripe), mints equivalent CNT to user wallet (owner-minting)

Option 3 is the easiest for v1: user pays $X via Stripe, backend mints X × rate CNT to their wallet.

### Changes needed to PaymentEscrow.sol

```diff
- constructor(address _usdcToken, address _oracleAddress)
+ constructor(address _cntToken, address _oracleAddress)

- IERC20 public usdcToken;
+ IERC20 public cntToken;

- // all usdcToken.transfer() calls
+ // replace with cntToken.transfer() calls
```

Also update:

- `apps/console/app/deploy/page.tsx`: Replace `USDC_TOKEN_ADDRESS` / `USDC_SPENDER_ADDRESS` env vars with `CNT_TOKEN_ADDRESS` / `CNT_SPENDER_ADDRESS`
- `contracts/exports/abi/PaymentEscrow.json`: Regenerate after contract update
- `contracts/exports/addresses/hardhat.json`: Redeploy and update

---

## 5. P2P Network Topology

The Comnetish network has two types of P2P connectivity:

### A) Cosmos chain P2P (CometBFT)

```
Validator Node 1 ─────── Validator Node 2
      │   ╲               ╱    │
      │    ╲             ╱     │
      │     Full Node(s)        │
      │           │             │
      ▼           ▼             ▼
  Provider     Provider     Provider
  Node (sentry)  Node        Node
```

- **Validators** form the consensus committee. They sign blocks. Min 2/3 must agree.
- **Full nodes** (non-validators) sync the chain, serve RPC/REST, no block signing.
- **Sentry nodes** are full nodes that sit between validators and the internet (DDoS protection).
- **Provider nodes** connect as full nodes (light clients) to watch for order events.

CometBFT P2P uses TCP with custom multiplexing. Peer discovery via seed nodes listed in `config.toml`.

### B) Provider ↔ Tenant P2P (mTLS)

This is not blockchain P2P — it is direct HTTPS communication after lease creation.

```
Tenant Browser
      │
      │ GET provider.host_uri/hostname (fetched from chain x/provider)
      ▼
Provider Gateway (port 8443)
  ├── mTLS handshake (certs validated against x/cert on chain)
  ├── POST /deployment/{deployment_id}/manifest  (sends SDL)
  ├── GET  /deployment/{deployment_id}/status    (service endpoints)
  └── GET  /deployment/{deployment_id}/logs      (WebSocket log stream)
```

### C) Provider ↔ Provider (no direct link needed)

Providers do not communicate with each other. Each provider independently watches the chain for orders and submits bids.

---

## 6. Consensus — CometBFT (Tendermint) BFT

CometBFT uses **Byzantine Fault Tolerant (BFT)** consensus:

### How blocks are produced

```
Leader (proposer, rotates round-robin)
   │
   │ 1. Broadcasts block proposal
   ▼
All validators
   │
   │ 2. Prevote (if valid block, sign + broadcast prevote)
   ▼
   │
   │ 3. Precommit (if 2/3+ prevotes received, sign + broadcast precommit)
   ▼
   │
   │ 4. Block committed when 2/3+ precommits received
   ▼
Next proposer starts round
```

### Key properties

- **Finality:** instant — once committed, a block cannot be reverted
- **Block time:** ~2 seconds
- **Fault tolerance:** tolerates up to 1/3 faulty validators (Byzantine faults)
- **Safety over liveness:** if 1/3+ validators are offline, chain halts rather than forking

### Staking and governance

- Validators bond `ucnt` as stake — slashed for double-signing or downtime
- Delegators (token holders) can delegate stake to validators
- Governance proposals (parameter changes, upgrades) require on-chain voting

### Development / local

Single-node testnet: `chain/_build/single-node.sh` bootstraps a local chain with one validator.

---

## 7. Chain → Provider Bridge (Off-chain Listener)

The provider node (`provider/`) contains the bridge between chain events and workload orchestration:

```
provider/bidengine/
    │
    │ Subscribes to CometBFT WebSocket (tm.event='NewBlock' + EventOrder)
    │
    ▼
On EventOrderCreated:
    │ 1. Evaluate order (check resources, pricing)
    │ 2. Auto-sign and broadcast MsgCreateBid on-chain
    ▼
On EventLeaseCreated (tenant accepted our bid):
    │ 3. Wait for manifest upload from tenant (mTLS endpoint)
    │ 4. Deploy containers to Kubernetes/containerd
    │ 5. Report status back to tenant (hostname, ports)
    ▼
Per block:
    │ 6. Check escrow balance on chain
    │ 7. If escrow dry → stop serving, close lease
```

### packages/chain-client as the JS bridge

For JavaScript services (API, frontends) that need to submit on-chain transactions:

- `@comnetish/chain-client` provides `ComnetishClient`
- Must fix protobuf encoding before production (see section 10)

---

## 8. Cross-Chain: IBC and EVM Bridge

### IBC (Inter-Blockchain Communication)

The chain has `ibc-go v10` registered. This enables:

- Token transfers to/from other Cosmos chains (Osmosis, Cosmos Hub, etc.)
- Cross-chain smart contract calls (IBC Wasm)
- Eventually: bridge CNT to EVM chains via IBC-EVM relay (Axelar, Gravity Bridge)

### EVM Bridge Design (near-term)

Until a full IBC-EVM bridge is built, an oracle service acts as the bridge:

```
Oracle Service (Node.js / Go)
    │
    ├─ Watches Cosmos chain (x/market EventLeaseActive)
    │       │
    │       └─ Calls PaymentEscrow.markLeaseStarted() on EVM
    │
    └─ Watches Cosmos chain (x/market EventLeaseClosed)
            │
            └─ Calls PaymentEscrow.settleLease() on EVM
```

The oracle's EVM private key must be set as the `oracleAddress` in `PaymentEscrow` constructor.

### Long-term IBC bridge

1. Deploy `CNTToken` on an EVM chain with IBC-EVM support (e.g. Evmos, or deploy our own EVM rollup)
2. Use IBC + Gravity Bridge / Axelar to transfer `ucnt` ↔ ERC-20 CNT
3. PaymentEscrow on EVM references the IBC-bridged CNT token

---

## 9. Transaction Lifecycle on Cosmos Chain

When a user submits a transaction from the browser:

```
1. Frontend builds protobuf message (e.g. MsgCreateDeployment)
2. Signs with user's wallet (Keplr / Leap) or chain-client with HD wallet
3. Broadcasts signed tx to chain RPC endpoint: POST /broadcast_tx_sync
4. CometBFT mempool accepts tx → propagates to validators via P2P
5. Next block proposer includes tx in block
6. All validators execute tx against current state via ABCI app
7. State transitions committed to KV store (IAVL tree)
8. EventBus emits typed events (EventDeploymentCreated, etc.)
9. WebSocket subscribers (provider nodes, indexers) receive events
10. IndexerService syncs events to PostgreSQL via Prisma
11. REST API serves updated state to frontends
```

### Transaction fees

- Fee = gas × gas_price
- Gas price: `0.025ucnt` (set in `packages/chain-client/`)
- Minimum stake to transact: any amount (no minimum on testnet)

---

## 10. Protobuf & Encoding — Critical Fix Needed

**Current bug in `packages/chain-client/`:**

```typescript
// WRONG (current):
const msgBytes = textEncoder.encode(JSON.stringify(msg));
const anyMsg = { typeUrl, value: msgBytes };

// CORRECT (required for real chain):
import { MsgCreateDeployment } from "../generated/comnetish/deployment/v1/tx";
const msgBytes = MsgCreateDeployment.encode(msg).finish();
const anyMsg = {
  typeUrl: "/comnetish.deployment.v1.MsgCreateDeployment",
  value: msgBytes,
};
```

### Fix steps

1. Ensure `chain/proto/` has all `.proto` files (they should, as it's an Akash fork)
2. Install `buf` CLI: `brew install bufbuild/buf/buf`
3. Add `buf.gen.yaml` to chain-client that generates TypeScript from proto:
   ```yaml
   version: v1
   plugins:
     - plugin: ts_proto
       out: packages/chain-client/src/generated
       opt:
         - outputClientImpl=false
         - esModuleInterop=true
   ```
4. Run `buf generate` from chain directory
5. Replace JSON encoding in `ComnetishClient` with generated type encoders

Until this is fixed, `ComnetishClient` should run in mock mode for all dev work.

---

## 11. Chain Indexer Service

The API currently has no bridge from the Cosmos chain to its PostgreSQL DB.  
An indexer service is needed to keep the two in sync.

### Design

```
services/indexer/ (new service)
    │
    ├─ Subscribes to chain WebSocket (ws://localhost:26657/websocket)
    │   Query: "tm.event = 'Tx'"
    │
    ├─ Parses typed events from tx results:
    │   - akash.deployment.v1.EventDeploymentCreated → INSERT into Deployment
    │   - akash.market.v1.EventBidCreated            → INSERT into Bid
    │   - akash.market.v1.EventLeaseCreated          → INSERT into Lease + UPDATE Bid (WON)
    │   - akash.market.v1.EventLeaseClosed           → UPDATE Lease (CLOSED)
    │   - akash.deployment.v1.EventDeploymentClosed  → UPDATE Deployment (CLOSED)
    │
    ├─ Writes to PostgreSQL via Prisma (shared with API service)
    │
    └─ Also scans missed blocks on startup (catch-up indexing)
```

### Why needed

Without the indexer:

- The API DB only knows about deployments created through the REST API (not directly on-chain via Keplr)
- Provider bids submitted by the Go provider binary (not via API) are invisible to the tenant console
- On-chain lease state diverges from DB state over time

---

## 12. Network Bootstrap & Validator Setup

### Minimum viable testnet

```
Node 1: Validator + Seed
    config/genesis.json   (initial validators, token allocations)
    config/config.toml    (p2p addr, seeds, consensus timeouts)
    config/app.toml       (min gas price: "0.025ucnt")

Node 2..N: Full nodes (join after genesis)
    peers = ["<nodeID>@<ip>:26656"]
```

### Genesis configuration (key settings)

```json
{
  "chain_id": "comnetish-1",
  "app_state": {
    "bank": { "supply": [{ "denom": "ucnt", "amount": "1000000000000000" }] },
    "staking": { "params": { "bond_denom": "ucnt" } },
    "mint": { "params": { "mint_denom": "ucnt" } }
  }
}
```

### Local single-node dev

```bash
cd chain
./_build/single-node.sh
# Starts a single-validator chain on localhost
# Faucet address is printed — fund test wallets from it
```

### Validators in production

- Minimum 4 validators for meaningful BFT (1 can fail)
- Validators run in datacenters with UPS/redundant network
- Sentry node architecture: validators are hidden behind sentry full-nodes
- Validator keys stored in HSM (Hardware Security Module) or Tendermint KMS

---

## 13. Production Launch Roadmap

### Phase 1 — Internal testnet (now)

- [x] Single-node local chain
- [x] Off-chain API mock deployments
- [ ] Fix protobuf encoding in chain-client
- [ ] Wire MsgCreateDeployment from tenant console
- [ ] Connect provider Go binary to local chain

### Phase 2 — Multi-node testnet

- [ ] 4-validator testnet (cloud VMs)
- [ ] Chain indexer service
- [ ] Provider node onboarded + submitting real bids
- [ ] Manifest upload via mTLS from tenant console
- [ ] PaymentEscrow updated from USDC → CNT
- [ ] Oracle service (Cosmos ↔ EVM bridge)

### Phase 3 — Public testnet

- [ ] Faucet for CNT tokens
- [ ] Provider onboarding with real MsgCreateProvider
- [ ] Governance module active (param changes)
- [ ] Fiat on-ramp (Stripe → CNT mint)

### Phase 4 — Mainnet

- [ ] Genesis with founding validators
- [ ] CNT token distribution (team, investors, providers, ecosystem)
- [ ] IBC channels to Cosmos Hub / Osmosis
- [ ] Audit of PaymentEscrow + CNTToken contracts
- [ ] Multi-sig treasury for protocol fees
