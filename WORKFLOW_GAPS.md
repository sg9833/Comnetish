# Comnetish Marketplace Workflow - Missing Components Map

**Purpose**: Visual mapping of the marketplace workflow and identifying gaps

---

## Current Workflow vs. Intended Workflow

### INTENDED MARKETPLACE FLOW

```
┌─────────────────────────────────────────────────────────────────┐
│                         TENANT SIDE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. DEPLOYMENT CREATION                                          │
│     ├─ Tenant creates deployment request                         │
│     ├─ Specifies requirements (CPU, RAM, GPU, etc.)             │
│     ├─ Sets budget/price ceiling                                │
│     └─ ✅ IMPLEMENTED in /deploy page                           │
│                                                                   │
│  2. WAIT FOR BIDS                                               │
│     ├─ Deployment enters OPEN state                             │
│     ├─ Providers view available deployments                      │
│     └─ ✅ GET /deployments is implemented                       │
│                                                                   │
│  3. REVIEW BIDS (⚠️ PARTIALLY BROKEN)                           │
│     ├─ Bids displayed on deployment detail page                 │
│     ├─ ❌ No way to filter/sort bids                            │
│     └─ ✅ GET /bids endpoint exists                             │
│                                                                   │
│  4. ACCEPT BID & CREATE LEASE (🔴 CRITICAL - MISSING)           │
│     ├─ ❌ NO POST /api/leases endpoint                          │
│     ├─ ❌ No lease creation from bid acceptance                 │
│     ├─ ❌ No transaction flow                                   │
│     └─ ❌ Deployment stuck in OPEN state                        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

                            ⬆️  ⬇️
                        (Blockchain/Contract Calls)

┌─────────────────────────────────────────────────────────────────┐
│                      PROVIDER SIDE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ 1. PROVIDER REGISTRATION (⚠️ MOCK MODE)                         │
│    ├─ Provider creates account & onboards                       │
│    ├─ ⚠️ Uses MOCK mode instead of blockchain                  │
│    └─ Line 43: REGISTRATION_MODE defaults to 'mock'            │
│                                                                   │
│ 2. RESOURCE SETUP (❌ INCOMPLETE)                               │
│    ├─ Provider registers available resources                    │
│    ├─ ❌ System checks requirements but doesn't automate install│
│    └─ User must manually run installation commands              │
│                                                                   │
│ 3. VIEW AVAILABLE DEPLOYMENTS                                   │
│    └─ ✅ GET /deployments endpoint exists                       │
│                                                                   │
│ 4. SUBMIT BID (🔴 CRITICAL - MISSING)                           │
│    ├─ ❌ NO POST /api/bids endpoint                             │
│    ├─ ❌ Providers cannot submit bids                           │
│    ├─ ❌ Cannot propose pricing for deployments                 │
│    └─ BLOCKER: Entire provider workflow halted                 │
│                                                                   │
│ 5. MANAGE ACTIVE LEASES (⚠️ BROKEN)                             │
│    ├─ View active leases in provider console                    │
│    ├─ ❌ Provider console home page is empty scaffold           │
│    ├─ ⚠️ Lease logs are MOCK DATA (not real container logs)    │
│    └─ Monitor and manage resources                              │
│                                                                   │
│ 6. EARN REVENUE (❌ NOT IMPLEMENTED)                            │
│    ├─ ❌ Transaction model unused                               │
│    ├─ ❌ No payment processing                                  │
│    └─ ❌ No earnings tracking                                   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Gaps

### What Works ✅

```
TENANT                        API                      DATABASE
  │                            │                            │
  ├──→ Create Deployment ──→  POST /deployments  ──→  Store deployment
  │     (WORKS)                                            │
  │                                                        │
  └──← List Deployments  ←─── GET /deployments   ←──  Query deployments
        (WORKS)
```

### What's Broken 🔴

```
PROVIDER                      API                      DATABASE
  │                            │                            │
  ├──X Submit Bid         X─── POST /bids        X───  (NO ENDPOINT!)
  │     (MISSING)              (DOESN'T EXIST)
  │
  ├──X View Bids          X─── No filtering/sorting
  │     (INCOMPLETE)
  │
  └──X Earnings           X─── (No Transaction handling)
        (MISSING)

TENANT                        API                      DATABASE
  │                            │                            │
  ├──X Accept Bid         X─── POST /leases ←────  (NO ENDPOINT!)
  │     (MISSING)              (DOESN'T EXIST)
  │
  └──X Create Lease       X─── Transaction/Payment flow
        (MISSING)              (MISSING)
```

---

## Missing Endpoints Summary

| Endpoint               | Method | Status     | Impact                                      |
| ---------------------- | ------ | ---------- | ------------------------------------------- |
| `/deployments`         | GET    | ✅ Works   | List deployments                            |
| `/deployments/:id`     | GET    | ✅ Works   | View deployment details                     |
| `/deployments`         | POST   | ✅ Works   | Create deployment                           |
| `/bids`                | GET    | ✅ Works   | List bids                                   |
| `/bids`                | POST   | 🔴 MISSING | Submit bid - BLOCKS entire bid flow         |
| `/leases`              | GET    | ✅ Works   | List leases                                 |
| `/leases/:id/logs`     | GET    | ⚠️ MOCK    | Returns fake logs                           |
| `/leases`              | POST   | 🔴 MISSING | Accept bid & create lease - BLOCKS workflow |
| `/providers`           | GET    | ✅ Works   | List providers                              |
| `/providers/:id/stats` | GET    | ⚠️ PARTIAL | Incomplete implementation                   |
| `/providers/:id`       | PUT    | 🔴 MISSING | Update provider info                        |
| `/ai/inference`        | POST   | 🔴 MISSING | AI processing                               |
| `/transactions`        | Any    | 🔴 MISSING | Payment handling                            |

---

## Component Status Overview

### Pages

| Page              | File                                         | Status | Issues                                    |
| ----------------- | -------------------------------------------- | ------ | ----------------------------------------- |
| Deployments List  | `apps/console/app/deployments/page.tsx`      | ✅     | Works                                     |
| Deployment Detail | `apps/console/app/deployments/[id]/page.tsx` | ⚠️     | Minimal bid/lease display                 |
| Deploy (Create)   | `apps/console/app/deploy/page.tsx`           | ⚠️     | Hardcoded wallet, mock USDC approval      |
| Dashboard         | `apps/console/app/dashboard/page.tsx`        | ⚠️     | Hardcoded wallet address                  |
| Console Home      | `apps/console/app/page.tsx`                  | ❌     | Empty scaffold                            |
| Provider Onboard  | `apps/provider-console/app/onboard/page.tsx` | ⚠️     | Mock registration mode, incomplete checks |
| Provider Home     | `apps/provider-console/app/page.tsx`         | ❌     | Empty scaffold                            |
| Provider Console  | Multiple files                               | ⚠️     | Missing CSS, incomplete pages             |

---

## Service Status

| Service          | File                             | Status | Issues                              |
| ---------------- | -------------------------------- | ------ | ----------------------------------- |
| API Routes       | `services/api/src/routes/`       | ⚠️     | Missing critical endpoints          |
| AI Agent Service | `services/ai-agent/src/index.ts` | ❌     | Only has /health endpoint           |
| Database         | Prisma schema                    | ⚠️     | Models defined but incomplete usage |

---

## Frontend Components Status

| Component Type | Count | Complete | Incomplete | Missing |
| -------------- | ----- | -------- | ---------- | ------- |
| Pages          | 8+    | 2        | 4          | 2       |
| Endpoints      | 15+   | 6        | 4          | 5       |
| Features       | 8     | 2        | 2          | 4       |

---

## Critical Blockers (Must Fix First)

### 1. Bid Submission Blocked

```
Current: Provider can SEE deployments
Missing: Provider CANNOT bid on them (no POST /api/bids)
Result: Marketplace has no bids
```

### 2. Bid Acceptance Blocked

```
Current: Tenant can SEE bids
Missing: Tenant CANNOT accept them (no POST /api/leases)
Result: No leases created, money never moves
```

### 3. Provider Console Non-Functional

```
Current: Empty home page
Missing: Actual dashboard, lease management, earnings
Result: Providers have nowhere to work
```

### 4. Master Provider Console CSS

```
Current: Basic styles only
Missing: All design classes (shimmer, panel, glass, etc.)
Result: Provider console looks broken
```

---

## Why Marketplace Can't Operate Today

1. **Provider tries to bid** → ❌ NO POST /api/bids → STUCK
2. **Tenant tries to accept bid** → ❌ NO POST /api/leases → STUCK
3. **Provider checks their work** → ❌ Empty provider console → STUCK
4. **Payment processing** → ❌ No transaction endpoints → STUCK
5. **See real logs** → ❌ Fake mock data → STUCK

---

## Implementation Priority (for full marketplace operation)

### Phase 1: Core Marketplace Loop (Days 1-2)

```
✅ 1. POST /api/bids - Enable provider bidding
✅ 2. POST /api/leases - Enable bid acceptance & lease creation
✅ 3. Provider console home page - Show active leases
✅ 4. Provider console CSS - Make it look presentable
```

**After Phase 1**: Marketplace can process deployments from bid to lease

### Phase 2: Working Context (Days 3)

```
✅ 1. Remove hardcoded wallet addresses
✅ 2. Real USDC approval flow
✅ 3. Real lease log streaming
✅ 4. Provider registration on blockchain (not mock)
```

### Phase 3: Complete Features (Days 4-5)

```
✅ 1. Earnings/transaction tracking
✅ 2. AI service functionality
✅ 3. Deployment status transitions
✅ 4. Complete deployment detail page
```

---

## Testing Can't Happen Until...

- [ ] POST /api/bids works
- [ ] POST /api/leases works
- [ ] Bid acceptance flow complete
- [ ] Provider console is usable
- [ ] Wallet integration works
- [ ] Real blockchain transactions work

**Current State**: End-to-end testing impossible due to missing endpoints

---

## Notes

- The codebase has good scaffolding but is missing critical business logic
- Many features are "fake" (mock adoption, hardcoded data, placeholder implementations)
- Database schema exists but isn't fully utilized
- Frontend pages sometimes show hardcoded wallet addresses instead of using wallet context
- Provider console needs significant work to be functional

---

**Generated**: 2026-03-14
**Last Updated**: After full codebase scan
