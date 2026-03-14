# ⚡ Quick Start - 5 Minutes to Running

For the impatient! Just follow these exact commands in order.

---

## 🚀 The Fastest Path to Running Everything

### Step 1: One-Time Setup (3 minutes)

```bash
# From project root
cd /Users/garinesaiajay/projects/Comnetish

# Install dependencies
pnpm install

# Setup database
createdb comnetish_dev

# Configure API
cd services/api
cat > .env.local << 'EOF'
DATABASE_URL="postgresql://$(whoami)@localhost:5432/comnetish_dev"
ANTHROPIC_API_KEY="test-key"
ANTHROPIC_API_URL="https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL="claude-3-sonnet-20240229"
EOF

# Migrate & seed
pnpm prisma migrate dev --name init
pnpm prisma db seed

echo "✅ Database ready!"
```

### Step 2: Start 4 Services (Run each in separate terminal)

**Terminal 1 - API:**

```bash
cd /Users/garinesaiajay/projects/Comnetish/services/api
pnpm build && pnpm start
# 🟢 Ready on http://localhost:3001
```

**Terminal 2 - AI Ag:**

```bash
cd /Users/garinesaiajay/projects/Comnetish/services/ai-agent
pnpm start
# 🟢 Ready on http://localhost:3010
```

**Terminal 3 - Main Console:**

```bash
cd /Users/garinesaiajay/projects/Comnetish/apps/console
pnpm dev
# 🟢 Ready on http://localhost:3000
```

**Terminal 4 - Provider Console:**

```bash
cd /Users/garinesaiajay/projects/Comnetish/apps/provider-console
pnpm dev
# 🟢 Ready on http://localhost:3002
```

---

## 🌐 Open These in Your Browser

**Main Console (Tenant Portal):**

```
http://localhost:3000
```

**Provider Console:**

```
http://localhost:3002
```

**Direct API Test:**

```bash
# In a terminal, run:
curl http://localhost:3001/api/providers | head -50
```

---

## ✅ Check Everything Works

Run this in a terminal:

```bash
# All should return JSON
curl http://localhost:3001/api/providers | grep -q "data" && echo "✅ API works"
curl http://localhost:3010/health | grep -q "service" && echo "✅ AI works"
echo "✅ Go to http://localhost:3000 in browser"
```

---

## 🎯 What to Do First

1. **Go to http://localhost:3000**
   - Should see stats and dashboards
   - Should show 5 providers, 4 deployments, 2 active leases

2. **Go to http://localhost:3002**
   - Provider console dashboard
   - Should show active leases and stats

3. **Test Creating a Bid** (via API):

```bash
DEPLOYMENT="deploy-comnetish1tenantdemoa99f0u29k3f-0"
PROVIDER="YOUR_FIRST_PROVIDER_ID"

# Get first provider ID
PROVIDER=$(curl -s http://localhost:3001/api/providers | jq -r '.data[0].id')

# Create a bid
curl -X POST http://localhost:3001/api/bids \
  -H "Content-Type: application/json" \
  -d "{\"deploymentId\":\"$DEPLOYMENT\",\"providerId\":\"$PROVIDER\",\"price\":2.5}"
```

4. **Test Creating a Lease**:

```bash
# Accept the bid and create lease
curl -X POST http://localhost:3001/api/leases \
  -H "Content-Type: application/json" \
  -d "{\"deploymentId\":\"$DEPLOYMENT\",\"providerId\":\"$PROVIDER\",\"pricePerBlock\":0.2}"
```

5. **Verify in Provider Console:**
   - Refresh http://localhost:3002
   - Should show new lease in the dashboard

---

## 🆘 Troubleshooting Quick Fixes

### Port already in use?

```bash
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
lsof -ti:3002 | xargs kill -9
lsof -ti:3010 | xargs kill -9
```

### PostgreSQL not running?

```bash
# macOS:
brew services start postgresql

# Then test:
psql -l | grep comnetish_dev
```

### API not starting?

```bash
cd services/api
rm -rf dist node_modules/.bin
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

### Pages load but empty?

```bash
# Check database has data
cd services/api
pnpm prisma studio  # Opens GUI

# Re-seed if empty
pnpm prisma db seed
```

### Styles look broken?

```bash
# Clear cache
cd apps/console && rm -rf .next
cd apps/provider-console && rm -rf .next

# Restart dev servers
```

---

## 📊 Directory Reference

```
Comnetish/
├── services/
│   ├── api/           ← API server (Terminal 1)
│   └── ai-agent/      ← AI service (Terminal 2)
├── apps/
│   ├── console/       ← Main Console (Terminal 3)
│   └── provider-console/ ← Provider Console (Terminal 4)
└── LOCAL_SETUP_GUIDE.md ← Full detailed guide
```

---

## 🔗 All URLs at a Glance

| Service          | URL                   | Port | What It Is         |
| ---------------- | --------------------- | ---- | ------------------ |
| Main Console     | http://localhost:3000 | 3000 | Tenant portal      |
| Provider Console | http://localhost:3002 | 3002 | Provider dashboard |
| API              | http://localhost:3001 | 3001 | REST API           |
| AI Agent         | http://localhost:3010 | 3010 | AI service         |

---

## ⏱️ Timeline

- **Minute 1**: Run `pnpm install`
- **Minute 2**: Setup database (createdb, seed)
- **Minute 3**: Start API service (Terminal 1)
- **Minute 4**: Start all 3 other services (Terminals 2-4)
- **Minute 5**: Open http://localhost:3000 in browser ✅

**That's it!** Everything is running.

---

## 🎓 Understanding What's Running

```
Your Laptop
├─ PostgreSQL Database (localhost:5432)
│  └─ Stores: providers, deployments, bids, leases
│
├─ API Server (localhost:3001)
│  └─ REST endpoints for all operations
│
├─ AI Agent (localhost:3010)
│  └─ Inference endpoints
│
├─ Main Console (localhost:3000 but separate Next.js)
│  └─ Frontend UI for tenants
│
└─ Provider Console (localhost:3002)
   └─ Frontend UI for providers
```

---

## ✨ Features to Try

### On Main Console (http://localhost:3000):

- [ ] View dashboard with stats
- [ ] Go to deployments page
- [ ] Click on a deployment to see bids
- [ ] View provider dashboard
- [ ] Try to create a deployment

### On Provider Console (http://localhost:3002):

- [ ] See dashboard with active leases
- [ ] View available resources
- [ ] See pending bids
- [ ] View earnings stats

### Via API (Terminal):

```bash
# List all providers
curl http://localhost:3001/api/providers | jq

# List all deployments
curl http://localhost:3001/api/deployments | jq

# List all leases
curl http://localhost:3001/api/leases | jq

# Get provider stats
curl http://localhost:3001/api/providers/me/stats | jq

# Get AI models
curl http://localhost:3010/models | jq
```

---

## 🎉 You're Ready!

Everything is set up and running. Enjoy exploring Comnetish!

**For detailed info**, see `LOCAL_SETUP_GUIDE.md` in the project root.
