# Comnetish — Security Model

> **Purpose:** Comprehensive reference for every security mechanism in the system — covering authentication, authorization, transport security, chain-level security, wallet signing, oracle trust, and known gaps.

---

## Table of Contents

1. [Threat Model](#1-threat-model)
2. [Authentication Layers](#2-authentication-layers)
3. [Authorization Model (RBAC + Ownership)](#3-authorization-model-rbac--ownership)
4. [Cosmos Chain Security](#4-cosmos-chain-security)
5. [EVM Layer Security](#5-evm-layer-security)
6. [Transport Security — mTLS Between Tenant and Provider](#6-transport-security--mtls-between-tenant-and-provider)
7. [API Service Security](#7-api-service-security)
8. [Wallet Security](#8-wallet-security)
9. [Oracle Security](#9-oracle-security)
10. [Smart Contract Security](#10-smart-contract-security)
11. [Chain Client Security](#11-chain-client-security)
12. [Provider Node Security](#12-provider-node-security)
13. [Container Isolation Security](#13-container-isolation-security)
14. [Key Management](#14-key-management)
15. [Known Gaps and Remediation Plan](#15-known-gaps-and-remediation-plan)

---

## 1. Threat Model

### Actors

| Actor       | Trust level                 | What they control                                    |
| ----------- | --------------------------- | ---------------------------------------------------- |
| Tenant      | Self-custody                | Their wallet keys, their SDL, their deployments      |
| Provider    | Self-custody                | Their server infrastructure, provider wallet keys    |
| Validator   | High (bonded stake)         | Block production, consensus                          |
| Auditor     | Moderate                    | Provider attribute attestations                      |
| Oracle      | Moderate (single key today) | EVM PaymentEscrow `markLeaseStarted` / `settleLease` |
| API service | Infrastructure trust        | DB reads/writes, session tokens                      |
| Attacker    | Zero                        | —                                                    |

### Key threat scenarios

| Threat                                             | Where it applies      | Mitigated by                                                         |
| -------------------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| Fake provider claims resources in a fake bid       | x/market              | Stake-based bonding, auditor attestations, mTLS cert on-chain        |
| Tenant doesn't pay after receiving service         | x/escrow              | Escrow locked before lease; provider can close lease if empty        |
| Provider takes payment but doesn't run workload    | PaymentEscrow         | `markLeaseStarted` only after provider confirms; cancellation window |
| MITM between tenant and provider manifest upload   | mTLS / x/cert         | Both sides validate cert against on-chain state                      |
| Compromised API server                             | services/api/         | API is a cache; chain is source of truth; API cannot forge chain txs |
| Replay attacks on wallet signatures                | SIWE challenge nonces | `AuthChallenge.nonce` one-time-use, `consumedAt` tracked             |
| SQL injection                                      | services/api/ Prisma  | Prisma parameterized queries                                         |
| XSS                                                | apps/console/         | Next.js escaping, no dangerouslySetInnerHTML                         |
| Malicious SDL (supply chain)                       | SDL validation        | Image digest pinning, restricted image registries (planned)          |
| Unauthorized tenant accessing another's deployment | API RBAC              | Ownership check in every deployment endpoint                         |

---

## 2. Authentication Layers

### Layer 1 — Email / Password (API, traditional auth)

- **Password hashing:** bcrypt (configured in `services/api/src/lib/auth/`)
- **Session:** HTTP-only `Secure` cookie containing a signed session token
- **Refresh token:** hashed and stored in DB (`Session.refreshTokenHash`)
- **Email verification:** hashed one-time token (`EmailVerificationToken`), expires after TTL
- **Password reset:** hashed one-time token (`PasswordResetToken`), expires after TTL

### Layer 2 — OAuth (GitHub / Google)

- **Standard OAuth 2.0 authorization code flow**
- State parameter enforced to prevent CSRF
- Token exchange happens server-side (not exposed to browser)
- OAuthAccount table stores `(provider, providerAccountId)` — no OAuth tokens stored

### Layer 3 — Wallet Sign-In (SIWE — Sign-In With Ethereum)

Used for provider console authentication and tenant wallet linking.

```
1. Client requests challenge:
   POST /api/providers/auth/challenge  { walletAddress: "0x..." }
   → Server creates AuthChallenge { nonce, message, chainType: EVM, expiresAt: now+5min }
   → Returns: { message: "Sign this message to authenticate...\nNonce: abc123" }

2. Client signs message with wallet (MetaMask / ethers.js):
   const signature = await signer.signMessage(message);

3. Client submits signature:
   POST /api/providers/auth/verify  { walletAddress, message, signature }
   → Server calls viem.verifyMessage({ address: walletAddress, message, signature })
   → If valid: mark challenge consumedAt, issue JWT bearer token

4. JWT bearer token used for subsequent provider API calls
   Authorization: Bearer <token>
```

**Why SIWE is secure:**

- The nonce is one-time-use (`consumedAt` timestamp prevents replay)
- The message is signed with the user's private key — only the wallet owner can sign
- `verifyMessage()` (ECDSA recovery) cannot be faked without the private key
- Message includes domain + expiry so signatures are domain-locked and time-limited

### Layer 4 — Cosmos Wallet Auth (for Cosmos-native operations)

Cosmos chain transactions are inherently authenticated:

- Every `Tx` must be signed by the owner's secp256k1 key via `SignDoc`
- The chain verifies the signature in `ante.go` before execution
- No separate auth needed for on-chain actions

### Session types

| `SessionType`      | Used by             | Token location         |
| ------------------ | ------------------- | ---------------------- |
| `BROWSER`          | Tenant console      | HTTP-only cookie       |
| `API_TOKEN`        | Programmatic access | Bearer token in header |
| `PROVIDER_CONSOLE` | Provider console    | Bearer token (JWT)     |

---

## 3. Authorization Model (RBAC + Ownership)

### Roles

| Role       | Can do                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| `TENANT`   | Create/view/close their own deployments; link wallets; bid on resources |
| `PROVIDER` | Submit bids; manage leases; update provider profile                     |
| `ADMIN`    | View/close any deployment; manage users; system operations              |

### Enforcement in API

Every sensitive endpoint calls one or more of:

```typescript
// Role check:
await ensureRole(user, "TENANT"); // throws 403 if wrong role
await ensureRole(user, ["TENANT", "ADMIN"]); // multi-role check

// Ownership check (deployment belongs to this user's wallet):
await canAccessDeployment(user, deploymentId);

// Wallet address ownership check:
await userOwnsTenantAddress(user, tenantAddress);
// → checks user.wallets where address == tenantAddress OR uses user.wallets[0]
```

These helpers are in `services/api/src/lib/auth/authorization.ts`.

### Chain-level authorization

On-chain, authorization is enforced by the Cosmos SDK:

- `x/deployment`: only the `owner` address can `MsgCloseDeployment` or `MsgUpdateDeployment`
- `x/market`: only the matching `owner` can `MsgCreateLease`; only the lease `provider` can `MsgCloseLease`
- `x/authz`: owners can delegate authority to other addresses (e.g. provider bidengine can bid on behalf of a provider wallet)

`x/authz` usage in provider:

```go
// Provider bidengine uses authz to sign bids with an operator key
// instead of exposing the main provider wallet private key on the server
authzGrant: {
  granter: "comnetish1provider...",   // main provider wallet
  grantee: "comnetish1operator...",  // hot key on provider server
  authorization: GenericAuthorization{ msg: "/comnetish.market.v1.MsgCreateBid" }
}
```

---

## 4. Cosmos Chain Security

### Transaction signing

All state changes require a valid secp256k1 signature on the `SignDoc`:

```
SignDoc {
  body_bytes: serialized TxBody (messages + memo + timeout)
  auth_info_bytes: serialized AuthInfo (fee + signer info)
  chain_id: "comnetish-1"        // prevents cross-chain replay
  account_number: 42             // prevents cross-account replay
  sequence: 7                    // prevents replay of same tx
}
```

### Account sequence (replay protection)

Each account has a monotonically increasing `sequence` number. Replaying a tx fails because the sequence no longer matches.

### Validator security

- Double-sign slashing: validators that sign two conflicting blocks at same height lose a portion of bonded stake
- Downtime slashing: validators offline > X% of blocks lose a smaller portion of bonded stake
- Sentry node architecture: validator's P2P port is only reachable from sentry nodes, not public internet (DDoS protection)

### Governance / upgrade security

- Chain upgrades require a governance vote passing (>50% stake, quorum)
- `x/upgrade` module handles coordinated binary upgrades at a specific block height
- No single actor (not even the team) can modify chain state without consensus

---

## 5. EVM Layer Security

### PaymentEscrow access control

| Function           | Who can call                                                      |
| ------------------ | ----------------------------------------------------------------- |
| `depositForLease`  | Anyone (typically tenant)                                         |
| `markLeaseStarted` | `oracleAddress` only                                              |
| `settleLease`      | `oracleAddress` OR anyone after `maxDuration` expires             |
| `cancelLease`      | Tenant only, within cancellation window before `markLeaseStarted` |
| `setOracle`        | Contract `owner` only                                             |

### CNTToken access control

| Function                              | Who can call          |
| ------------------------------------- | --------------------- |
| `mint`                                | Contract `owner` only |
| `transfer`, `approve`, `transferFrom` | Standard ERC-20 rules |
| `transferOwnership`                   | Current owner only    |

### Risks

**Oracle private key is a single point of failure today.**  
If the oracle key is compromised:

- Attacker can call `markLeaseStarted` on fake leases (blocks tenant cancellation)
- Attacker can call `settleLease` and drain escrow to a provider

**Mitigations (planned):**

1. Replace single oracle with a multi-sig oracle (Gnosis Safe) — requires N-of-M signatures for any oracle action
2. Add a time-lock: any oracle action > $X can be challenged within 24h
3. Add the Cosmos chain validators as the oracle authority (IBC-controlled oracle)

---

## 6. Transport Security — mTLS Between Tenant and Provider

This is the cornerstone of the provider↔tenant trust model.

### Certificate lifecycle

```
Tenant:
  1. Generates ED25519 key pair locally
  2. Creates self-signed TLS cert from key pair
  3. Broadcasts MsgCreateCertificate on Cosmos chain (cert public key stored on-chain)
  4. Signs manifest requests with cert private key

Provider:
  1. Same — generates key pair, stores on-chain cert
  2. Provider gateway TLS certificate = on-chain cert

mTLS Handshake:
  1. Tenant connects to provider.host_uri (TLS)
  2. Provider presents its TLS cert
  3. Tenant validates: is this cert's public key in x/cert for this provider address?
  4. Provider requests client cert (mutual TLS)
  5. Tenant presents its TLS cert
  6. Provider validates: is this cert's public key in x/cert for this tenant address?
  7. Both sides validated → connection established
  8. Provider also checks: does this tenant have an active lease for this deployment?
```

### Why this is secure

- Certs are on-chain → no centralized CA can issue fraudulent certs
- Cert revocation: `MsgRevokeCertificate` — revoked certs rejected immediately
- MITM attacker cannot forge a cert without the private key AND publishing it on-chain (which would expose the address)
- Provider cannot serve a different tenant's workload because lease ownership is on-chain

### Current gap

The tenant console does not yet generate/manage mTLS certs. Implementation needed:

1. On first deploy, generate an ED25519 key pair in the browser (Web Crypto API)
2. Store private key in browser's secure storage (or local keystore)
3. Submit `MsgCreateCertificate` to chain
4. Use the key to sign JWT for manifest upload requests

---

## 7. API Service Security

### Input validation

All routes use `zod` + `@hono/zod-validator` for request body validation:

```typescript
app.post('/', zValidator('json', createDeploymentSchema), async (c) => { ... });
```

Invalid inputs are rejected before reaching business logic.

### SQL injection prevention

All DB queries use Prisma's parameterized API — no raw SQL with user input.

### CORS

Configured from `API_CORS_ORIGIN` env var. Only allowed origins can make credentialed requests.

```typescript
app.use(
  cors({
    origin: process.env.API_CORS_ORIGIN?.split(",") ?? [],
    credentials: true,
  }),
);
```

### Session security

- Session tokens: HTTP-only, Secure, SameSite=Strict cookies
- Refresh tokens: stored only as bcrypt hash in DB — even if DB is breached, tokens cannot be replayed
- Session revocation: `revokedAt` timestamp checked on every request

### Rate limiting (needed, not yet implemented)

Auth endpoints (login, signup, password reset) should have rate limiting to prevent brute force:

```typescript
// services/api/src/middleware/rate-limit.ts
// Recommend: @hono/rate-limiter or custom Redis-backed limiter
// 5 login attempts per minute per IP
// 3 password reset requests per hour per email
```

---

## 8. Wallet Security

### Frontend wallet — MetaMask / RainbowKit

- Private keys never leave MetaMask — signing happens in the extension
- `wagmi` + RainbowKit handles wallet connection, never sees the private key
- `useWriteContract` calls are user-confirmed in MetaMask popup
- `erc20Abi` from `viem` is the standard ABI — no custom untrusted ABI loaded dynamically

### Chain client wallet (chain-client package)

`ComnetishClient` uses `DirectSecp256k1HdWallet`:

```typescript
const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
  prefix: "comnetish",
});
```

**Critical warning:** Mnemonics must NEVER be stored in environment variables on client-side code or committed to git. For the provider node (server-side), the mnemonic is loaded from a secure file or vault.

Best practices:

- Operator key (hot): HSM or Vault secret → loaded at runtime
- Validator key: stored in `priv_validator_key.json`, separate disk, backed up
- Never log mnemonics or private keys
- `.gitignore` must include `*.mnemonic`, `priv_validator_key.json`, `node_key.json`

### Keplr integration (for browser-based Cosmos signing)

For production tenant console, use Keplr wallet (browser extension) instead of HD wallet in chain-client:

```typescript
// User's private key stays in Keplr — not exposed to the app
const offlineSigner = window.keplr.getOfflineSigner("comnetish-1");
const client = await SigningStargateClient.connectWithSigner(
  RPC_URL,
  offlineSigner,
);
```

---

## 9. Oracle Security

### Current design (insecure for production)

- Single oracle address controlled by Comnetish team
- Oracle private key stored in environment variable on API server
- Any compromise of the server → compromise of all EVM escrow funds

### Production-grade oracle design

#### Option A — Multi-sig oracle

```
Gnosis Safe (3-of-5 multi-sig)
  └── signers: 5 Comnetish team members / independent auditors
  └── any oracle action (markLeaseStarted, settleLease) requires 3 signatures
```

#### Option B — Cosmos validators as oracle (most trustless)

```
1. Provider submits proof-of-work receipt on Cosmos chain
2. Validators vote on whether lease started (via governance light client or module)
3. On-chain vote result triggers oracle action via IBC → EVM bridge
   → PaymentEscrow.markLeaseStarted called by bridge relayer
```

#### Option C — Provider attestation + challenge period

```
1. Provider calls oracle endpoint: "lease X has started"
2. Oracle marks lease started ONLY after challenge period (1 hour)
3. During challenge period, tenant can dispute on-chain
4. If no dispute → oracle calls markLeaseStarted
```

Option C is the most practical near-term improvement with no external dependencies.

---

## 10. Smart Contract Security

### Checks in PaymentEscrow.sol

- Reentrancy: `settleLease` and `cancelLease` set state before transferring tokens (Checks-Effects-Interactions pattern ✅)
- Access control: `onlyOracle` modifier on sensitive functions ✅
- Integer overflow: Solidity 0.8.x has built-in overflow protection ✅
- Balance checks: `require(amount > 0)`, `require(!lease.isSettled)` etc. ✅

### Remaining concerns

- **No formal audit:** Contracts have not been audited by a third party
- **Oracle centralization:** (covered in section 9)
- **No timelock on `setOracle`:** Owner can change oracle address immediately — add 48h timelock
- **No emergency pause:** If a bug is found, there is no `pause()` circuit breaker — add `Pausable`

### Recommended additions before mainnet

```solidity
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PaymentEscrow is Pausable, ReentrancyGuard {
    function depositForLease(...) external whenNotPaused nonReentrant { ... }
    function settleLease(...) external whenNotPaused nonReentrant { ... }

    // Owner can pause in emergency
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
```

---

## 11. Chain Client Security

### Protobuf encoding (critical security fix)

The current JSON encoding in chain-client `packages/chain-client/` could allow message manipulation:

```typescript
// UNSAFE (current):
const value = textEncoder.encode(JSON.stringify(msg));
// A crafted SDL could inject JSON fields that get into the encoding
// This WILL fail against a real chain anyway (wrong wire format)

// SAFE (needed):
const value = MsgCreateDeployment.encode(msg).finish();
// Protobuf encoding is deterministic and type-safe
```

Fix this before connecting chain-client to a real chain.

### RPC endpoint validation

Never accept RPC endpoint URLs from user input — an attacker could redirect the client to a malicious RPC that returns fake state.

```typescript
// Validate against a whitelist:
const ALLOWED_RPC_ENDPOINTS = [
  "http://localhost:26657",
  "https://rpc.comnetish.network",
];
if (!ALLOWED_RPC_ENDPOINTS.includes(rpcUrl))
  throw new Error("Untrusted RPC endpoint");
```

---

## 12. Provider Node Security

### Bidengine key security

The bidengine submits `MsgCreateBid` transactions automatically. The signing key must be:

- A **dedicated operator key** (not the main provider wallet)
- Authorized via `x/authz` grant from the provider wallet
- Stored in HSM or encrypted keyfile on the provider server
- Never exposed in logs or API responses

### Gateway security

- mTLS with on-chain cert validation (see section 6)
- Rate limiting on manifest upload endpoint
- SDL content validation before deploying (prevent malicious images)
- Container image digest pinning (prevent `latest` tag drift)

### DDoS protection

- Provider gateway should be behind a reverse proxy (nginx/Caddy) with:
  - Connection rate limiting
  - Request size limits
  - TLS termination

---

## 13. Container Isolation Security

Each tenant deployment runs in its own Kubernetes namespace (see DEPLOYMENT_LIFECYCLE.md).

### Kubernetes isolation controls

- **NetworkPolicy:** deny all ingress/egress except explicitly allowed ports
- **ResourceQuota:** CPU/memory/storage limits matching SDL request
- **PodSecurityPolicy / PSA:** no privileged containers, no host network, no host PID
- **AppArmor / seccomp:** restrict syscall surface (planned)
- **Image policy:** providers can whitelist/blacklist registries

### SDL image security

The tenant's SDL specifies a container image. Security concerns:

- Tenant could specify `image: malware/cryptominer` — provider must accept this (it's their compute)
- Provider uses `x/audit` attribute `no-restricted-images: true` to advertise their policy
- Tenants know what their code does — they own it

### Resource exhaustion prevention

- SDL resource limits are enforced by Kubernetes — a tenant cannot consume more than requested
- Noisy neighbor prevention: CPU/memory limits ensure one tenant can't starve another

---

## 14. Key Management

### Summary of all keys in the system

| Key                           | Location                      | Protection                            |
| ----------------------------- | ----------------------------- | ------------------------------------- |
| Validator consensus key       | `priv_validator_key.json`     | HSM or encrypted disk, never exposed  |
| Validator node P2P key        | `node_key.json`               | Server disk, backed up                |
| Provider wallet key           | Provider server               | Vault secret / encrypted keyfile      |
| Provider operator key (authz) | Provider server (hot)         | Env var or Vault (rotate regularly)   |
| Oracle key                    | API server                    | Vault secret → replace with multi-sig |
| CNTToken owner key            | API server or cold wallet     | Multi-sig strongly recommended        |
| PaymentEscrow owner key       | Cold wallet (hardware wallet) | Never online                          |
| Tenant wallet key             | Browser (MetaMask) or Keplr   | User's responsibility                 |
| API JWT signing secret        | `JWT_SECRET` env var          | Vault secret, rotate periodically     |

### Key rotation policy

- Oracle key: rotate every 90 days
- Operator key: rotate every 30 days
- JWT secret: rotate every 90 days (requires all session tokens re-issued)
- Validator consensus key: never rotated (changing requires coordination)

---

## 15. Known Gaps and Remediation Plan

| Gap                                            | Severity | Remediation                                   | Priority                      |
| ---------------------------------------------- | -------- | --------------------------------------------- | ----------------------------- |
| Oracle is single key                           | Critical | Multi-sig oracle or on-chain validator oracle | P0 — before mainnet           |
| No rate limiting on auth endpoints             | High     | Add rate limiter middleware                   | P1                            |
| chain-client uses JSON encoding (not protobuf) | High     | Protobuf codegen + fix encoding               | P1                            |
| PaymentEscrow not audited                      | High     | Third-party smart contract audit              | P1 — before significant funds |
| No Pausable / emergency circuit breaker        | High     | Add `Pausable` to contracts                   | P1                            |
| Tenant mTLS cert not implemented in console    | High     | Web Crypto API cert generation                | P2                            |
| CNTToken minting key is single owner           | High     | Multi-sig or governance-controlled minting    | P1                            |
| No setOracle timelock                          | Medium   | 48h timelock on oracle address changes        | P2                            |
| No API rate limiting                           | Medium   | Redis-backed rate limiter                     | P2                            |
| No container image policy enforcement          | Medium   | Provider image whitelist/blacklist            | P2                            |
| No security logging / monitoring               | Medium   | Add structured security event logging         | P2                            |
| JWT secret in env var                          | Low      | Move to Vault                                 | P3                            |
