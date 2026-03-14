# Comnetish - Complete Local Setup & Testing Guide

**Last Updated**: 2026-03-14
**For**: Developer Machine Setup

---

## 📋 Prerequisites Check

Before starting, verify you have these installed:

```bash
# Check Node/Bun
bun --version        # Should be v1.0+
node --version       # Should be v20+

# Check pnpm
pnpm --version       # Should be v9+

# Check PostgreSQL
psql --version       # Should be installed and running

# Check git
git --version
```

**If any are missing**, install them:

- **Bun**: https://bun.sh (latest)
- **Node**: https://nodejs.org (v20+)
- **pnpm**: `npm install -g pnpm`
- **PostgreSQL**: https://www.postgresql.org/download/

---

## 🔧 Step 1: Install Dependencies

```bash
# You should already be in the project root
# /Users/garinesaiajay/projects/Comnetish

# Install all workspace dependencies
pnpm install

# This will install:
# - Main app dependencies
# - Provider console dependencies
# - API service dependencies
# - AI agent service dependencies
# - Shared packages
```

**Expected output:**

```
✓ Packages in scope: @comnetish/ui, @comnetish/types, @comnetish/chain-client, console, provider-console, api, ai-agent
✓ Hoisted 247 packages
```

`@comnetish/chain-client` is installed with the workspace, but the default local console/API workflow still runs against PostgreSQL. You do not need the optional chain fork or contracts stack to bring up the app locally.

---

## 🗄️ Step 2: Database Setup

### 2.1 Create Database

```bash
# Create a new PostgreSQL database
createdb comnetish_dev

# Verify it was created
psql -l | grep comnetish_dev
```

**Expected output:**

```
 comnetish_dev | [your_username] | UTF8     | en_US.UTF-8 | en_US.UTF-8 |
```

### 2.2 Set Environment Variables

```bash
# Navigate to API service
cd services/api

# Create .env.local file
cat > .env.local << 'EOF'
DATABASE_URL="postgresql://[your_username]@localhost:5432/comnetish_dev"
ANTHROPIC_API_KEY="sk-test-key-replace-later"
ANTHROPIC_API_URL="https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL="claude-3-sonnet-20240229"
EOF
```

**Replace `[your_username]`** with your PostgreSQL username:

```bash
# Find your PostgreSQL user
psql -U postgres -c "SELECT usename FROM pg_user;"

# Then update DATABASE_URL in .env.local
```

### 2.3 Run Database Migrations

```bash
# You should still be in /services/api

# Generate Prisma client
pnpm prisma generate

# Run migrations
pnpm prisma migrate deploy

# If no migrations exist, create the initial schema
pnpm prisma migrate dev --name init
```

**Expected output:**

```
✓ Your database has been successfully initialized!
```

### 2.4 Seed Test Data

```bash
# Still in services/api

# Run seed script
pnpm prisma db seed
```

**Expected output:**

```
Starting seed...
Seeded 5 providers across US, EU, and Asia.
Seeded 4 deployments.
Seeded 12 bids.
Seeded 2 leases.
Seeded 8 sample transactions.
Seed completed successfully!
```

✅ **Database is now ready with test data!**

---

## 🚀 Step 3: Start All Services

Open **4 separate terminal tabs/windows**. You'll run each service in its own terminal.

### Terminal 1: API Service

```bash
cd /Users/garinesaiajay/projects/Comnetish/services/api

# Build the service
pnpm build

# Start the API server
pnpm start
```

**Expected output:**

```
listening on http://0.0.0.0:3001
```

✅ **API is running on: http://localhost:3001**

### Terminal 2: AI Agent Service

```bash
cd /Users/garinesaiajay/projects/Comnetish/services/ai-agent

# Start the AI agent
pnpm start
```

**Expected output:**

```
@comnetish/ai-agent listening on :3010
```

✅ **AI Agent is running on: http://localhost:3010**

### Terminal 3: Main Console (Tenant)

```bash
cd /Users/garinesaiajay/projects/Comnetish/apps/console

# Start the console dev server
pnpm dev
```

**Expected output:**

```
▲ Next.js 14.x.x
- Local:        http://localhost:3000
- Environments: .env.local

✓ Ready in 2.3s
```

✅ **Main Console is running on: http://localhost:3000**

> **Note:** If port 3000 conflicts with API, it will auto-increment to 3001 or 3002

### Terminal 4: Provider Console

```bash
cd /Users/garinesaiajay/projects/Comnetish/apps/provider-console

# Start the provider console dev server
pnpm dev
```

**Expected output:**

```
▲ Next.js 14.x.x
- Local:        http://localhost:3002
```

✅ **Provider Console is running on: http://localhost:3002**

---

## ✅ Verification: Check All Services are Running

Open a 5th terminal and test:

```bash
# Test API service
curl http://localhost:3001/api/providers | head -20

# Test AI service
curl http://localhost:3010/health

# Result should show:
# {"service":"ai-agent","model":"gpt-4o-mini","ready":true}
```

✅ **All services should respond without errors**

---

## 🌐 Step 4: Access the Applications

### Main Console (Tenant Portal)

**URL**: http://localhost:3000

### Provider Console

**URL**: http://localhost:3002

### API Documentation

**Base URL**: http://localhost:3001/api
**Available endpoints**:

- `/api/providers` - List providers
- `/api/deployments` - List deployments
- `/api/bids` - List bids
- `/api/leases` - List leases

---

## 📊 Step 5: Test All Features

### A. Test the Dashboard

**1. Go to Main Console Home Page**

```
http://localhost:3000
```

**What you should see:**

- ✅ 4 stat cards showing:
  - Total Providers (should show 5)
  - Active Deployments (should show 2)
  - Active Leases (should show 2)
  - Monthly Spending (should show calculated amount)
- ✅ "Active Deployments" section with 2 deployments
- ✅ "Pending Bids" section with bids waiting
- ✅ "Quick Actions" buttons
- ✅ Smooth animations when page loads

**Click through:**

- [ ] Click "Create Deployment" button
- [ ] Click "View All Deployments" button
- [ ] Click "Go to Dashboard" button

---

### B. Test Deployments Page

**1. Go to Deployments**

```
http://localhost:3000/deployments
```

**What you should see:**

- ✅ List of 4 deployments
- ✅ Status badges (OPEN, ACTIVE)
- ✅ Each shows tenant address and bids count
- ✅ Click each deployment to see details

**2. Click on an OPEN deployment**

```
http://localhost:3000/deployments/deploy-comnetish1tenantdemoa99f0u29k3f-0
```

**What you should see:**

- ✅ Deployment details
- ✅ List of bids for that deployment
- ✅ Provider names, prices, regions
- ✅ Can see bid details

---

### C. Test Dashboard

**1. Go to Dashboard**

```
http://localhost:3000/dashboard
```

**What you should see:**

- ✅ Network health indicator (should be "Healthy")
- ✅ 4 stat cards with animated numbers:
  - Total Providers
  - Active Deployments
  - CNT/hour
  - Total Compute Leased
- ✅ Recent Activity section showing events
- ✅ Market Overview with average pricing

**Check animations:**

- [ ] Numbers should animate up from 0
- [ ] Cards should have smooth fade-in animations
- [ ] Activity events should appear smoothly

---

### D. Test Provider Console Home

**1. Go to Provider Console**

```
http://localhost:3002
```

**What you should see:**

- ✅ Dashboard with 4 stat cards:
  - Active Leases (should show 2)
  - Monthly Earnings (calculated)
  - Total Earnings
  - CPU Available (should show 48 cores from first provider)
- ✅ Active Leases section showing 2 leases
- ✅ Available Resources section with CPU/Memory/Storage bars
- ✅ Pending Bids section
- ✅ Smooth animations and loading skeletons

**Click through:**

- [ ] Scroll down to see all sections
- [ ] Try accept/decline buttons on bids (they'll log to console for now)

---

### E. Test Deployment Creation (Create Deployment Page)

**1. Go to Create Deployment**

```
http://localhost:3000/deploy
```

**What you should see:**

- ✅ Step indicator (1/2/3)
- ✅ Mode selector (AI or Manual)
- ✅ AI text area where you can enter deployment requests
- ✅ Provider selection list with prices
- ✅ Review and launch button

**Try creating a deployment:**

```
1. Enter in AI prompt:
   "Deploy a FastAPI app with 2 CPU and 2GB RAM"

2. Click "Generate SDL"
   - Should show generated SDL YAML

3. Click "Accept SDL"
   - Should proceed to step 2

4. Select a provider from the list
   - Should highlight selection

5. Click "Next"
   - Should proceed to review

6. Click "Launch Deployment"
   - Should show success animation (confetti!)
   - Should redirect to deployment detail page
```

---

## 🔌 Step 6: Test API Endpoints Directly

Open a terminal and test endpoints:

```bash
# 1. Get list of providers
curl http://localhost:3001/api/providers | jq

# 2. Get list of deployments
curl http://localhost:3001/api/deployments | jq

# 3. Get list of bids
curl http://localhost:3001/api/bids?deploymentId=deploy-comnetish1tenantdemoa99f0u29k3f-0 | jq

# 4. Get provider stats
curl http://localhost:3001/api/providers/me/stats | jq

# 5. Get active leases
curl http://localhost:3001/api/leases?status=ACTIVE | jq

# 6. Test AI endpoints
curl http://localhost:3010/models | jq

# 7. Test AI inference
curl -X POST http://localhost:3010/inference \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Deploy nginx"}' | jq
```

**Expected** (should all return JSON with data)

---

## 🎯 Step 7: End-to-End Workflow Test

This tests the complete marketplace flow:

### Test: Bid → Accept → See in Provider Console

```bash
# Step 1: Get a deployment ID
DEPLOYMENT_ID=$(curl -s http://localhost:3001/api/deployments | jq -r '.data[0].id')
echo "Deployment: $DEPLOYMENT_ID"

# Step 2: Get a provider ID
PROVIDER_ID=$(curl -s http://localhost:3001/api/providers | jq -r '.data[0].id')
echo "Provider: $PROVIDER_ID"

# Step 3: Create a bid
BID_RESPONSE=$(curl -s -X POST http://localhost:3001/api/bids \
  -H "Content-Type: application/json" \
  -d "{\"deploymentId\":\"$DEPLOYMENT_ID\",\"providerId\":\"$PROVIDER_ID\",\"price\":1.5}")
echo "Bid created:"
echo $BID_RESPONSE | jq

# Step 4: Create a lease from that bid
LEASE_RESPONSE=$(curl -s -X POST http://localhost:3001/api/leases \
  -H "Content-Type: application/json" \
  -d "{\"deploymentId\":\"$DEPLOYMENT_ID\",\"providerId\":\"$PROVIDER_ID\",\"pricePerBlock\":0.15}")
echo "Lease created:"
echo $LEASE_RESPONSE | jq

# Step 5: Verify deployment is now ACTIVE
curl -s http://localhost:3001/api/deployments/$DEPLOYMENT_ID | jq '.data.status'
# Should show: "ACTIVE"

# Step 6: Verify lease appears in provider console
curl -s http://localhost:3001/api/providers/me/leases | jq '.data | length'
# Should show more leases than before
```

✅ **If all steps work, the marketplace workflow is functional!**

---

## 🎨 Step 8: Visual Inspection Checklist

Go through each page and verify:

### Main Console Pages

- [ ] **Home**: http://localhost:3000
  - [ ] Stats cards visible and animated
  - [ ] Deployments section shows data
  - [ ] Pending bids section shows data
  - [ ] Buttons work

- [ ] **Dashboard**: http://localhost:3000/dashboard
  - [ ] Network health displayed
  - [ ] Animated stat cards
  - [ ] Recent activity feed
  - [ ] Market overview

- [ ] **Deployments List**: http://localhost:3000/deployments
  - [ ] 4 deployments shown
  - [ ] Status badges visible
  - [ ] Links clickable

- [ ] **Deployment Detail**: http://localhost:3000/deployments/[id]
  - [ ] Full deployment details
  - [ ] Bids list showing
  - [ ] Close button available

- [ ] **Create Deployment**: http://localhost:3000/deploy
  - [ ] AI and Manual modes work
  - [ ] Provider selection works
  - [ ] Forms responsive
  - [ ] Navigation between steps

### Provider Console Pages

- [ ] **Home**: http://localhost:3002
  - [ ] Stats cards showing data
  - [ ] Active leases section
  - [ ] Resources bars visible
  - [ ] Pending bids section
  - [ ] Accept/Decline buttons present

- [ ] **Onboarding**: http://localhost:3002/onboard
  - [ ] System check items visible
  - [ ] Install commands displayed
  - [ ] Smooth animations

---

## 🆘 Troubleshooting

### Issue: Port Already in Use

**Error**: `Error: listen EADDRINUSE: address already in use :::3000`

**Fix**:

```bash
# Kill the process using the port
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3002 pnpm dev
```

### Issue: Database Connection Failed

**Error**: `Can't reach database server`

**Fix**:

```bash
# Check PostgreSQL is running
pg_isready

# If not running, start it
# macOS with Homebrew:
brew services start postgresql

# Or manually:
postgres -D /usr/local/var/postgres
```

### Issue: API Not Responding

**Error**: `curl: (7) Failed to connect`

**Fix**:

```bash
# Make sure you built the API
cd services/api
pnpm build
pnpm start

# Check it's listening
curl http://localhost:3001/api/providers
```

### Issue: Pages Show "Connect Wallet"

**Note**: This is expected. RainbowKit is installed but you need to connect a test wallet. You can:

1. Install MetaMask extension
2. Create a test wallet
3. Click "Connect Wallet" button on pages

For now, you can still see the dashboards which fetch all data (not wallet-specific).

### Issue: No Data in Dashboard

**Fix**:

```bash
# Make sure seeds were run
cd services/api
pnpm prisma db seed

# Check data exists
pnpm prisma studio
# Opens GUI to view database
```

### Issue: Styles Look Wrong

**Fix**:

```bash
# Clear Next.js cache and rebuild
cd apps/console
rm -rf .next
pnpm build

# Same for provider console
cd apps/provider-console
rm -rf .next
pnpm build
```

---

## 📈 Performance Check

Test that pages load fast:

```bash
# Check API response time
time curl http://localhost:3001/api/providers > /dev/null

# Should be < 100ms

# Check page loads in browser
# Open DevTools (F12) → Network tab
# Reload page → Check response times
# Should be mostly green (<500ms each)
```

---

## 🎓 Understanding the Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Your Laptop                            │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  PostgreSQL (Port 5432)  ← Database                      │
│          ↕                                                │
│  API Service (Port 3001) ← REST API                      │
│      ↑         ↑                                         │
│      │         └── Prisma ORM                            │
│      │                                                   │
│      ├─────────────Main Console (Port 3000)             │
│      │            - Tenant Portal                        │
│      │            - Create Deployments                   │
│      │            - View Bids & Leases                   │
│      │                                                   │
│      ├─────────────Provider Console (Port 3002)         │
│      │            - Provider Dashboard                   │
│      │            - Active Leases                        │
│      │            - Pending Bids                         │
│      │                                                   │
│      └─────────────AI Agent (Port 3010)                 │
│                   - Inference Endpoints                  │
│                   - Model Info                           │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 📞 Quick Reference Commands

```bash
# Terminal 1 (API)
cd services/api && pnpm build && pnpm start

# Terminal 2 (AI Agent)
cd services/ai-agent && pnpm start

# Terminal 3 (Main Console)
cd apps/console && pnpm dev

# Terminal 4 (Provider Console)
cd apps/provider-console && pnpm dev

# Terminal 5 (Testing)
cd /Users/garinesaiajay/projects/Comnetish

# Test APIs
curl http://localhost:3001/api/providers | jq
curl http://localhost:3010/health | jq

# Database operations
cd services/api
pnpm prisma studio  # Opens GUI database browser
pnpm prisma migrate status
pnpm prisma db seed # Re-seed if needed
```

---

## ✅ Final Checklist

- [ ] All 4 services running in separate terminals
- [ ] No error messages in terminals
- [ ] Main Console accessible (http://localhost:3000)
- [ ] Provider Console accessible (http://localhost:3002)
- [ ] Dashboard shows data
- [ ] Provider console shows data
- [ ] API endpoints respond (curl tests pass)
- [ ] End-to-end workflow works (bid → lease → provider console)
- [ ] No console errors in browser DevTools
- [ ] Pages load smoothly with animations

---

## 🎉 You're All Set!

Everything is running! You can now:

1. **Explore the marketplace** - Create deployments, see bids, accept bids
2. **Test the workflow** - Full end-to-end bid → lease → provider visibility
3. **Debug issues** - Check terminal output and browser console
4. **Modify code** - Changes auto-reload thanks to Next.js Dev mode

### Next Steps:

- Try creating a real deployment workflow
- Test API endpoints with curl or Postman
- Check browser DevTools for network requests
- Explore the database with `pnpm prisma studio`

**Questions?** Check the troubleshooting section above or the documentation files created earlier.
