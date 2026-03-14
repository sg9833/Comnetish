# Issues by File - Quick Reference

**Purpose**: Find issues for a specific file quickly
**Format**: File path → Issues listed with line numbers

---

## API Routes Issues

### `services/api/src/routes/leases.ts`

- **Issue 1**: Missing POST endpoint to create leases
  - **Lines**: N/A (needs to be added)
  - **Severity**: 🔴 CRITICAL
  - **Description**: Cannot accept bids and create leases
  - **Fix**: Add POST / endpoint handler

- **Issue 2**: Lease logs stream mock data instead of real logs
  - **Lines**: 39-73 (GET /:id/logs)
  - **Severity**: 🔴 CRITICAL
  - **Description**: Returns 20 dummy ticks, not real container logs
  - **Fix**: Query actual Kubernetes/container logs

---

### `services/api/src/routes/bids.ts`

- **Issue 1**: Missing POST endpoint to submit bids
  - **Lines**: N/A (needs to be added)
  - **Severity**: 🔴 CRITICAL
  - **Description**: Providers cannot bid on deployments
  - **Fix**: Add POST / endpoint handler

- **Issue 2**: No filtering/sorting options for bids
  - **Lines**: 8-28 (GET / endpoint)
  - **Severity**: 🟡 MEDIUM
  - **Description**: Can list bids but cannot filter effectively
  - **Fix**: Add query parameters for filtering

---

### `services/api/src/routes/providers.ts`

- **Issue 1**: Incomplete stat endpoint implementation
  - **Lines**: 93-119 (GET /:id/stats)
  - **Severity**: 🟠 HIGH
  - **Description**: Provider stats endpoint partially implemented
  - **Fix**: Complete the implementation

- **Issue 2**: No PUT endpoint to update provider
  - **Lines**: N/A (needs to be added)
  - **Severity**: 🟡 MEDIUM
  - **Description**: Cannot update provider info or deactivate
  - **Fix**: Add PUT /:id endpoint

---

### `services/api/src/routes/ai.ts`

- **Issue 1**: Throws 503 error when API key not configured
  - **Lines**: 16
  - **Severity**: 🔴 CRITICAL
  - **Description**: No fallback, service completely down
  - **Fix**: Add graceful error handling

- **Issue 2**: Generic proxy error without status codes
  - **Lines**: 50
  - **Severity**: 🟠 HIGH
  - **Description**: Poor error messages
  - **Fix**: Improve error handling

---

## Services Issues

### `services/ai-agent/src/index.ts`

- **Issue 1**: Only health endpoint implemented
  - **Lines**: 1-24 (entire file)
  - **Severity**: 🔴 CRITICAL
  - **Description**: No actual AI functionality
  - **Fix**: Add inference endpoints, model loading, etc.

- **Issue 2**: No model loading or processing
  - **Lines**: N/A
  - **Severity**: 🔴 CRITICAL
  - **Description**: Service is placeholder only
  - **Fix**: Implement actual AI processing

---

## Console App Issues

### `apps/console/app/page.tsx`

- **Issue 1**: Empty scaffold page
  - **Lines**: 1-13 (entire file)
  - **Severity**: 🔴 CRITICAL
  - **Description**: No content, should show dashboard
  - **Fix**: Implement home page with stats and nav

---

### `apps/console/app/dashboard/page.tsx`

- **Issue 1**: Hardcoded wallet address
  - **Lines**: 128
  - **Severity**: 🟡 MEDIUM
  - **Code**: `const [walletAddress] = useState('comnetish1tenantdemoa99f0u29k3f');`
  - **Description**: Only shows data for demo wallet
  - **Fix**: Use wallet context instead

---

### `apps/console/app/deploy/page.tsx`

- **Issue 1**: Hardcoded tenant address
  - **Lines**: 417
  - **Severity**: 🟡 MEDIUM
  - **Code**: `tenantAddress: 'comnetish1demo-wallet-connected'`
  - **Description**: All deployments use demo address
  - **Fix**: Use user's actual wallet address

- **Issue 2**: Mock USDC approval (no actual transaction)
  - **Lines**: 741-744
  - **Severity**: 🟡 MEDIUM
  - **Code**: `setUsdcApproved(true);` without contract call
  - **Description**: Fake approval, real transactions won't work
  - **Fix**: Call actual USDC approve contract function

---

### `apps/console/app/deployments/[id]/page.tsx`

- **Issue 1**: Deployment detail page is minimal
  - **Lines**: 294 (closeMutation visible)
  - **Severity**: 🟠 HIGH
  - **Description**: Missing bid list, provider details, pricing breakdown
  - **Fix**: Expand page with more information and controls

---

## Provider Console Issues

### `apps/provider-console/app/page.tsx`

- **Issue 1**: Empty scaffold page
  - **Lines**: 1-11 (entire file)
  - **Severity**: 🔴 CRITICAL
  - **Description**: No provider dashboard implemented
  - **Missing**: Active leases, resources, earnings, pending bids
  - **Fix**: Implement full dashboard

---

### `apps/provider-console/app/onboard/page.tsx`

- **Issue 1**: Mock registration mode by default
  - **Lines**: 43, 320-321
  - **Severity**: 🟡 MEDIUM
  - **Code**: `const REGISTRATION_MODE = process.env.NEXT_PUBLIC_PROVIDER_REGISTRATION_MODE ?? 'mock';`
  - **Description**: Uses mock instead of blockchain by default
  - **Fix**: Change default to 'blockchain' or add feature flag

- **Issue 2**: System checks don't automate installation
  - **Lines**: 74-130 (baseChecksForOs function)
  - **Severity**: 🟡 MEDIUM
  - **Description**: Just displays commands, doesn't install
  - **Fix**: Automate installation or verify pre-installed tools

---

### `apps/provider-console/app/globals.css`

- **Issue 1**: Missing critical CSS classes
  - **Lines**: 1-12 (entire file - too short)
  - **Severity**: 🔴 CRITICAL
  - **Missing Classes**:
    - `.cn-skeleton-shimmer` (for loading states)
    - `.cn-noise-overlay` (for backgrounds)
    - `.cn-panel` and `.cn-panel-glass` (component styles)
    - Font variables
  - **Fix**: Copy from `apps/console/app/globals.css` lines 91-118

---

### `apps/provider-console/app/layout.tsx`

- **Issue 1**: Missing design token setup
  - **Severity**: 🟠 HIGH
  - **Description**: Uses generic styles, not design tokens
  - **Fix**: Add Tailwind variables and theming

---

## Database Issues

### `services/api/prisma/schema.prisma`

- **Issue 1**: Transaction model defined but unused
  - **Lines**: 92-100
  - **Severity**: 🟡 MEDIUM
  - **Description**: Model exists but no endpoints use it
  - **Fix**: Implement transaction endpoints and handlers

---

### `services/api/prisma/seed.ts`

- **Issue 1**: Incomplete seed data
  - **Lines**: 53-73
  - **Severity**: 🟡 MEDIUM
  - **Description**: Only seeds providers, missing deployments, bids, leases
  - **Fix**: Add comprehensive seed data for all entities

---

## Type System Issues

### `packages/chain-client/src/index.ts`

- **Issue 1**: Type mismatch with API
  - **Lines**: 47-51 (CreateLeaseMsg)
  - **Severity**: 🟡 MEDIUM
  - **Description**: Type requires bidId but API doesn't support it
  - **Fix**: Update type to match actual API implementation

---

## Quick Fix Priority by File

### Must Fix First 🔴

1. `services/api/src/routes/leases.ts` - Add POST endpoint
2. `services/api/src/routes/bids.ts` - Add POST endpoint
3. `apps/provider-console/app/page.tsx` - Implement dashboard
4. `apps/provider-console/app/globals.css` - Add CSS classes
5. `apps/console/app/page.tsx` - Implement home page

### High Priority 🟠

6. `services/ai-agent/src/index.ts` - Implement AI service
7. `apps/console/app/deployments/[id]/page.tsx` - Expand detail page
8. `apps/console/app/deploy/page.tsx` - Remove hardcoded data
9. `apps/console/app/dashboard/page.tsx` - Remove hardcoded wallet
10. `apps/provider-console/app/onboard/page.tsx` - Fix registration mode

### Medium Priority 🟡

11. `services/api/prisma/seed.ts` - Add comprehensive seeds
12. `services/api/src/routes/providers.ts` - Complete implementation
13. `packages/chain-client/src/index.ts` - Fix type mismatches
14. `apps/provider-console/app/layout.tsx` - Add design tokens

---

## Files by Issue Category

### Empty/Scaffold Files (Implement full pages)

- `apps/console/app/page.tsx`
- `apps/provider-console/app/page.tsx`

### Missing Endpoints (Add POST/PUT/DELETE)

- `services/api/src/routes/leases.ts`
- `services/api/src/routes/bids.ts`
- `services/api/src/routes/providers.ts`
- `services/ai-agent/src/index.ts`

### Hardcoded/Mock Data (Remove and use real data)

- `apps/console/app/deploy/page.tsx` (hardcoded address, mock approval)
- `apps/console/app/dashboard/page.tsx` (hardcoded wallet)
- `apps/provider-console/app/onboard/page.tsx` (mock registration)

### Incomplete Implementations

- `services/api/src/routes/leases.ts` (logs are mock)
- `services/api/src/routes/ai.ts` (error handling)
- `apps/console/app/deployments/[id]/page.tsx` (minimal display)
- `apps/provider-console/app/onboard/page.tsx` (unchecked system setup)

### Missing Styling

- `apps/provider-console/app/globals.css`
- `apps/provider-console/app/layout.tsx`

### Database Issues

- `services/api/prisma/schema.prisma` (unused models)
- `services/api/prisma/seed.ts` (incomplete data)

### Type System Issues

- `packages/chain-client/src/index.ts`

---

**Total Files with Issues**: 15+
**Total Issues Identified**: 30+
**Critical Priority**: 5 files
**High Priority**: 5 files
**Medium Priority**: 5+ files

---

**Note**: This file can be kept open as a checklist while working through fixes.
