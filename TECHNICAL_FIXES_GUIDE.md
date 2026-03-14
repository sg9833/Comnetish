# Technical Fixes Reference Guide

**For**: Comnetish Development Team
**Purpose**: Specific steps and code locations for fixing identified issues

---

## 1. MISSING ENDPOINTS - Implementation Guide

### 1.1 POST /api/leases - Create Lease from Bid

**Location**: `services/api/src/routes/leases.ts`

**Current State**:

```typescript
// Lines 1-73: Only GET endpoints exist
import { Router } from 'hono';

export const leasesRouter = Router();

// GET /api/leases - list all
leasesRouter.get('/', ...);

// GET /api/leases/:id/logs - stream logs
leasesRouter.get('/:id/logs', ...);
```

**What needs to be added**:

```typescript
// POST /api/leases - Create new lease from bid
leasesRouter.post("/", async (c) => {
  const body = await c.req.json();
  const { bidId, deploymentId } = body;

  // 1. Verify bid exists and is valid
  // 2. Create lease in database
  // 3. Update deployment status to ACTIVE
  // 4. Update bid status to ACCEPTED
  // 5. Return created lease
});

// PUT /api/leases/:id/status - Update lease status
leasesRouter.put("/:id/status", async (c) => {
  // Handle ACTIVE → CLOSED transitions
  // Process payments
});
```

**Database Operations Needed**:

- Use Prisma client to create lease record
- Update deployment.status to 'ACTIVE'
- Update bid.status to 'ACCEPTED'

---

### 1.2 POST /api/bids - Submit Provider Bid

**Location**: `services/api/src/routes/bids.ts`

**Current State**: Lines 8-28 - Only GET endpoint

**What needs to be added**:

```typescript
// POST /api/bids - Create new bid
bidsRouter.post("/", async (c) => {
  const body = await c.req.json();
  const { deploymentId, providerId, pricePerHour } = body;

  // 1. Validate deployment exists and is OPEN
  // 2. Validate provider is registered
  // 3. Create bid record with status PENDING
  // 4. Add bidder to deployment
  // 5. Return created bid
});

// PUT /api/bids/:id - Update bid (withdraw, etc.)
bidsRouter.put("/:id", async (c) => {
  // Handle bid status changes
});
```

---

### 1.3 Bid Acceptance Flow

**Trigger Point**: Tenant accepts a bid
**File**: `apps/console/app/deployments/[id]/page.tsx`

**Current Code Needed**:

```typescript
// Use this mutation to accept bid
const acceptBidMutation = useMutation({
  mutationFn: async (bidId: string) => {
    const response = await fetch(`/api/leases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bidId }),
    });
    return response.json();
  },
});
```

---

## 2. EMPTY PAGES - Implementation Guide

### 2.1 Provider Console Home Page

**File**: `apps/provider-console/app/page.tsx`

**Current State**: 11 lines, just a scaffold

**Should include**:

```typescript
'use client';
import { useQuery } from '@tanstack/react-query';

export default function ProviderHome() {
  // Query data from /api/providers/{id}/stats
  const { data: stats } = useQuery({
    queryKey: ['provider-stats'],
    queryFn: async () => {
      const res = await fetch('/api/providers/me/stats');
      return res.json();
    }
  });

  return (
    <div className="space-y-8">
      {/* Active Leases */}
      <section>
        <h2>Active Leases</h2>
        {/* Display list of active leases with resource usage */}
      </section>

      {/* Available Resources */}
      <section>
        <h2>Available Resources</h2>
        {/* Display CPU, GPU, RAM, Storage */}
      </section>

      {/* Pricing & Earnings */}
      <section>
        <h2>Earnings This Month</h2>
        {/* Display earnings breakdown */}
      </section>

      {/* Pending Bids */}
      <section>
        <h2>Pending Bids</h2>
        {/* Display incoming bids to respond to */}
      </section>
    </div>
  );
}
```

**Required API endpoints**:

- `GET /api/providers/me/stats` - Provider statistics
- `GET /api/providers/me/leases` - Active leases
- `GET /api/providers/me/bids` - Pending bids

---

### 2.2 Main Console Home Page

**File**: `apps/console/app/page.tsx`

**Should show**:

- Active deployments count
- Total spending this month
- Quick access to main features
- Recent activity feed

---

## 3. STYLING ISSUES - Implementation Guide

### 3.1 Provider Console Missing CSS Classes

**File**: `apps/provider-console/app/globals.css`

**Current Gap**: Compare with `apps/console/app/globals.css`

**Add these classes**:

```css
/* Skeleton Loading Animation */
.cn-skeleton-shimmer {
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.5;
  }
}

/* Noise Overlay Pattern */
.cn-noise-overlay {
  background-image: url("data:image/svg+xml,...");
  opacity: 0.05;
}

/* Panel Components */
.cn-panel {
  @apply rounded-lg border border-gray-200 bg-white p-4;
}

.cn-panel-glass {
  @apply backdrop-blur-md bg-white/80 border border-white/20;
}

/* Color and theming variables */
:root {
  --cn-primary: #3b82f6;
  --cn-secondary: #8b5cf6;
  /* ... other variables */
}
```

**Source to copy from**: Lines 91-118 of `apps/console/app/globals.css`

---

## 4. HARDCODED DATA - Fix Steps

### 4.1 Remove Hardcoded Wallet Address

**File**: `apps/console/app/dashboard/page.tsx`
**Line**: 128

**Current**:

```typescript
const [walletAddress] = useState("comnetish1tenantdemoa99f0u29k3f");
```

**Replace with**:

```typescript
import { useWallet } from '@your-wallet-library';

// In component:
const { address: walletAddress } = useWallet();

if (!walletAddress) {
  return <div>Please connect your wallet</div>;
}
```

---

### 4.2 Remove Hardcoded Tenant Address

**File**: `apps/console/app/deploy/page.tsx`
**Line**: 417

**Current**:

```typescript
tenantAddress: "comnetish1demo-wallet-connected";
```

**Replace with**:

```typescript
import { useWallet } from "@your-wallet-library";

const { address: tenantAddress } = useWallet();

// In deployment submission:
const deploymentData = {
  ...formData,
  tenantAddress,
};
```

---

### 4.3 Mock USDC Approval to Real Transaction

**File**: `apps/console/app/deploy/page.tsx`
**Lines**: 741-744

**Current**:

```typescript
setUsdcApproved(true); // Just sets a flag
```

**Replace with**:

```typescript
import { useContractWrite } from "@your-contract-library";

const { write: approveUsdc } = useContractWrite({
  address: USDC_CONTRACT_ADDRESS,
  functionName: "approve",
  args: [MARKETPLACE_ADDRESS, amount],
});

// In approval handler:
await approveUsdc();
setUsdcApproved(true);
```

---

### 4.4 Provider Registration Mode

**File**: `apps/provider-console/app/onboard/page.tsx`
**Line**: 43

**Current**:

```typescript
const REGISTRATION_MODE =
  process.env.NEXT_PUBLIC_PROVIDER_REGISTRATION_MODE ?? "mock";
```

**Fix**:

- Add environment variable to `.env.example` and `.env.local`
- Change default from 'mock' to 'blockchain'
- Or check for feature flag/toggle

**Updated**:

```typescript
const REGISTRATION_MODE =
  process.env.NEXT_PUBLIC_PROVIDER_REGISTRATION_MODE ?? "blockchain";
```

---

## 5. AI Service - Implementation Guide

**File**: `services/ai-agent/src/index.ts`

**Current State**: Only /health endpoint

**Schema needed** (Add endpoints like):

```typescript
// POST /api/ai/inference
app.post("/inference", async (c) => {
  const { prompt, model } = await c.req.json();

  // Call actual AI model
  const result = await aiModel.generate(prompt);
  return c.json({ result });
});

// GET /api/ai/models
app.get("/models", async (c) => {
  // Return list of available models
});

// POST /api/ai/batch
app.post("/batch", async (c) => {
  // Process batch inference requests
});
```

**Integration points**:

- Load model on startup
- Handle streaming responses
- Implement caching
- Add rate limiting
- Error handling with fallbacks

---

## 6. Lease Logs Mock Data - Fix

**File**: `services/api/src/routes/leases.ts`
**Lines**: 39-73

**Current**: Streams 20 dummy ticks

**Should query real logs from**:

- Kubernetes pods
- Docker containers
- Or logging service (Loki, ELK stack)

**Pseudocode**:

```typescript
leasesRouter.get("/:id/logs", async (c) => {
  const leaseId = c.req.param("id");

  // 1. Get lease details (includes pod/container ID)
  const lease = await db.lease.findUnique({ where: { id: leaseId } });

  // 2. Query actual logs from cluster
  const logs = await kubernetesClient.getLogs(lease.podId);

  // 3. Stream back to client
  return c.streamText(async (write) => {
    for await (const logLine of logs) {
      await write(logLine + "\n");
    }
  });
});
```

---

## 7. Database Seeds - Fix

**File**: `services/api/prisma/seed.ts`

**Current**: Only creates providers (lines 53-73)

**Should also create**:

```typescript
// Create sample deployments
const deployment = await prisma.deployment.create({
  data: {
    id: "dep-1",
    tenantId: tenant.id,
    name: "Sample App",
    status: "OPEN",
    cpuRequired: 2,
    memoryRequired: 4096,
    pricePerHour: 1.5,
    // ...
  },
});

// Create sample bids
const bid = await prisma.bid.create({
  data: {
    deploymentId: deployment.id,
    providerId: provider.id,
    pricePerHour: 1.2,
    status: "PENDING",
  },
});

// Create sample lease
const lease = await prisma.lease.create({
  data: {
    deploymentId: deployment.id,
    providerId: provider.id,
    bidId: bid.id,
    status: "ACTIVE",
    monthlyRate: 864,
  },
});
```

---

## 8. Type System - Fix Mismatches

**File**: `packages/chain-client/src/index.ts`
**Lines**: 47-51

**Current**:

```typescript
interface CreateLeaseMsg {
  bidId: string;
  // Requires bidId
}
```

**Should align with API**:

- If API doesn't support `bidId`, remove it from type
- Or add API endpoint to support it
- Ensure types match actual implementation

---

## Quick Fix Checklist

- [ ] Add POST /api/leases endpoint
- [ ] Add POST /api/bids endpoint
- [ ] Add bid acceptance flow
- [ ] Implement provider console home page
- [ ] Add missing CSS classes to provider-console
- [ ] Remove hardcoded wallet addresses
- [ ] Implement real USDC approval
- [ ] Complete AI service endpoints
- [ ] Add real lease log streaming
- [ ] Update database seeds
- [ ] Fix type mismatches
- [ ] Complete deployment detail page
- [ ] Finish provider onboarding

---

**Status**: This guide should be updated as fixes are implemented.
