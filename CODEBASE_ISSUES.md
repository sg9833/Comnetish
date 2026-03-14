# Comnetish Codebase - Comprehensive Issues Documentation

**Generated**: 2026-03-14
**Status**: Work in Progress - Multiple Critical Issues Found

---

## Executive Summary

The Comnetish codebase is a marketplace application for cloud resource leasing. The scan identified **15 major issue categories** with **multiple critical gaps** that prevent full end-to-end functionality. Key blockers include missing API endpoints, empty pages, incomplete implementations, and missing styling.

**Current State**: ~40% complete with many broken/incomplete features

---

## 1. CRITICAL: Missing API Endpoints

These endpoints are essential for the marketplace workflow to function.

### 1.1 Missing Lease Creation Endpoint

- **File**: `services/api/src/routes/leases.ts`
- **Issue**: Only GET endpoints exist (list and stream logs)
- **Missing**: `POST /api/leases` to create new leases
- **Impact**: Tenants cannot accept provider bids; entire lease workflow is broken
- **What's needed**:
  - Accept `bidId` parameter
  - Create lease record in database
  - Transition deployment from OPEN to ACTIVE
- **Lines affected**: Entire file only has GET routes (lines 9-73)

### 1.2 Missing Bid Creation Endpoint

- **File**: `services/api/src/routes/bids.ts`
- **Issue**: Only GET endpoint exists
- **Missing**: `POST /api/bids` to submit provider bids
- **Impact**: Providers cannot bid on deployments; marketplace cannot function
- **What's needed**:
  - Accept deployment ID and provider info
  - Create bid record
  - Add bid to deployment
- **Lines affected**: Entire file only has GET route (lines 8-28)

### 1.3 Missing Bid Acceptance Endpoint

- **Issue**: No way to accept a bid and create a lease
- **Missing**: `POST /api/bids/:id/accept` or similar
- **Impact**: Tenants can see bids but cannot act on them

### 1.4 Missing Deployment Status Transition Endpoints

- **Missing**:
  - `PUT /api/deployments/:id/status` to update deployment state
  - Endpoints to transition from OPEN → ACTIVE → CLOSED
- **Impact**: Deployments stuck in OPEN state indefinitely

### 1.5 Incomplete Provider Endpoint

- **File**: `services/api/src/routes/providers.ts`
- **Line**: 93-119
- **Issue**: `GET /:id/stats` endpoint implementation appears incomplete
- **Missing**: PUT/PATCH to update provider status, DELETE to deactivate

---

## 2. CRITICAL: Empty/Scaffold Pages

These pages lack actual functionality and just show placeholder content.

### 2.1 Provider Console Home Page

- **File**: `apps/provider-console/app/page.tsx`
- **Lines**: 1-11 (entire file)
- **Content**: Only shows "Status" card with "Provider console scaffold is ready" message
- **What's needed**:
  - Provider dashboard showing active leases
  - Available resources/inventory
  - Pricing management interface
  - Earnings/revenue tracking
  - Active bids and proposals

### 2.2 Main Console Home Page

- **File**: `apps/console/app/page.tsx`
- **Lines**: 1-13 (entire file)
- **Content**: Just a basic scaffold
- **What's needed**:
  - Deployment overview
  - Quick stats (active deployments, spending, etc.)
  - Navigation to main features
  - Redirect or dashboard preview

---

## 3. HIGH: Missing CSS/Styling

These CSS classes are referenced in components but not defined, causing styling issues.

### 3.1 Provider Console Missing Styles

- **File**: `apps/provider-console/app/globals.css`
- **Problem**: Severely incomplete compared to main console
- **Missing CSS classes**:
  - `.cn-skeleton-shimmer` - used in dashboard loading states
  - `.cn-noise-overlay` - used in backgrounds
  - `.cn-panel` and `.cn-panel-glass` - key component styles
  - Font variable setup and theming
- **Current content**: Only basic HTML/body styling (lines 1-12)
- **Contrast**: Main console has full styling at `apps/console/app/globals.css` (lines 91-118)

### 3.2 Missing Tailwind/Design Tokens

- **File**: `apps/provider-console/app/layout.tsx`
- **Issue**: Uses generic styles, missing design token configuration
- **Impact**: Inconsistent styling across provider console

---

## 4. HIGH: Incomplete/Non-Functional Implementations

### 4.1 AI Service Non-Functional

- **File**: `services/ai-agent/src/index.ts`
- **Lines**: 1-24 (entire file)
- **Current**: Only implements `/health` endpoint returning generic message
- **Missing**:
  - No actual AI inference endpoints
  - No model loading or processing
  - No request handling beyond status checks
- **Impact**: Cannot process AI requests; service is placeholder only

### 4.2 Lease Logs Using Mock Data

- **File**: `services/api/src/routes/leases.ts`
- **Lines**: 39-73 (GET /:id/logs endpoint)
- **Issue**: Returns fake streaming data with 20 dummy ticks
- **Impact**: Lease logs are completely fabricated; users see fake container logs
- **What's needed**: Real pod/container log streaming integration

### 4.3 AI API Route Missing Error Handling

- **File**: `services/api/src/routes/ai.ts`
- **Lines**: 16, 50
- **Issues**:
  - Line 16: Throws 503 error if API key not configured (no fallback)
  - Line 50: Generic proxy error without proper status codes
- **Impact**: Service degrades completely instead of graceful degradation

---

## 5. HIGH: Hardcoded Data & Mock Features

These hardcoded values and mock implementations prevent the app from functioning with real blockchain/wallet data.

### 5.1 Hardcoded Wallet Address in Dashboard

- **File**: `apps/console/app/dashboard/page.tsx`
- **Line**: 128
- **Code**: `const [walletAddress] = useState('comnetish1tenantdemoa99f0u29k3f');`
- **Impact**: Dashboard only shows data for demo wallet, not user's actual connected wallet
- **Fix needed**: Use actual wallet context/provider

### 5.2 Hardcoded Tenant Address in Deployments

- **File**: `apps/console/app/deploy/page.tsx`
- **Line**: 417
- **Code**: `tenantAddress: 'comnetish1demo-wallet-connected'`
- **Impact**: All deployments always use demo address, not actual wallet
- **Fix needed**: Use connected wallet address from context

### 5.3 Mock USDC Approval

- **File**: `apps/console/app/deploy/page.tsx`
- **Lines**: 741-744
- **Issue**: Just sets a flag, doesn't actually approve USDC on blockchain
- **Code**: `setUsdcApproved(true);` without contract call
- **Impact**: Fake approval flow; real transactions won't work

### 5.4 Mock Provider Registration Mode

- **File**: `apps/provider-console/app/onboard/page.tsx`
- **Line**: 43
- **Code**: `const REGISTRATION_MODE = process.env.NEXT_PUBLIC_PROVIDER_REGISTRATION_MODE ?? 'mock';`
- **Additional**: Lines 320-321 show mock mode usage
- **Impact**: Uses mock registration instead of blockchain transactions by default

---

## 6. MEDIUM: Incomplete Deployment Workflow

### 6.1 Deployment Detail Page Minimal

- **File**: `apps/console/app/deployments/[id]/page.tsx`
- **Line**: 294
- **Current**: Only has close mutation
- **Missing**:
  - Provider details display
  - Bid list and management
  - Pricing breakdown
  - Status timeline/history
  - Lease information

### 6.2 No Bid Display/Management

- **Issue**: Users can see bids exist but cannot filter, sort, or manage them
- **Missing endpoints**: Already noted in section 1

---

## 7. MEDIUM: Provider Onboarding Incomplete

### 7.1 System Requirements Check Not Implemented

- **File**: `apps/provider-console/app/onboard/page.tsx`
- **Lines**: ~74-130 (baseChecksForOs function)
- **Issue**: Checks system requirements but doesn't actually install anything
- **Current**: Just displays install commands for user to run manually
- **Missing**:
  - Automated installation/setup
  - Dependency verification
  - Failed check handling

---

## 8. DATABASE ISSUES

### 8.1 Incomplete Seed Data

- **File**: `services/api/prisma/seed.ts`
- **Lines**: 53-73
- **Issue**: Only seeds providers, no sample deployments, bids, or leases
- **Impact**: Dashboard and tests have no real data without manual creation
- **What's needed**: Comprehensive seed with all entity types

### 8.2 Transaction Model Unused

- **File**: `services/api/prisma/schema.prisma`
- **Lines**: 92-100
- **Issue**: Model defined but never used in any routes
- **Impact**: No payment tracking or settlement implementation
- **What's needed**: Payment/transaction endpoints and handlers

---

## 9. TYPE SYSTEM ISSUES

### 9.1 Type Mismatches

- **File**: `packages/chain-client/src/index.ts`
- **Lines**: 47-51
- **Issue**: `CreateLeaseMsg` requires `bidId` but API doesn't support bid acceptance
- **Impact**: Types don't reflect actual API capabilities

---

## 10. Summary by Severity

| Severity        | Count | Category            | Examples                                           |
| --------------- | ----- | ------------------- | -------------------------------------------------- |
| 🔴 **CRITICAL** | 3     | Missing Endpoints   | No POST /leases, POST /bids, bid acceptance        |
| 🔴 **CRITICAL** | 2     | Empty Pages         | Provider console home, main console home           |
| 🟠 **HIGH**     | 4     | Incomplete Code     | AI service, lease logs, deployment detail page     |
| 🟠 **HIGH**     | 5+    | Missing Styles      | CSS classes for provider console                   |
| 🟡 **MEDIUM**   | 4     | Hardcoded Data      | Wallet addresses, registration mode, USDC approval |
| 🟡 **MEDIUM**   | 2     | Incomplete Features | Onboarding checks, deployment workflow             |
| 🟢 **LOW**      | 2     | Database Issues     | Incomplete seeds, unused models                    |

---

## 11. Recommendation Priority

### Phase 1 - Critical Fixes (Required for MVP)

1. ✅ Implement `POST /api/leases` endpoint
2. ✅ Implement `POST /api/bids` endpoint
3. ✅ Implement bid acceptance flow
4. ✅ Complete provider console home page
5. ✅ Add provider console CSS styling

### Phase 2 - High Priority

1. ✅ Complete deployment detail page
2. ✅ Implement real lease log streaming
3. ✅ Remove hardcoded wallet addresses
4. ✅ Implement real USDC approval flow
5. ✅ Complete AI service

### Phase 3 - Medium Priority

1. ✅ Complete provider onboarding
2. ✅ Fix database seeds
3. ✅ Use Transaction model for payments
4. ✅ Deploy status transition endpoints

---

## Notes for Developers

- **Testing**: Many features cannot be tested end-to-end due to missing endpoints
- **UI/UX**: Provider console lacks visual consistency; needs design token implementation
- **Blockchain Integration**: Several components mock blockchain interactions; need real contract calls
- **Error Handling**: Inconsistent error handling across services
- **Documentation**: No API documentation; endpoints are discoverable only by reading code

---

**Next Steps**: Prioritize fixing critical endpoints and completing empty pages before addressing other issues.
