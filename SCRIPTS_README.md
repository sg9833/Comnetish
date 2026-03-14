# Comnetish Automation Scripts

Quick-start scripts to automate setup, deployment, and testing of Comnetish locally.

## Scripts Overview

| Script                | Purpose                    | When to Use                                        |
| --------------------- | -------------------------- | -------------------------------------------------- |
| **setup.sh**          | Complete one-time setup    | First time installation                            |
| **start-services.sh** | Start all 4 services       | After setup, each development session              |
| **verify.sh**         | Test all APIs and services | After starting services to verify everything works |

---

## 1. **setup.sh** - Complete Setup Automation

Fully automates the initial setup process from zero to running database with seeded data.

### What It Does

1. ✅ Checks prerequisites (Bun, Node, pnpm, PostgreSQL)
2. ✅ Installs all project dependencies
3. ✅ Creates PostgreSQL database (`comnetish_dev`)
4. ✅ Configures environment (`.env.local` file)
5. ✅ Runs database migrations
6. ✅ Seeds test data (5 providers, 4 deployments, 12 bids, 2 leases)
7. ✅ Optionally starts all 4 services

### Usage

**Setup only (recommended for first run):**

```bash
./setup.sh
```

**Setup + auto-start all services:**

```bash
./setup.sh --start-services
```

**Show help:**

```bash
./setup.sh --help
```

### Expected Output

```
✅ Bun is installed (version: v1.0.23)
✅ Node.js is installed (v18.17.0)
✅ pnpm is installed (version: 8.6.0)
✅ PostgreSQL is installed (PostgreSQL 14.9)
✅ PostgreSQL is running
✅ All prerequisites are met!
...
✅ Dependencies installed
✅ Database created
✅ .env.local created
✅ Migrations completed
✅ Database seeded with test data
✅ Setup Complete!
```

### Time Required

- **First run: ~3-5 minutes** (includes pnpm install)
- **Subsequent runs: ~30 seconds** (only migrating/seeding)

---

## 2. **start-services.sh** - Service Startup

Starts all 4 services in separate Terminal windows on macOS.

### What It Does

Opens 4 new Terminal windows and starts:

1. **Terminal 1**: API Service (port 3001)

   ```
   cd services/api && pnpm build && pnpm start
   ```

2. **Terminal 2**: AI Agent (port 3010)

   ```
   cd services/ai-agent && pnpm start
   ```

3. **Terminal 3**: Main Console (port 3000)

   ```
   cd apps/console && pnpm dev
   ```

4. **Terminal 4**: Provider Console (port 3002)
   ```
   cd apps/provider-console && pnpm dev
   ```

### Usage

```bash
./start-services.sh
```

### What to Look For

Watch for each service to print a "Ready" message:

```
Terminal 1: listening on http://0.0.0.0:3001
Terminal 2: @comnetish/ai-agent listening on :3010
Terminal 3: ✓ Ready in 2.3s
Terminal 4: ✓ Ready in 2.1s
```

### Access Points

- **Main Console (Tenant UI)**: http://localhost:3000
- **Provider Console (Provider UI)**: http://localhost:3002
- **API**: http://localhost:3001/api/providers
- **AI Agent**: http://localhost:3010/health

### Time Required

- **~30 seconds** for all services to be ready

### Tips

- Arrange the 4 Terminal windows side-by-side to monitor all services at once
- Watch for error messages during startup (red text)
- Services auto-reload code changes during development
- Press `Ctrl+C` in any terminal to stop that service individually

---

## 3. **verify.sh** - Testing & Verification

Tests all APIs, services, and database to verify everything is working.

### What It Does

Runs comprehensive tests including:

1. ✅ Service connectivity (API, AI Agent)
2. ✅ API endpoint tests (GET /api/providers, /deployments, /leases, /bids)
3. ✅ Database integration (verifies data exists)
4. ✅ AI service tests (/health, /models endpoints)
5. ✅ End-to-end workflow (create bid → create lease → verify status)

### Usage

**Full test suite (default):**

```bash
./verify.sh
```

**Quick connectivity check only:**

```bash
./verify.sh --quick
```

**API endpoints only:**

```bash
./verify.sh --api
```

**End-to-end workflow only:**

```bash
./verify.sh --workflow
```

### Expected Output

```
✅ PASS: GET /api/providers (HTTP 200)
�ℹ️   Response contains 5 providers
✅ PASS: GET /api/deployments (HTTP 200)
℺°   Response contains 4 deployments
✅ PASS: POST /api/bids created bid: bid-xxxxx
✅ PASS: POST /api/leases created lease: lease-xxxxx
✅ PASS: Deployment status is ACTIVE

Test Summary
Total Tests Run: 28
✅ Passed: 28
Failed: 0

✅ All tests passed!
```

### What Each Test Checks

**Connectivity Tests:**

- Can reach API at http://localhost:3000
- Can reach AI Agent at http://localhost:3010

**API Tests:**

- GET /api/providers - Returns provider list
- GET /api/deployments - Returns deployment list
- GET /api/leases - Returns lease list
- GET /api/bids - Returns bid list
- GET /api/providers/me/stats - Provider statistics

**Workflow Tests:**

- POST /api/bids - Can create a bid
- POST /api/leases - Can create a lease
- Deployment auto-transitions to ACTIVE
- Provider stats update correctly

**AI Tests:**

- GET /health - Service health
- GET /models - Available models

### Troubleshooting with verify.sh

**Error: Cannot reach API**

```
❌ FAIL: Cannot reach API at http://localhost:3001
⚠️  Make sure the API service is running in Terminal 1
```

_Fix_: Run `./start-services.sh` and wait for Terminal 1 to show "listening" message

**Error: No database data**

```
❌ FAIL: GET /api/providers returned no providers
⚠️  Database may not be seeded
```

_Fix_: Run `cd services/api && pnpm prisma db seed`

**Error: Failed to create bid/lease**

```
❌ FAIL: POST /api/bids failed
```

_Fix_: Check Terminal 1 (API) for error messages, or check PostgreSQL is running with `pg_isready`

### Time Required

- **~10 seconds** for quick test
- **~20 seconds** for API tests
- **~30 seconds** for full suite

---

## Complete Workflow: First Time to Running

### Step 1: Run Initial Setup (one-time)

```bash
./setup.sh
```

Wait for: `✅ Setup Complete!`

### Step 2: Start All Services

```bash
./start-services.sh
```

Wait for: All 4 Terminal windows to show "Ready" messages

### Step 3: Verify Everything Works

```bash
./verify.sh
```

Wait for: `✅ All tests passed!`

### Step 4: Access Applications

Open in browser:

- Main Console: **http://localhost:3000**
- Provider Console: **http://localhost:3002**

**Total time: ~5-7 minutes** ⏱️

---

## Daily Development Workflow

After first-time setup, your daily workflow is:

```bash
# Start of day: Start all services
./start-services.sh

# Develop/test your changes
# Code changes auto-reload in Next.js dev servers
# API changes require restarting: Ctrl+C in Terminal 1, then run 'pnpm build && pnpm start'

# Verify: Run tests if you want
./verify.sh

# End of day: Ctrl+C in all Terminal windows
```

---

## Script Features

### Error Handling

- Scripts exit immediately on errors (using `set -e`)
- Clear error messages tell you exactly what went wrong
- Suggestions provided for common issues

### Colorized Output

- 🟢 **Green** = Success
- 🔴 **Red** = Error
- 🟡 **Yellow** = Warning
- 🔵 **Blue** = Info/Headers

### Prerequisites

- **setup.sh**: Requires Homebrew (for starting PostgreSQL if needed)
- **start-services.sh**: macOS only (uses osascript)
- **verify.sh**: Platform independent (uses curl)

---

## Troubleshooting Scripts

### "Command not found: ./setup.sh"

Make sure scripts are executable:

```bash
chmod +x setup.sh start-services.sh verify.sh
```

### setup.sh fails with "PostgreSQL not running"

Start PostgreSQL manually:

```bash
brew services start postgresql
```

Or install it:

```bash
brew install postgresql@14
```

### start-services.sh opens Terminal windows but they close

Check if services failed to start:

1. Open a Terminal manually
2. Run: `cd services/api && pnpm start`
3. Look for error messages

### verify.sh shows "Cannot reach API"

Make sure Terminal 1 shows this output:

```
listening on http://0.0.0.0:3001
```

If not, check for errors in Terminal 1 and restart it.

---

## Advanced Options

### Environment Variables

Override defaults with environment variables:

```bash
# Use different project root
PROJECT_ROOT=/path/to/comnetish ./setup.sh

# Use different API port (in service terminal)
PORT=3002 pnpm start
```

### Manual Execution of Script Commands

If you want more control, run commands manually:

```bash
# Setup
pnpm install
createdb comnetish_dev
cd services/api && pnpm prisma migrate dev --name init
pnpm prisma db seed

# Services (in separate terminals)
cd services/api && pnpm build && pnpm start          # Terminal 1
cd services/ai-agent && pnpm start                   # Terminal 2
cd apps/console && pnpm dev                          # Terminal 3
cd apps/provider-console && pnpm dev                 # Terminal 4
```

---

## Need Help?

If scripts don't work as expected:

1. **Check prerequisites**: `./setup.sh` (first step will tell you what's missing)
2. **Check logs**: Look at Terminal windows for specific error messages
3. **Read detailed guides**:
   - `QUICK_START.md` - 5 minute overview
   - `LOCAL_SETUP_GUIDE.md` - Comprehensive guide
   - `SETUP_CHECKLIST.md` - Step-by-step checklist

4. **Test manually**: Run commands from scripts manually to see what fails

---

**🎉 Happy developing!**
