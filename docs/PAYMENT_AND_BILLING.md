# Comnetish — Payment & Billing

> **Purpose:** Complete reference for how payment and billing works across the Cosmos chain (ucnt), EVM layer (CNT ERC-20), and off-chain API. Covers the decision to replace USDC with CNT, fiat on-ramp design, escrow mechanics, provider earnings, and billing audit trail.

---

## Table of Contents

1. [Token System — CNT and ucnt](#1-token-system--cnt-and-ucnt)
2. [Decision: Remove USDC, Use CNT](#2-decision-remove-usdc-use-cnt)
3. [Fiat On-Ramp Design](#3-fiat-on-ramp-design)
4. [Cosmos Chain Billing (ucnt)](#4-cosmos-chain-billing-ucnt)
5. [EVM Layer Billing (CNT)](#5-evm-layer-billing-cnt)
6. [PaymentEscrow Contract — Changes Required](#6-paymentescrow-contract--changes-required)
7. [Full Payment Flow — Annotated Step by Step](#7-full-payment-flow--annotated-step-by-step)
8. [Provider Earnings Tracking](#8-provider-earnings-tracking)
9. [Billing Audit Trail (API + DB)](#9-billing-audit-trail-api--db)
10. [Billing Route — What Needs to Be Built](#10-billing-route--what-needs-to-be-built)
11. [Pricing Model](#11-pricing-model)
12. [Protocol Fee (Take Rate)](#12-protocol-fee-take-rate)
13. [Refunds](#13-refunds)

---

## 1. Token System — CNT and ucnt

| Token  | Layer        | Denom  | Decimals                   | Role                                  |
| ------ | ------------ | ------ | -------------------------- | ------------------------------------- |
| `ucnt` | Cosmos chain | `ucnt` | 6 (1 CNT = 1,000,000 ucnt) | Native gas + lease payments + staking |
| `CNT`  | EVM (ERC-20) | `CNT`  | 18                         | EVM-native payments + DeFi + wallets  |

### Why two representations?

- **Cosmos side:** `ucnt` is the native token. All on-chain payments (escrow, streaming leases) use `ucnt`. No EVM required for Cosmos-native users.
- **EVM side:** MetaMask users hold ERC-20 `CNT`. They interact with `PaymentEscrow.sol` using their MetaMask wallet.
- **Bridge:** A lock-and-mint bridge converts between `ucnt` and ERC-20 `CNT`. 1 ucnt on Cosmos ≡ 0.000001 CNT ERC-20 (accounting for decimal difference: 6 vs 18 decimals, so 1 ucnt = 10^12 wei of CNT).

---

## 2. Decision: Remove USDC, Use CNT

### Why remove USDC?

| Factor           | USDC                                        | CNT                                          |
| ---------------- | ------------------------------------------- | -------------------------------------------- |
| Issuer           | Circle (centralized)                        | Comnetish (protocol-owned)                   |
| Supply control   | Circle's discretion                         | Governance + bridge                          |
| Dependency       | Requires Circle approval, may be restricted | No external dependency                       |
| Value stability  | Pegged to USD                               | Market-determined (or governance-stabilized) |
| DeFi integration | Easy (widely accepted)                      | Needs exchange listings                      |
| Regulatory       | Increasingly regulated                      | Still evolving                               |

**Decision:** CNT is the sole payment token. If price stability matters for tenants, consider a CNT/USD oracle price feed for displaying USD-equivalent costs, but payments are always in CNT.

### What to update

#### `contracts/src/PaymentEscrow.sol`

```diff
- IERC20 public usdcToken;
+ IERC20 public cntToken;

- constructor(address _usdcToken, address _oracleAddress) {
-     usdcToken = IERC20(_usdcToken);
+ constructor(address _cntToken, address _oracleAddress) {
+     cntToken = IERC20(_cntToken);

- usdcToken.transferFrom(msg.sender, address(this), amount)
+ cntToken.transferFrom(msg.sender, address(this), amount)

- usdcToken.transfer(lease.provider, amount)
+ cntToken.transfer(lease.provider, amount)
```

#### `contracts/scripts/deploy.ts`

```diff
- const paymentEscrow = await PaymentEscrow.deploy(usdcToken.address, oracleAddress);
+ const paymentEscrow = await PaymentEscrow.deploy(cntToken.address, oracleAddress);
```

#### `apps/console/app/deploy/page.tsx`

```diff
- const USDC_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_USDC_TOKEN_ADDRESS as `0x${string}`;
- const USDC_SPENDER_ADDRESS = process.env.NEXT_PUBLIC_USDC_SPENDER_ADDRESS as `0x${string}`;
+ const CNT_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_CNT_TOKEN_ADDRESS as `0x${string}`;
+ const CNT_SPENDER_ADDRESS = process.env.NEXT_PUBLIC_CNT_SPENDER_ADDRESS as `0x${string}`;

- const approveUsdc = () => {
+ const approveCnt = () => {
    writeContract({
-     address: USDC_TOKEN_ADDRESS,
+     address: CNT_TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
-     args: [USDC_SPENDER_ADDRESS, parseUnits('1000000', 6)]  // USDC: 6 decimals
+     args: [CNT_SPENDER_ADDRESS, parseUnits('1000000', 18)] // CNT: 18 decimals
    });
};
```

#### `.env.example` additions

```
NEXT_PUBLIC_CNT_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_CNT_SPENDER_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
```

---

## 3. Fiat On-Ramp Design

Tenants who do not hold CNT need a way to pay with fiat (USD, EUR, etc.).

### Option A — Third-party on-ramp widget (recommended for v1)

Integrate **Transak** or **Ramp Network** SDK directly in the tenant console:

```tsx
// apps/console/app/buy-cnt/page.tsx
import { Transak } from "@transak/transak-sdk";

const transak = new Transak({
  apiKey: process.env.NEXT_PUBLIC_TRANSAK_API_KEY,
  environment: "PRODUCTION",
  cryptoCurrencyCode: "CNT",
  walletAddress: userWalletAddress,
  networks: "ethereum",
  fiatCurrency: "USD",
});
transak.init();
```

The user pays USD via credit card → Transak sends CNT ERC-20 to their wallet → they use that CNT in the deploy wizard.

### Option B — In-app Stripe gateway (v1 alternative, more centralized)

```
User enters credit card in tenant console
    │
    │ Stripe PaymentIntent (USD)
    ▼
API service (backend)
    │ Calculates CNT amount: USD / cnt_usd_price
    │ CNT price from oracle or fixed governance rate
    ▼
API calls cntToken.mint(userWalletAddress, amount)
    │ (API holds owner private key — risk: centralized)
    ▼
User's wallet receives CNT ERC-20
```

**Security risk:** Option B requires the API to hold the CNT token minting key. This is centralized and should be replaced with a multi-sig or governance-controlled bridge in production.

### Option C — CEX listing (v2+)

User buys CNT on a centralized exchange (Binance, Coinbase), withdraws to their EVM wallet, connects to Comnetish console.

### Pricing oracle

For displaying USD-equivalent prices in the UI:

- Short-term: hardcode a CNT/USD rate governed by team
- Medium-term: Chainlink price feed or Pyth oracle
- Long-term: CNT listed on Uniswap/Osmosis, spot price from DEX

---

## 4. Cosmos Chain Billing (ucnt)

### Escrow locking

When a deployment is created:

```
MsgCreateDeployment {
  deposit: { denom: "ucnt", amount: "5000000" }  // 5 CNT deposit
}
```

- `x/escrow` locks this amount
- The deposit covers ~333,333 blocks at 15 ucnt/block (about 7.7 days of compute)

### Streaming per-block payment

Every block:

```
x/escrow.EndBlock():
  for each active lease:
    deduct = pricePerBlock × secondsSinceLastBlock / avgBlockTime
    escrow.balance -= deduct
    bank.send(escrow_module_account → provider_address, deduct)
```

Provider receives `ucnt` in real-time, every ~2 seconds.

### Replenishment

Tenant can top up at any time:

```
MsgDepositDeployment {
  id: { owner: "comnetish1abc...", dseq: 12345 },
  amount: { denom: "ucnt", amount: "10000000" }  // add 10 CNT
}
```

### Balance check for UI

Provider console shows `Estimated time remaining` = `escrow.balance / pricePerBlock × blockTime`.  
Tenant console shows a countdown and "Top Up" button when < 20% remaining.

---

## 5. EVM Layer Billing (CNT)

### When is EVM payment used?

EVM billing is for users who connect with MetaMask (EVM wallets) instead of Keplr (Cosmos wallets).  
It runs in parallel with or as an alternative to Cosmos chain billing.

### EVM payment lifecycle

```
1. Tenant: CNT.approve(paymentEscrow, amount)
2. Tenant: paymentEscrow.depositForLease(leaseId, provider, amount, maxDuration)
   → CNT locked in PaymentEscrow contract
   → LeaseCreated event emitted

3. [Service starts on provider]

4. Oracle: paymentEscrow.markLeaseStarted(leaseId)
   → sets startedAt timestamp
   → prevents cancellation

5. [Service runs for duration or tenant closes]

6. Oracle or timer: paymentEscrow.settleLease(leaseId)
   → CNT transferred from contract to provider
   → PaymentReleased event emitted

7. If tenant cancels: paymentEscrow.cancelLease(leaseId)
   → only within 5 minutes of creation AND before markLeaseStarted
   → full CNT refund to tenant
```

### EVM payment vs Cosmos payment: which to use?

| User type                     | Wallet                | Recommended payment rail  |
| ----------------------------- | --------------------- | ------------------------- |
| Crypto-native, Cosmos user    | Keplr / Leap          | Cosmos (ucnt)             |
| MetaMask / EVM user           | MetaMask / RainbowKit | EVM (CNT ERC-20)          |
| Enterprise / no crypto wallet | Stripe (fiat)         | Fiat on-ramp → CNT ERC-20 |

Both rails result in the same workload running on the provider. The escrow mechanism differs but the provider node behaviour is identical.

---

## 6. PaymentEscrow Contract — Changes Required

Full diff to apply in `contracts/src/PaymentEscrow.sol`:

```solidity
// BEFORE (USDC)
IERC20 public usdcToken;
constructor(address _usdcToken, address _oracleAddress) {
    usdcToken = IERC20(_usdcToken);
    oracleAddress = _oracleAddress;
    owner = msg.sender;
}

// AFTER (CNT)
IERC20 public cntToken;
constructor(address _cntToken, address _oracleAddress) {
    cntToken = IERC20(_cntToken);
    oracleAddress = _oracleAddress;
    owner = msg.sender;
}
```

All `usdcToken.transfer*()` calls must be replaced with `cntToken.transfer*()`.

After updating, redeploy:

```bash
cd contracts
npx hardhat run scripts/deploy.ts --network hardhat
# Update contracts/exports/addresses/hardhat.json with new addresses
```

Also update `contracts/exports/abi/PaymentEscrow.json` by regenerating:

```bash
npx hardhat compile
cp artifacts/contracts/PaymentEscrow.sol/PaymentEscrow.json exports/abi/
```

---

## 7. Full Payment Flow — Annotated Step by Step

### Scenario: MetaMask user deploys an nginx container for 24 hours

```
Tenant (MetaMask, EVM)
│
│ 1. Calculate cost:
│    pricePerCpu = 0.1 CNT/hour
│    requestedCpu = 1
│    duration = 24 hours
│    total = 0.1 × 1 × 24 = 2.4 CNT = 2.4 × 10^18 wei CNT
│
│ 2. Wallet: CNT.approve(paymentEscrow, 2.4 CNT)  [EVM tx, user signs]
│
│ 3. Chain: MsgCreateDeployment (SDL hash + 2.4 ucnt deposit)
│           [Cosmos tx, signed with Keplr OR same seed in chain-client]
│
│ 4. Wait for bids (~5-30 seconds)
│
│ 5. Select provider → Chain: MsgCreateLease(deploymentDseq, bidId)
│
│ 6. EVM: paymentEscrow.depositForLease(
│          leaseId = keccak256(deploymentId + providerId),
│          provider = "0xProviderEVMAddress",
│          amount = 2.4 CNT in wei,
│          maxDuration = 86400  // 24 hours in seconds
│        )
│   [CNT locked in escrow contract]
│
│ 7. Upload manifest to provider mTLS endpoint
│
│ 8. Containers start (30-120 sec)
│
│ 9. Oracle (backend service):
│    paymentEscrow.markLeaseStarted(leaseId)
│    [Prevents tenant from cancelling now that work has started]
│
│ 10. [24 hours pass, Cosmos escrow drains per-block simultaneously]
│
│ 11. Lease expires or tenant closes:
│     Oracle: paymentEscrow.settleLease(leaseId)
│     → Provider receives 2.4 CNT
│
Provider account: +2.4 CNT (EVM) + streamed ucnt (Cosmos)
```

---

## 8. Provider Earnings Tracking

### On-chain (Cosmos side)

Provider's `ucnt` balance increases every block while serving active leases.  
Query: `GET /cosmos/bank/v1beta1/balances/{address}` filtered by `ucnt`.

### On-chain (EVM side)

ProvriderEarnings readable from `PaymentEscrow` events:

```solidity
event PaymentReleased(uint256 indexed leaseId, address indexed provider, uint256 amount);
```

Index these events in the API service.

### Off-chain (API/DB)

Provider console dashboard (`/` page) currently shows:

- `totalEarnings`: `SUM(lease.pricePerBlock × lease.durationBlocks)` from Prisma leases
- `monthlyEarnings`: `totalEarnings × blocks_per_month / total_blocks`
- `activeLeases`: count of ACTIVE leases

These are DB-derived approximations. After the chain indexer is built, these will reflect real chain state.

### New `Transaction` model usage

The `Transaction` model in `schema.prisma` has:

```
id, type, from, to, amount, token, txHash (unique), createdAt
```

Write a transaction record for every:

- `LeaseCreated` event on EVM (type: `ESCROW_DEPOSIT`)
- `PaymentReleased` event on EVM (type: `PROVIDER_PAYMENT`)
- `LeaseCancelled` event on EVM (type: `ESCROW_REFUND`)
- `EventLeaseActive` from Cosmos (type: `LEASE_STARTED`)
- Per-block escrow drawdown credit (type: `STREAMING_PAYMENT`, batched hourly)

---

## 9. Billing Audit Trail (API + DB)

### Current gap

There is no `billing.ts` route in the API. The `Transaction` model exists but nothing writes to it.

### What to add

#### New route: `services/api/src/routes/billing.ts`

```typescript
// GET /api/billing — list transactions for current user (tenant or provider)
// GET /api/billing/summary — total spend/earned this month
// POST /api/billing/transactions — internal-only, called by indexer/oracle
```

### Transaction types to record

| type                 | Triggered by                       | from            | to              | token |
| -------------------- | ---------------------------------- | --------------- | --------------- | ----- |
| `ESCROW_DEPOSIT`     | `depositForLease` EVM event        | tenant          | escrow contract | CNT   |
| `PROVIDER_PAYMENT`   | `settleLease` EVM event            | escrow contract | provider        | CNT   |
| `ESCROW_REFUND`      | `cancelLease` EVM event            | escrow contract | tenant          | CNT   |
| `DEPLOYMENT_DEPOSIT` | `MsgCreateDeployment` Cosmos event | tenant          | escrow module   | ucnt  |
| `STREAMING_PAYMENT`  | Hourly batch from escrow drawdown  | escrow module   | provider        | ucnt  |
| `DEPLOYMENT_REFUND`  | `MsgCloseDeployment` Cosmos event  | escrow module   | tenant          | ucnt  |

---

## 10. Billing Route — What Needs to Be Built

Priority tasks:

### 1. Create `services/api/src/routes/billing.ts`

```typescript
import { Hono } from "hono";
import { requireCurrentSession } from "../lib/auth/session";
import { prisma } from "../lib/db";

const billing = new Hono();

// GET /api/billing — paginated transaction list for the authenticated user
billing.get("/", requireCurrentSession, async (c) => {
  const user = c.get("user");
  // fetch transactions where from or to = user's wallet address
  // ...
});

// GET /api/billing/summary — aggregated spend/earned
billing.get("/summary", requireCurrentSession, async (c) => {
  // sum by token, by month
  // ...
});

export { billing };
```

### 2. Register in `services/api/src/index.ts`

```typescript
import { billing } from "./routes/billing";
app.route("/api/billing", billing);
```

### 3. EVM event indexer

A background service that subscribes to EVM events:

```typescript
// services/api/src/lib/evm-indexer.ts
import { createPublicClient, webSocket } from "viem";
import { PaymentEscrowAbi } from "../../contracts/exports/abi/PaymentEscrow.json";

const client = createPublicClient({ transport: webSocket(EVM_WS_URL) });

client.watchContractEvent({
  address: PAYMENT_ESCROW_ADDRESS,
  abi: PaymentEscrowAbi,
  eventName: "PaymentReleased",
  onLogs: async (logs) => {
    for (const log of logs) {
      await prisma.transaction.create({
        data: {
          type: "PROVIDER_PAYMENT",
          from: PAYMENT_ESCROW_ADDRESS,
          to: log.args.provider,
          amount: log.args.amount.toString(),
          token: "CNT",
          txHash: log.transactionHash,
        },
      });
    }
  },
});
```

---

## 11. Pricing Model

### Provider-set pricing

Each provider sets their own `pricePerCpu` (stored in `Provider` model and on-chain `x/provider` attributes).  
Market competition drives prices down.

### Bid price = `pricePerCpu × requestedCpu` per hour

Display conversion:

```
pricePerBlock (ucnt) × blocks_per_hour (1800) = ucnt per hour
ucnt_per_hour / 1,000,000 = CNT per hour
CNT per hour × cnt_usd_price = USD per hour
```

### Lease price bounds

- Minimum bid: governance parameter in `x/market`
- Maximum bid: tenant can set a `maxPrice` in their SDL placement profile — bids above are ignored

### Storage and egress pricing (future)

Currently only CPU-based pricing. Future expansion:

- Memory: `pricePerGiB` per hour
- Storage: `pricePerGiB` per month (persistent) or per hour (ephemeral)
- Egress: `pricePerGiB` transferred out

---

## 12. Protocol Fee (Take Rate)

The `x/take` Cosmos module deducts a protocol fee from each lease payment:

```
Provider receives: pricePerBlock × (1 - takeRate)
Protocol treasury receives: pricePerBlock × takeRate
```

Default `takeRate`: configurable via governance (e.g. 2%).  
Treasury address: module account → distributed to validators/stakers via `x/distr`.

On the EVM side, a similar fee can be added to `PaymentEscrow.settleLease()`:

```solidity
uint256 fee = amount * TAKE_RATE_BPS / 10000;  // e.g. 200 = 2%
cntToken.transfer(treasury, fee);
cntToken.transfer(lease.provider, amount - fee);
```

---

## 13. Refunds

### Cosmos side

- `MsgCloseDeployment` before any lease: full refund of deposit
- `MsgCloseDeployment` with active lease: remaining escrow balance refunded after final per-block payment
- Auto-close (escrow empty): no refund (fully consumed)

### EVM side

- `cancelLease()`: full refund if within 5-minute window AND before `markLeaseStarted`
- After `markLeaseStarted`: no refund from `cancelLease` (must use `settleLease`)
- After `maxDuration`: anyone can call `settleLease`, provider gets full amount
- Future: prorated settlement (provider reports actual usage, receives proportional CNT)

### Handling partial work

If a provider fails to start the workload after receiving a manifest:

1. Tenant calls `MsgCloseLease` on Cosmos → gets remaining escrow back
2. Tenant calls `cancelLease()` on EVM (if within window) → gets CNT back
3. If window expired but provider never started: governance dispute or oracle veto of `markLeaseStarted`
