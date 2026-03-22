# Protobuf Encoding Migration Guide

## Status

**Current State:** Messages are JSON-encoded in `packages/chain-client/src/index.ts`  
**Target State:** Protobuf-encoded messages (`.proto` definitions)

## Overview

This guide explains how to migrate from JSON-encoded messages to proper Protocol Buffer encoding once the Comnetish proto files are available.

## Why Protobuf?

1. **Smaller payload** - Binary encoding is 3-10x smaller than JSON
2. **Faster parsing** - Protobuf is optimized for serialization/deserialization
3. **Type safety** - Generated TypeScript types ensure message correctness
4. **Standard compatibility** - Works with Cosmos SDK's protobuf conventions
5. **Chain compatibility** - Gossip peers and archive nodes expect binary encoding

## Current Implementation

```typescript
// Current (JSON encoding)
const msg: CreateDeploymentMsg = { sdl, tenantAddress };
return client.signAndBroadcast(
  tenantAddress,
  [
    {
      typeUrl: "/comnetish.deployment.v1.MsgCreateDeployment",
      value: textEncoder.encode(JSON.stringify({ ...msg, deploymentId })),
    },
  ],
  "auto",
);
```

**Issue:** The `value` field should contain protobuf-encoded bytes, not JSON.stringify() bytes.

## Target Implementation

```typescript
// Target (Protobuf encoding)
import { MsgCreateDeployment } from "@comnetish/proto-ts";

const msg = MsgCreateDeployment.create({ sdl, tenantAddress, deploymentId });
return client.signAndBroadcast(
  tenantAddress,
  [
    {
      typeUrl: "/comnetish.deployment.v1.MsgCreateDeployment",
      value: MsgCreateDeployment.encode(msg).finish(),
    },
  ],
  "auto",
);
```

## Migration Steps

### Step 1: Obtain Proto Files

Proto definitions should be in `chain/proto/` directory. Expected structure:

```
chain/proto/
  ├── comnetish/deployment/v1/
  │   ├── deployment.proto
  │   ├── msg.proto
  │   └── event.proto
  ├── comnetish/market/v1/
  │   ├── market.proto
  │   ├── msg.proto
  │   └── event.proto
  ├── comnetish/provider/v1/
  │   ├── provider.proto
  │   ├── msg.proto
  │   └── event.proto
  └── ...
```

### Step 2: Install Protobuf Tools

```bash
# Option A: Via Homebrew (macOS)
brew install protobuf

# Option B: Via apt (Linux)
sudo apt-get install protobuf-compiler

# Option C: Via conda
conda install -c conda-forge protobuf
```

Verify installation:

```bash
protoc --version
```

### Step 3: Generate TypeScript Types

Run the generation script in chain-client:

```bash
cd packages/chain-client
pnpm proto:generate
```

This script (to be implemented):

1. References proto files from `../../chain/proto/`
2. Uses `ts-proto` plugin to generate TS types
3. Outputs to `packages/chain-client/src/proto/` or similar
4. Generates types like `MsgCreateDeployment`, `MsgCreateLease`, etc.

**Manual Command (if script not available):**

```bash
protoc \
  --plugin=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=./src/proto \
  --ts_proto_opt=snakeToCamel=false \
  --proto_path=../../chain/proto \
  ../../chain/proto/comnetish/**/*.proto
```

### Step 4: Update chain-client Message Creation

Replace all `JSON.stringify()` calls with protobuf message creation:

#### Before (deployment.ts current approach):

```typescript
const msg: CreateDeploymentMsg = { sdl, tenantAddress };
return client.signAndBroadcast(
  tenantAddress,
  [
    {
      typeUrl: "/comnetish.deployment.v1.MsgCreateDeployment",
      value: textEncoder.encode(JSON.stringify({ ...msg, deploymentId })),
    },
  ],
  "auto",
);
```

#### After (with protobuf):

```typescript
import { MsgCreateDeployment } from "./proto/comnetish/deployment/v1/msg.js";

const msg = MsgCreateDeployment.create({
  sdl,
  tenantAddress,
  deploymentId,
});

return client.signAndBroadcast(
  tenantAddress,
  [
    {
      typeUrl: "/comnetish.deployment.v1.MsgCreateDeployment",
      value: MsgCreateDeployment.encode(msg).finish(),
    },
  ],
  "auto",
);
```

### Step 5: Update All Messages

Apply the same pattern to:

- `createDeployment()` — `MsgCreateDeployment`
- `createBid()` — `MsgCreateBid`
- `createLease()` — `MsgCreateLease`
- `registerProvider()` — `MsgCreateProvider`
- `createProviderCertificate()` — `MsgCreateCertificate`

### Step 6: Validation

```bash
# Typecheck
pnpm --filter @comnetish/chain-client typecheck

# Build
pnpm --filter @comnetish/chain-client build

# Test with mock=true mode first
NODE_ENV=test pnpm test
```

### Step 7: End-to-End Testing

1. **Local chain validation:** Start Comnetish chain locally, send real tx via chain-client
2. **Signature verification:** Ensure Cosmos validators accept the binary-encoded messages
3. **Round-trip:** Encode → decode → verify message contents match

## Deprecation of Mock Mode

Once protobuf is fully integrated:

- Keep `mock: true` mode for UI development
- But make mock messages encode/decode via protobuf (don't JSON stringify)
- Ensures developers always test against real message format

```typescript
async createDeployment(sdl: string, tenantKey: string): Promise<{ ... }> {
  if (this.config.mock) {
    const msg = MsgCreateDeployment.create({ sdl, tenantAddress: '', deploymentId: '' });
    const encoded = MsgCreateDeployment.encode(msg).finish();
    // Return fake tx hash but with real encoding
    return { ... };
  }
  // Real signing and broadcast
}
```

## Timeline

- **Phase 1:** Protobuf tooling setup (current) ✓
- **Phase 2:** Obtain proto files from chain team
- **Phase 3:** Generate TS types (1-2 hours)
- **Phase 4:** Update chain-client messages (2-4 hours)
- **Phase 5:** Integration testing (2-4 hours)
- **Phase 6:** Deploy to production

## References

- [ts-proto Documentation](https://github.com/stephenh/ts-proto)
- [Cosmos SDK Protobuf Guide](https://docs.cosmos.network/main/build/spec)
- [Protocol Buffers Language Guide](https://developers.google.com/protocol-buffers/docs/proto3)
- [CosmJS signAndBroadcast API](https://cosmos.github.io/cosmjs/latest/stargate/functions/signAndBroadcast)

## Common Issues & Troubleshooting

### Issue: `Cannot find module '@comnetish/proto-ts'`

**Solution:** Run proto generation first: `pnpm proto:generate`

### Issue: `protoc: command not found`

**Solution:** Install protobuf compiler:

```bash
brew install protobuf  # macOS
sudo apt-get install protobuf-compiler  # Ubuntu
```

### Issue: Generated types don't match message structure

**Solution:** Verify proto file definitions match the intended message fields.

### Issue: `MsgCreateDeployment.encode is not a function`

**Solution:** Ensure ts-proto was used for code generation (not protoc-gen-go or protoc-gen-python).

## Contact

- Proto setup questions: @sg9833 (Comnetish Lead)
- ts-proto issues: See upstream docs or open issue on ts-proto repo
