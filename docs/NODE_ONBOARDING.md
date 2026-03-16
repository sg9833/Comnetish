# Comnetish — Node Onboarding & Network Topology

> **Purpose:** Complete guide for how providers join the network, how nodes connect to the chain P2P network, how the provider node registers and serves workloads, and the full topology from genesis to running provider.

---

## Table of Contents

1. [Overview — Three Types of Nodes](#1-overview--three-types-of-nodes)
2. [Becoming a Validator Node](#2-becoming-a-validator-node)
3. [Becoming a Provider Node](#3-becoming-a-provider-node)
4. [Provider Onboarding Flow (UI + Chain)](#4-provider-onboarding-flow-ui--chain)
5. [Chain P2P Discovery & Connection](#5-chain-p2p-discovery--connection)
6. [Provider Node Architecture](#6-provider-node-architecture)
7. [Provider Bidengine — Automated Bidding](#7-provider-bidengine--automated-bidding)
8. [Provider Gateway — Serving Tenants](#8-provider-gateway--serving-tenants)
9. [Provider Kubernetes Cluster Setup](#9-provider-kubernetes-cluster-setup)
10. [Provider Console — Dashboard Walkthrough](#10-provider-console--dashboard-walkthrough)
11. [Provider Registry On-Chain (x/provider)](#11-provider-registry-on-chain-xprovider)
12. [Connecting All Nodes: Network Diagram](#12-connecting-all-nodes-network-diagram)
13. [Operational Runbook](#13-operational-runbook)
14. [Current State vs Target State](#14-current-state-vs-target-state)

---

## 1. Overview — Three Types of Nodes

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Comnetish Network                           │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │  Validator    │    │  Full Node   │    │   Provider Node      │   │
│  │  Node         │    │  (Indexer /  │    │   (Akash fork)       │   │
│  │               │    │   RPC node)  │    │                      │   │
│  │ - Signs blocks│    │ - Syncs chain│    │ - Runs K8s cluster   │   │
│  │ - Staking     │    │ - Serves API │    │ - Bids on orders     │   │
│  │ - Slashable   │    │ - No voting  │    │ - Hosts containers   │   │
│  │               │    │   power      │    │ - Streams logs       │   │
│  └──────┬────────┘    └──────┬───────┘    └──────────┬───────────┘   │
│         │    CometBFT P2P    │                       │               │
│         └───────────────────►│◄──────────────────────┘               │
│                              │   subscribes to chain events          │
└─────────────────────────────────────────────────────────────────────┘
```

| Node type | Hardware need                | Chain role                          | Required for         |
| --------- | ---------------------------- | ----------------------------------- | -------------------- |
| Validator | High (reliable, low-latency) | Signs blocks, earns staking rewards | Chain consensus      |
| Full node | Medium                       | Syncs chain, serves RPC/REST        | API service, indexer |
| Provider  | High (compute resources)     | Bids, runs workloads                | Serving tenants      |

A server can run both a full node and provider node (common for small providers).  
Validators should NOT run provider nodes on the same machine (security / resource separation).

---

## 2. Becoming a Validator Node

### Prerequisites

- Server with stable internet, ≥99.9% uptime SLA
- Min hardware: 8 CPU, 32GB RAM, 500GB NVMe SSD
- Fixed / static IP recommended
- Sufficient `ucnt` stake (minimum varies by chain governance)

### Setup steps

#### Step 1 — Install and initialize the chain

```bash
# Clone the comnetish chain binary
git clone https://github.com/sg9833/Comnetish.git
cd Comnetish/chain

# Build the binary
make install  # installs 'comnetishd' to $GOPATH/bin

# Initialize node
comnetishd init <moniker> --chain-id comnetish-1

# Output: creates ~/.comnetish/ with:
#   config/config.toml  (P2P, RPC, consensus settings)
#   config/app.toml     (gas price, min fees, grpc)
#   config/genesis.json (replace with official genesis)
#   data/               (blockchain state)
#   keyring-file/       (wallet keys)
```

#### Step 2 — Configure the node

```toml
# ~/.comnetish/config/config.toml

[p2p]
seeds = "<seed_node_id>@seed.comnetish.network:26656"
persistent_peers = "<peer_id>@peer1.comnetish.network:26656"
external_address = "<YOUR_PUBLIC_IP>:26656"

[rpc]
laddr = "tcp://localhost:26657"   # only open to localhost (sentry pattern)

[consensus]
timeout_commit = "2s"
```

```toml
# ~/.comnetish/config/app.toml
minimum-gas-prices = "0.025ucnt"
```

#### Step 3 — Download official genesis

```bash
curl https://raw.githubusercontent.com/sg9833/Comnetish/main/chain/meta.json | \
  jq -r '.genesis_url' | xargs curl -o ~/.comnetish/config/genesis.json
```

#### Step 4 — Create validator key and fund it

```bash
# Create key
comnetishd keys add validator --keyring-backend file

# Fund from faucet (testnet only):
curl -X POST https://faucet.comnetish.network/claim \
  -d '{"address": "comnetish1youraddress..."}'
```

#### Step 5 — Sync the chain (wait for full sync)

```bash
comnetishd start
# Monitor: comnetishd status | jq '.SyncInfo.catching_up'
# Wait until catching_up == false
```

#### Step 6 — Create validator transaction

```bash
comnetishd tx staking create-validator \
  --amount 1000000ucnt \
  --pubkey $(comnetishd tendermint show-validator) \
  --moniker "My Provider Node" \
  --chain-id comnetish-1 \
  --commission-rate 0.05 \
  --commission-max-rate 0.20 \
  --commission-max-change-rate 0.01 \
  --min-self-delegation 1 \
  --from validator \
  --keyring-backend file \
  --fees 5000ucnt
```

#### Step 7 — Sentry architecture (production security)

```bash
# Sentry node config.toml (public-facing full node):
[p2p]
pex = true                        # enable peer exchange
private_peer_ids = ""             # sentry knows all peers
unconditional_peer_ids = "<validator_node_id>"

# Validator node config.toml (private):
[p2p]
pex = false                       # disable peer exchange (stealth)
persistent_peers = "<sentry1_id>@sentry1_ip:26656,<sentry2_id>@sentry2_ip:26656"
```

---

## 3. Becoming a Provider Node

### Prerequisites

- Servers with compute resources to offer (CPU/GPU/RAM/Storage)
- Kubernetes cluster (k3s works for single-node; full k8s for large providers)
- Domain name with TLS cert (for provider gateway endpoint)
- `ucnt` for transaction fees (bids, lease creation)
- Comnetish wallet (EVM + Cosmos addresses)

### Minimum hardware (per concurrent deployment)

- 1 vCPU + 2GB RAM overhead for provider daemon
- Plus: the compute requested in each SDL (provider bids only what it has available)

### Provider node binary

```bash
# Clone and build
git clone https://github.com/sg9833/Comnetish.git
cd Comnetish/provider
make install   # installs 'provider' binary

# Or use Docker:
docker pull comnetish/provider:latest
```

---

## 4. Provider Onboarding Flow (UI + Chain)

### Current state (provider console, port 3002)

The provider console at `/onboard` walks through an onboarding wizard:

```
Step 1: Connect Wallet
  → Provider connects EVM wallet (MetaMask) via RainbowKit
  → Provider signs SIWE challenge → receives JWT session token

Step 2: Server Details
  → Input: Server host URI (e.g. https://provider.myserver.com:8443)
  → Input: Region (e.g. "us-east", "in-mumbai")
  → Input: Available resources (CPU, Memory, Storage)

Step 3: Pricing
  → Set pricePerCpu (e.g. 0.1 CNT/hour)

Step 4: Submit Registration
  → Currently: POST /api/providers (writes to API DB only)
  → Target: ALSO broadcast MsgCreateProvider on Cosmos chain
```

### Target onboarding flow (full on-chain)

```javascript
// apps/provider-console/app/onboard/page.tsx — target implementation

// 1. Generate TLS certificate
const { privateKey, certificate, pubKeyDer } = await generateCert();

// 2. Store private key securely (provider server, not browser)
await storePrivateKey(privateKey); // server-side keystore

// 3. Broadcast MsgCreateCertificate on Cosmos chain
await chainClient.broadcastTx([
  {
    typeUrl: "/comnetish.cert.v1.MsgCreateCertificate",
    value: {
      owner: providerCosmosAddress,
      cert: certificate, // PEM encoded
      pubkey: pubKeyDer, // base64 DER
    },
  },
]);

// 4. Broadcast MsgCreateProvider on Cosmos chain
await chainClient.broadcastTx([
  {
    typeUrl: "/comnetish.provider.v1.MsgCreateProvider",
    value: {
      owner: providerCosmosAddress,
      host_uri: "https://provider.myserver.com:8443",
      attributes: [
        { key: "region", value: "us-east" },
        { key: "cpu", value: "32" },
        { key: "memory", value: "64Gi" },
        { key: "storage", value: "2Ti" },
      ],
      info: {
        email: providerEmail,
        website: providerWebsite,
      },
    },
  },
]);

// 5. Register in off-chain API DB (cache)
await fetch("/api/providers", {
  method: "POST",
  body: JSON.stringify({
    address,
    region,
    cpu,
    memory,
    storage,
    pricePerCpu,
    hostUri,
  }),
});
```

### Provider attribute system

Providers advertise capabilities via key-value attributes stored in `x/provider`:

```yaml
attributes:
  - key: region           value: us-east
  - key: tier             value: community     # or sovereign, enterprise
  - key: os               value: linux
  - key: arch             value: amd64
  - key: gpu              value: nvidia-rtx4090
  - key: gpu-count        value: 4
  - key: capabilities     value: storage-class-beta1
```

Tenants can filter providers by attributes in their SDL `placement` section.

---

## 5. Chain P2P Discovery & Connection

### How nodes find each other

CometBFT uses two mechanisms:

#### Seed nodes

Seed nodes are dedicated full nodes whose only job is to share peer lists.  
They do not sync the full chain or serve RPC.

```toml
# Any node's config.toml:
seeds = "nodeID1@seed1.comnetish.network:26656,nodeID2@seed2.comnetish.network:26656"
```

On startup:

1. Node connects to seed node
2. Seed node returns a list of known peers
3. Node disconnects from seed (doesn't maintain connection)
4. Node connects to discovered peers

#### Persistent peers

Alwyas-on peer connections:

```toml
persistent_peers = "nodeID@ip:26656,nodeID2@ip2:26656"
```

Used for: validator↔sentry, trusted infrastructure connections.

#### Node ID

A node's ID is the SHA256 of its ed25519 P2P public key, found in `node_key.json`:

```bash
comnetishd tendermint show-node-id
# → 3b5a9e7f...
```

### CometBFT P2P protocol

- Transport: TCP
- Multiplexed channels per connection:
  - `BlockchainChannel` — block sync
  - `MempoolChannel` — transaction propagation
  - `ConsensusChannel` — consensus votes
  - `EvidenceChannel` — misbehavior evidence
  - `SnapChannel` — state sync snapshots
- TLS: connections are authenticated with node P2P keys (Ed25519)

### Provider node connects as light client

Provider nodes do not need to store the full chain state.  
They connect to a trusted full node RPC/REST endpoint:

```yaml
# provider/config.yaml
chain:
  rpc_url: "http://fullnode.comnetish.network:26657"
  rest_url: "http://fullnode.comnetish.network:1317"
  chain_id: "comnetish-1"
```

The provider subscribes to CometBFT WebSocket events:

```
ws://fullnode:26657/websocket
→ subscribe: { "query": "tm.event='NewBlock'" }
→ subscribe: { "query": "message.action='/comnetish.market.v1.MsgCreateLease'" }
```

---

## 6. Provider Node Architecture

```
provider/ (Go binary)
├── bidengine/          Watch chain for orders → submit bids
├── gateway/            mTLS HTTP server for manifest upload
├── cluster/            Kubernetes workload management
├── manifest/           SDL → Kubernetes manifest conversion
├── session/            Provider ↔ chain session management
├── client/             Cosmos chain client
├── event/              Event handling pipeline
└── cmd/                CLI entry points
```

### Internal data flow

```
Chain WS events
      │
      ▼
event/ pipeline
      │
      ├─► bidengine/
      │   → filters matching orders
      │   → submits MsgCreateBid
      │
      ├─► On EventLeaseCreated (matching this provider):
      │   → activates manifest gateway endpoint for this lease
      │
      └─► On EventLeaseClosed:
          → stops serving deployment
          → cluster/ destroys Kubernetes namespace
```

### Provider service lifecycle for a single deployment

```
EventOrderCreated (on-chain)
      │ bidengine evaluates
      ▼
MsgCreateBid broadcast (provider signs, auto)
      │ tenant accepts bid
      ▼
EventLeaseCreated (on-chain)
      │ gateway activates for this {owner, dseq}
      ▼
POST /deployment/{owner}/{dseq}/manifest (tenant sends SDL)
      │ cluster/ processes
      ▼
Kubernetes namespace created + pods scheduled
      │ pods reach Running state
      ▼
GET /deployment/{owner}/{dseq}/status → returns service endpoints
      │
      ▼ (lease duration)
EventLeaseClosed (on-chain, or escrow dry)
      │
      ▼
cluster/ deletes Kubernetes namespace
```

---

## 7. Provider Bidengine — Automated Bidding

The bidengine in `provider/bidengine/` is a fully automated subsystem.  
Providers do not manually approve individual bids.

### Bidding logic

```go
// Pseudocode for bidengine evaluation:

func evaluateOrder(order Order) bool {
    // 1. Check if provider has capacity:
    available := cluster.GetAvailableResources()
    if order.requires.cpu > available.cpu { return false }
    if order.requires.memory > available.memory { return false }
    if order.requires.storage > available.storage { return false }

    // 2. Check placement constraints:
    if !matchesAttributes(order.placement.attributes, provider.attributes) { return false }

    // 3. Check price ceiling:
    bidPrice := calculateBid(order)  // e.g. pricePerCpu × requestedCpu
    if order.placement.maxPrice < bidPrice { return false }

    return true
}
```

### Bid price calculation

```
bidPrice = pricePerCpu × requestedCpu + pricePerGiB × requestedMemory
         + pricePerGiBStorage × requestedStorage
```

All in ucnt per block.

### Bid expiry

Bids expire after `x/market` BID_TIMEOUT blocks (~5 minutes by default).  
If the tenant does not create a lease within that window, the bid is automatically closed.

### Why use x/authz for bidengine

The bidengine signs transactions automatically without human approval.  
To avoid keeping the main provider wallet private key on a hot server:

1. Create a dedicated "operator" key on the server
2. Grant `MsgCreateBid` authz from provider wallet → operator key
3. Bidengine signs with operator key
4. If server is compromised, attacker can only submit bids (not withdraw funds)

---

## 8. Provider Gateway — Serving Tenants

The provider gateway is an HTTPS server running on the provider node:

```
provider/gateway/
├── server.go       — TLS + mTLS listener on port 8443
├── manifest.go     — POST /deployment/{owner}/{dseq}/manifest
├── status.go       — GET /deployment/{owner}/{dseq}/status
├── logs.go         — WebSocket /deployment/{owner}/{dseq}/logs
└── auth.go         — cert validation against x/cert on-chain
```

### Endpoint details

| Endpoint                              | Method | Auth | Description                           |
| ------------------------------------- | ------ | ---- | ------------------------------------- |
| `/deployment/{owner}/{dseq}/manifest` | POST   | mTLS | Receive SDL from tenant               |
| `/deployment/{owner}/{dseq}/status`   | GET    | mTLS | Return service endpoints + pod status |
| `/deployment/{owner}/{dseq}/logs`     | WS     | mTLS | Stream stdout/stderr from containers  |
| `/host`                               | GET    | None | Provider info (public)                |

### mTLS validation steps (in auth.go)

```go
// For every request:
1. Verify client TLS certificate signature
2. Extract public key from client cert
3. Query x/cert on-chain: GET /comnetish/cert/{clientAddress}/active
4. Compare on-chain pubkey with presented cert pubkey → must match
5. Query x/market: does a lease exist for {owner, dseq} and this provider?
6. If lease not ACTIVE → return 403 Unauthorized
```

### Service endpoint delivery

After containers are running:

```json
{
  "services": {
    "web": {
      "name": "web",
      "uris": ["web.abc123def.provider.example.com"],
      "ips": [{ "ip": "203.0.113.10", "port": 80, "externalPort": 32080 }],
      "observed_generation": 1,
      "replicas": 1,
      "ready_replicas": 1,
      "available_replicas": 1,
      "available": 1,
      "total": 1
    }
  }
}
```

The provider uses either:

- **Kubernetes Ingress** for HTTP services (subdomain routing)
- **NodePort / LoadBalancer** for TCP services
- Random subdomain generated from deployment ID

---

## 9. Provider Kubernetes Cluster Setup

### Option A — k3s (single node / small provider)

```bash
# Install k3s:
curl -sfL https://get.k3s.io | sh -

# Verify:
k3s kubectl get nodes

# Configure provider to use this cluster:
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
provider --config config.yaml
```

### Option B — Full Kubernetes (multi-node / large provider)

```bash
# Use kubeadm or managed k8s (EKS, GKE, AKS)
# Ensure:
# - RBAC enabled
# - NetworkPolicy support (Calico recommended)
# - Persistent volume provisioner configured
# - NodePort range exposed (30000-32767)
```

### Kubernetes permissions required by provider

```yaml
# provider-rbac.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: comnetish-provider
rules:
  - apiGroups: ["", "apps", "networking.k8s.io"]
    resources:
      [
        "namespaces",
        "pods",
        "services",
        "deployments",
        "ingresses",
        "persistentvolumeclaims",
        "configmaps",
      ]
    verbs: ["create", "get", "list", "watch", "update", "delete"]
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get", "list", "watch"]
```

### GPU support

```bash
# If offering GPU:
kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/main/deployments/static/nvidia-device-plugin.yml

# Verify:
kubectl get nodes -o json | jq '.items[].status.capacity | keys'
# Should see: "nvidia.com/gpu"
```

---

## 10. Provider Console — Dashboard Walkthrough

**URL:** `http://localhost:3002` (dev) or `https://provider.yourdomain.com` (prod)

### Authentication

1. Connect MetaMask wallet
2. Sign SIWE challenge message
3. Session JWT stored in browser

### Dashboard (/)

- Active Leases: count + list
- Total Earnings (CNT): from DB via `GET /api/providers/me/stats`
- Monthly Earnings estimate
- CPU/Memory/Storage utilization
- Recent Bids: open, won, lost
- Live network map showing other providers

### Leases page (/leases)

- Each active lease shows: tenant address, SDL service name, resources consumed, earnings
- Status: PENDING (manifest not yet received) → ACTIVE (containers running) → CLOSED

### Bids page (/bids)

- Incoming bids: deployment ID, requested resources, bid status
- Won bids → link to lease detail
- Lost bids: greyed out

### Settings / Profile (/settings)

- Update pricePerCpu, region, available resources
- Update host URI (triggers MsgUpdateProvider on-chain)
- Manage TLS certificate (renew if expired)

---

## 11. Provider Registry On-Chain (x/provider)

### On-chain provider record

```protobuf
// chain/x/provider/types/
message Provider {
  string owner    = 1;   // comnetish1... address (Cosmos)
  string host_uri = 2;   // https://provider.example.com:8443
  repeated Attribute attributes = 3;
  ProviderInfo info = 4;
}

message ProviderInfo {
  string email   = 1;
  string website = 2;
}
```

### Provider status (off-chain)

The on-chain record doesn't have "online/offline" status — this is tracked in the API DB (`Provider.status`, `Provider.lastSeen`).  
Providers send regular heartbeats to `PATCH /api/providers/me`:

```
PATCH /api/providers/me
{ status: "ACTIVE", lastSeen: "2026-03-16T10:30:00Z" }
```

If `lastSeen > 5 minutes ago`, the API marks the provider as INACTIVE in the UI.

### Provider attributes vs audit attributes

- **Provider self-reported:** CPU count, memory, region, GPU type — anyone can claim anything
- **Auditor-attested:** An authorized auditor signs an attestation that the provider actually has what they claim
- Tenants can filter by audited-only providers for higher trust deployments

---

## 12. Connecting All Nodes: Network Diagram

```
                        INTERNET
                            │
              ┌─────────────┴─────────────┐
              │                           │
    ┌─────────▼──────────┐   ┌────────────▼──────────┐
    │  Seed Node A        │   │  Seed Node B           │
    │  seed.comnetish.net │   │  seed2.comnetish.net   │
    └─────────┬───────────┘   └────────────┬───────────┘
              │     P2P (CometBFT TCP)      │
    ┌─────────▼─────────────────────────────▼──────────┐
    │                  P2P Network                      │
    │                                                   │
    │  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
    │  │ Sentry A │  │ Sentry B │  │ Full Node│        │
    │  └─────┬────┘  └────┬─────┘  └───┬──────┘        │
    │        │             │            │               │
    │   ┌────▼─────┐  ┌────▼──────┐     │               │
    │   │Validator1│  │Validator2 │  RPC/REST/gRPC      │
    │   └──────────┘  └───────────┘     │               │
    └───────────────────────────────────┼────────────────┘
                                        │
                            ┌───────────▼───────────┐
                            │    API Service         │
                            │    services/api/        │
                            │    (off-chain cache)    │
                            └───────────┬────────────┘
                                        │
                     ┌──────────────────┴────────────────────┐
                     │                                        │
            ┌────────▼──────────┐                   ┌────────▼──────────┐
            │  Tenant Console   │                   │ Provider Console  │
            │  apps/console     │                   │ apps/provider-    │
            │  :3000            │                   │ console  :3002    │
            └────────┬──────────┘                   └────────┬──────────┘
                     │                                        │
                     │  mTLS direct                           │
                     └──────────────┬─────────────────────────┘
                                    │
                    ┌───────────────▼────────────────────┐
                    │  Provider Node                      │
                    │  provider/ Go binary                │
                    │  + Kubernetes cluster               │
                    │  + Provider gateway :8443           │
                    └─────────────────────────────────────┘
```

---

## 13. Operational Runbook

### Start a local dev network (single node)

```bash
# Terminal 1: Start chain
cd chain && ./_build/single-node.sh

# Terminal 2: Start provider daemon
cd provider && provider --config config.yaml \
  --from <provider-key-name> \
  --chain-id comnetish-1 \
  --node http://localhost:26657

# Terminal 3: Start API
cd services/api && API_PORT=3001 bun run src/index.ts

# Terminal 4: Start provider console
cd apps/provider-console && pnpm dev

# Terminal 5: Start tenant console
cd apps/console && pnpm dev
```

### Register a new provider on testnet

```bash
# 1. Fund provider wallet from faucet
comnetishd tx bank send faucet <provider-addr> 10000000ucnt --chain-id comnetish-1

# 2. Create provider certificate
provider tx create-certificate pem \
  --chain-id comnetish-1 --from <provider-key>

# 3. Create provider registration
provider tx create \
  --host https://provider.example.com:8443 \
  --chain-id comnetish-1 --from <provider-key>

# 4. Verify on-chain
comnetishd query provider get <provider-addr>
```

### Monitor provider health

```bash
# Check active leases
curl http://localhost:3001/api/providers/me/leases \
  -H "Authorization: Bearer <jwt>"

# Check provider chain status
comnetishd query market lease list --provider <provider-addr>

# Check Kubernetes deployments
kubectl get pods --all-namespaces | grep comnetish-
```

---

## 14. Current State vs Target State

| Feature                        | Current                      | Target                 | Work needed                                              |
| ------------------------------ | ---------------------------- | ---------------------- | -------------------------------------------------------- |
| Provider UI onboarding         | ✅ Wizard exists             | ✅ + on-chain tx       | Add MsgCreateProvider + MsgCreateCertificate on submit   |
| Provider SIWE auth             | ✅ Works                     | ✅ same                | —                                                        |
| Provider on-chain registration | ❌ API DB only               | ✅ x/provider on-chain | chain-client fix + MsgCreateProvider broadcast           |
| Provider bidengine             | ✅ Real (Go binary)          | ✅ same                | Connect to running chain                                 |
| Provider gateway mTLS          | ✅ Real (Go binary)          | ✅ same                | Connect to running chain, tenant console manifest upload |
| Provider K8s orchestration     | ✅ Real (Go binary)          | ✅ same                | K8s cluster required                                     |
| P2P chain networking           | ✅ CometBFT built-in         | ✅ same                | Need live validators for testnet                         |
| Provider status heartbeat      | ✅ API `/providers/me` PATCH | ✅ same                | —                                                        |
| Bid automation                 | ✅ bidengine (Go)            | ✅ same                | Chain must be running + real orders                      |
| Tenant cert for mTLS           | ❌ Not implemented           | ✅ Web Crypto API      | New code in tenant console                               |
| Provider audit attestation     | ❌ Not implemented           | ✅ x/audit             | Admin UI for auditors                                    |
| Provider log streaming         | ⚠️ WS route exists           | ✅ piped from provider | Implement WS proxy in API                                |
