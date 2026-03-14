# 📋 Step-by-Step Local Setup Checklist

**Print this out or keep it open while setting up!**

---

## Phase 1️⃣: Prerequisites (Before You Start)

Run these checks:

```
☐ Check Bun:           bun --version     (should be v1.0+)
☐ Check Node:          node --version    (should be v20+)
☐ Check pnpm:          pnpm --version    (should be v9+)
☐ Check PostgreSQL:    psql --version    (should be installed)
☐ Check PostgreSQL running: pg_isready   (should say "accepting")
```

❌ **If any failed?** Install from:

- Bun: https://bun.sh
- Node: https://nodejs.org
- pnpm: npm install -g pnpm
- PostgreSQL: https://www.postgresql.org/download

---

## Phase 2️⃣: Install (One-Time)

**Location**: `/Users/garinesaiajay/projects/Comnetish`

```bash
# Step 1: Install dependencies
☐ pnpm install

# Step 2: Create database
☐ createdb comnetish_dev

# Step 3: Verify database created
☐ psql -l | grep comnetish_dev

# Expected: Should see "comnetish_dev | username | UTF8"
```

---

## Phase 3️⃣: Database Setup

**Location**: `services/api`

```bash
cd services/api

# Step 1: Create .env.local
☐ Create file with your database URL

# Step 2: Run migrations
☐ pnpm prisma migrate dev --name init

# Step 3: Seed test data
☐ pnpm prisma db seed

# Expected output:
# ✓ Seeded 5 providers
# ✓ Seeded 4 deployments
# ✓ Seeded 12 bids
# ✓ Seeded 2 leases
# ✓ Seeded 8 transactions
```

---

## Phase 4️⃣: Starting Services

**⚠️ IMPORTANT: Open 4 separate terminal tabs/windows ⚠️**

### Terminal #1: API Server

```bash
cd /Users/garinesaiajay/projects/Comnetish/services/api
☐ pnpm build
☐ pnpm start

📍 Wait for message: "listening on http://0.0.0.0:3001"
✅ When you see that, this service is ready
```

### Terminal #2: AI Agent Service

```bash
cd /Users/garinesaiajay/projects/Comnetish/services/ai-agent
☐ pnpm start

📍 Wait for message: "@comnetish/ai-agent listening on :3010"
✅ When you see that, this service is ready
```

### Terminal #3: Main Console

```bash
cd /Users/garinesaiajay/projects/Comnetish/apps/console
☐ pnpm dev

📍 Wait for message: "Ready in X.Xs"
✅ When you see that, this service is ready
```

### Terminal #4: Provider Console

```bash
cd /Users/garinesaiajay/projects/Comnetish/apps/provider-console
☐ pnpm dev

📍 Wait for message: "Ready in X.Xs"
✅ When you see that, this service is ready
```

---

## Phase 5️⃣: Verification

**Open Terminal #5 (for testing):**

```bash
# Test 1: API responds
☐ curl http://localhost:3001/api/providers | head -20
   (Should show JSON with provider data)

# Test 2: AI Agent responds
☐ curl http://localhost:3010/health
   (Should show: {"service":"ai-agent",...})

# Test 3: Check all running
☐ pgrep -f "pnpm" | wc -l
   (Should show 4+ processes)
```

✅ **All passed? Continue!**

---

## Phase 6️⃣: Visit Applications (Browser)

**Open your web browser:**

### ✅ Main Console (Tenant Portal)

```
URL: http://localhost:3000
You should see:
☐ Page loads without errors
☐ Dashboard with stats cards
☐ Active deployments section
☐ Pending bids section
☐ Navigation buttons work
```

### ✅ Provider Console

```
URL: http://localhost:3002
You should see:
☐ Page loads without errors
☐ Dashboard with stats
☐ Active leases section
☐ Available resources with bars
☐ Pending bids section
```

---

## Phase 7️⃣: Data Verification

In any browser tab, test these URLs:

```
✅ Providers: http://localhost:3001/api/providers
   Should show 5 providers

✅ Deployments: http://localhost:3001/api/deployments
   Should show 4 deployments

✅ Leases: http://localhost:3001/api/leases
   Should show 2 active leases

✅ Bids: http://localhost:3001/api/bids
   Should show 12 bids
```

---

## Phase 8️⃣: Test Workflow (Optional but Recommended!)

In Terminal #5, run these API tests:

```bash
# Get IDs
DEPLOYMENT=$(curl -s http://localhost:3001/api/deployments | jq -r '.data[0].id')
PROVIDER=$(curl -s http://localhost:3001/api/providers | jq -r '.data[0].id')

echo "Deployment: $DEPLOYMENT"
echo "Provider: $PROVIDER"

# Create a bid
☐ curl -X POST http://localhost:3001/api/bids \
    -H "Content-Type: application/json" \
    -d "{\"deploymentId\":\"$DEPLOYMENT\",\"providerId\":\"$PROVIDER\",\"price\":1.5}"

# Create a lease (accept the bid)
☐ curl -X POST http://localhost:3001/api/leases \
    -H "Content-Type: application/json" \
    -d "{\"deploymentId\":\"$DEPLOYMENT\",\"providerId\":\"$PROVIDER\",\"pricePerBlock\":0.1}"

# Verify in provider console
☐ Go to http://localhost:3002
☐ Should see new lease in dashboard
```

✅ **If this works, the full workflow is functional!**

---

## Phase 9️⃣: Explore Features

Now that everything is running, explore:

### Main Console

```
Home Page (http://localhost:3000)
  ☐ Click "Create Deployment"
  ☐ Click "View All Deployments"
  ☐ Click "Go to Dashboard"

Deployments (http://localhost:3000/deployments)
  ☐ See 4 deployments listed
  ☐ Click one to see details
  ☐ See bids for that deployment

Create Deployment (http://localhost:3000/deploy)
  ☐ See AI mode form
  ☐ See Manual mode form
  ☐ Provider selection works
  ☐ Can navigate between steps

Dashboard (http://localhost:3000/dashboard)
  ☐ Stats cards visible
  ☐ Numbers animate
  ☐ Recent activity shows
  ☐ Market overview displays
```

### Provider Console

```
Home Page (http://localhost:3002)
  ☐ See active leases
  ☐ See earnings stats
  ☐ See resources bars
  ☐ See pending bids

That's the main page! Explore and try interactions.
```

---

## 🔟 Troubleshooting Checklist

### ❌ "Port already in use"

```bash
☐ Kill process: lsof -ti:3000 | xargs kill -9
☐ Try again
```

### ❌ "Can't connect to database"

```bash
☐ Check PostgreSQL running: pg_isready
☐ If not: brew services start postgresql
☐ Create database: createdb comnetish_dev
```

### ❌ "API won't start"

```bash
☐ cd services/api
☐ pnpm clean (if available)
☐ rm -rf node_modules/.pnpm dist
☐ pnpm install
☐ pnpm build
☐ pnpm start
```

### ❌ "Pages show no data"

```bash
☐ Go to: http://localhost:3001/api/providers
☐ If empty, re-seed:
   cd services/api
   pnpm prisma db seed
```

### ❌ "Styles look broken"

```bash
☐ Clear cache:
   cd apps/console && rm -rf .next
   cd apps/provider-console && rm -rf .next
☐ Restart dev servers in Terminals 3 & 4
```

---

## ✅ Final Completion Checklist

Mark these off when each is done:

```
PHASE 1: Prerequisites
☐ All tools installed
☐ PostgreSQL running

PHASE 2-3: Installation & Database
☐ Dependencies installed (pnpm install)
☐ Database created (comnetish_dev)
☐ Database seeded (all 5 rows created)

PHASE 4: Services Started
☐ Terminal 1 (API): Ready message shown
☐ Terminal 2 (AI Agent): Ready message shown
☐ Terminal 3 (Main Console): Ready message shown
☐ Terminal 4 (Provider Console): Ready message shown

PHASE 5: Verification
☐ API responds to curl
☐ AI Agent responds to curl
☐ 4 services running

PHASE 6: Browser Access
☐ http://localhost:3000 loads
☐ http://localhost:3002 loads
☐ Both show dashboards with data

PHASE 7: Data Verification
☐ API endpoints return JSON
☐ 5 providers visible
☐ 4 deployments visible
☐ 2 leases visible
☐ 12 bids visible

PHASE 8: Workflow Test (Optional)
☐ Can create bid via API
☐ Can create lease via API
☐ New lease appears in provider console

PHASE 9: Exploration
☐ Explored Main Console pages
☐ Explored Provider Console
☐ Tested navigation
☐ All features visible
```

---

## 🎉 All Done!

When everything above is checked off, your local Comnetish setup is complete!

**Next**: Read the documentation or start modifying/exploring the code.

---

## 📞 Quick Reference

```bash
# One-liner to check everything
curl http://localhost:3001/api/providers -s | grep -q data && \
curl http://localhost:3010/health -s | grep -q service && \
echo "✅ Everything running!" || echo "❌ Something's wrong"

# Kill all services
pkill -f "pnpm start"
pkill -f "pnpm dev"

# View database GUI
cd services/api && pnpm prisma studio

# Check logs if something fails
# Look at Terminal output where service failed

# Re-seed database
cd services/api && pnpm prisma db seed
```

---

**Good luck! You've got this! 🚀**
