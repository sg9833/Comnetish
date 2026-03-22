// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title Comnetish Marketplace (Placeholder)
 * @notice This contract is intentionally a no-op placeholder.
 *
 * DESIGN DECISION: Marketplace logic is implemented exclusively in the Cosmos chain
 * via the x/market module. The EVM Marketplace.sol exists as a stub to:
 *
 * 1. Maintain parity with the traditional Akash architecture model
 * 2. Reserve the namespace for future EVM-native marketplace features
 * 3. Document the architecture decision: Cosmos-first for coordination
 *
 * RATIONALE:
 * - The Cosmos x/market module handles bid/lease lifecycle and order matching
 * - Tenants and providers interact primarily via Cosmos chain RPC
 * - EVM is reserved for payment escrow (PaymentEscrow.sol) and token operations
 * - Separating concerns: coordination (Cosmos) vs. settlement (EVM)
 *
 * FUTURE ALTERNATIVES:
 * If EVM-native tenants are needed, implement:
 * - `createBid(deploymentId, price)` → emits event for relayer
 * - Bridge relayer picks up events and creates Cosmos x/market::Bid
 * - Maintains eventual consistency with Cosmos chain
 *
 * See: docs/ARCHITECTURE_OVERVIEW.md § Layer 2 — EVM Smart Contracts
 */
contract Marketplace {
  string public constant NAME = "Comnetish Marketplace";
  string public constant VERSION = "1.0.0";
  string public constant STATUS = "COSMOS_ONLY";

  /**
   * @notice Placeholder: Marketplace operations happen on Cosmos chain via x/market module.
   * See ARCHITECTURE_OVERVIEW.md for full design rationale.
   */
  function marketplaceStatus() public pure returns (string memory) {
    return "Marketplace logic is Cosmos-native. Use Cosmos chain RPC for bid/lease operations.";
  }
}
