# Marketplace Architecture Decision

## Status

**DECIDED**: Cosmos-first, EVM-agnostic for marketplace logic.

## Decision

The Comnetish marketplace is implemented exclusively on the Cosmos chain via the `x/market` module. The EVM Marketplace.sol contract remains a placeholder.

## Rationale

### 1. Separation of Concerns

- **Cosmos layer:** Coordination, order matching, bid/lease lifecycle
- **EVM layer:** Payment settlement, escrow, token operations
- **API layer:** Caching, UX acceleration, indexing

This separation makes each layer's responsibilities clear and reduces coupling.

### 2. Cosmos Strengths for Coordination

The `x/market` module provides:

- Atomic state transitions (bid → lease → active)
- Event-driven architecture via tendermint events
- Provider attestation (x/audit module integration)
- Certificate validation (x/cert module)
- Streaming payment with escrow (x/escrow integration)

These features would be expensive and complex to replicate on EVM, where:

- Each transaction is isolated
- No native event-driven request/response loops
- Complex state machines require many transactions

### 3. Provider Node Architecture

Provider nodes already watch Cosmos chain for:

- Order events (`x/market::Order`)
- Bid opportunities
- Lease state changes

Requiring providers to watch dual chains (Cosmos + EVM) increases operational complexity and failure scenarios.

### 4. Proven Pattern

This architecture mirrors Akash Network (original reference implementation), where:

- Marketplace is Cosmos-native
- EVM is reserved for future extensions or sidechains
- Everything coordinates through Cosmos consensus

## Implementation

### Current State

- ✅ `x/market` module fully implements: order creation, bid matching, lease lifecycle
- ✅ `PaymentEscrow.sol` handles EVM-side escrow and CNT transfers
- ✅ Tenant console calls `POST /api/deployments/broadcast/create` → broadcasts `MsgCreateDeployment` to Cosmos chain
- ✅ Indexer service (`services/indexer`) syncs Cosmos events → off-chain API DB

### What EVM Handles

1. **Token operations:** CNT transfers, approvals
2. **Escrow logic:** Time-locked funds, settlement
3. **Sidecar payments:** Supplementary or alternate payment rails (future)

### What Cosmos Handles

1. **Marketplace:**
   - `MsgCreateDeployment` → creates order
   - `MsgCreateBid` → providers respond with pricing
   - `MsgCreateLease` → tenant selects provider
   - `MsgCloseLease` / `MsgCloseDeployment` → lifecycle termination
2. **Authorization:**
   - `x/authz` for delegated authority (e.g., relayer on behalf of tenant)
3. **Attributes & Attestation:**
   - `x/provider` for provider registration
   - `x/audit` for auditor-signed attributes
4. **Certificates:**
   - `x/cert` for mTLS certificate chain

## Alternative Architectures (Considered & Rejected)

### Option A: EVM-First Marketplace

Make Marketplace.sol the source of truth for orders, bids, leases.

**Rejected because:**

- EVM doesn't support RPC-style request/response (orders → bids → lease)
- Expensive state management for high-frequency bid updates
- Requires relayer for provider listening (additional infrastructure)
- Adds vendor lock-in to EVM chain

### Option B: Hybrid Bridging

EVM marketplace emits events; relayer bridges to Cosmos orders.

**Rejected because:**

- Adds relayer infrastructure dependency
- Introduces consistency windows (eventual consistency risk)
- More operational complexity for marginal benefit
- Unclear who operates relayer (trust assumption)

### Option C: Cosmos Only, No EVM Marketplace

Use Cosmos exclusively, remove EVM Marketplace.sol entirely.

**Not chosen because:**

- Marketplace.sol serves as architectural documentation
- Reserves namespace for future EVM features
- Maintains parity with Akash reference design

## Future Expansion Paths

### A. Support EVM-Native Tenants

If MetaMask/EVM-native users need deployment capability:

1. Implement `Marketplace.createDeployment()` in Solidity

   ```solidity
   function createDeployment(
       string memory sdlHash,
       uint256 estimatedMonthlyUSD
   ) public payable returns (uint256 deploymentId)
   ```

2. Deploy event relayer service:

   ```go
   // Watches EVM Marketplace.DeploymentCreated events
   // Submits MsgCreateDeployment to Cosmos chain
   ```

3. Tenant experience:
   - User connects MetaMask
   - Calls `createDeployment()` on EVM
   - Relayer broadcasts to Cosmos (1-2s relay time)
   - Providers see Cosmos order event

### B. Marketplace Sidechain

Deploy Comnetish marketplace to a sidechain (e.g., Cosmos appchain with fasterfinality).

Provides:

- Sub-second bid matching
- Reduced gas costs
- IBC to main Cosmos chain for finality

### C. Off-Chain Marketplace (Future Optimization)

Move marketplace logic to a decentralized off-chain service (similar to Intent-inspired architectures).

Providers submit bids to an off-chain service; bids are batched and propagated to Cosmos.

## Team Responsibility & Review

- **Architecture Decision Owner:** @sg9833 (Comnetish Lead)
- **Implementation Owners:**
  - Cosmos x/market module: chain team
  - API broadcast layer: services/api team
  - Indexer/sync: services/indexer team
- **Review Date:** Q2 2026 (if expansion to EVM-native tenants is prioritized)

## References

- [x/market module](../chain/x/market/)
- [PaymentEscrow.sol](../contracts/src/PaymentEscrow.sol)
- [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md)
- [Deployment Lifecycle](./DEPLOYMENT_LIFECYCLE.md)
