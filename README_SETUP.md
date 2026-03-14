# 🚀 Comnetish - Your Complete Guide

**Everything you need to know to run Comnetish locally**

---

## 📚 Available Guides

### For the Impatient

📄 **`QUICK_START.md`** (5 minutes)

- Fastest path to running everything
- Just commands, minimal explanation
- Good for: You want to see it running NOW

### For the Methodical

📄 **`SETUP_CHECKLIST.md`** (Follow this while you work)

- Step-by-step checklist format
- Check boxes as you complete each step
- Good for: You like visual progress tracking

### For the Curious

📄 **`LOCAL_SETUP_GUIDE.md`** (Comprehensive - 30+ pages)

- Detailed explanations for every step
- Troubleshooting for common issues
- Architecture explanations
- Good for: You want to understand what's happening

### For Code Review

📄 **`IMPLEMENTATION_COMPLETE.md`**

- Summary of all fixes implemented
- What was changed and why
- Good for: Understanding what was done

---

## 🎯 Which Guide Should I Read?

```
Want to run it in 5 minutes?
  └─> Read: QUICK_START.md

Want visual checklist while setting up?
  └─> Read: SETUP_CHECKLIST.md
      Print it and check off as you go

Want to understand everything?
  └─> Read: LOCAL_SETUP_GUIDE.md
      Keep it open while working

Want to know what we fixed?
  └─> Read: IMPLEMENTATION_COMPLETE.md
```

---

## ⚡ The Super Quick Version

```bash
# 1. Install
pnpm install
createdb comnetish_dev
cd services/api
# Edit .env.local with your DATABASE_URL
pnpm prisma migrate dev --name init
pnpm prisma db seed

# 2. Start 4 services in 4 terminals:
Terminal 1:  cd services/api && pnpm build && pnpm start
Terminal 2:  cd services/ai-agent && pnpm start
Terminal 3:  cd apps/console && pnpm dev
Terminal 4:  cd apps/provider-console && pnpm dev

# 3. Open browser:
http://localhost:3000     # Main console
http://localhost:3002     # Provider console

# 4. Test API:
curl http://localhost:3001/api/providers | jq
```

✅ **Done! Everything is running.**

---

## 📂 Project Structure (What's What)

```
Comnetish/
├── services/
│   ├── api/                 ← REST API (Port 3001)
│   │   └── src/routes/
│   │       ├── bids.ts      ← POST /api/bids endpoint
│   │       ├── leases.ts    ← POST /api/leases endpoint
│   │       └── providers.ts ← Provider endpoints
│   └── ai-agent/            ← AI Service (Port 3010)
│       └── src/index.ts     ← Health, models, inference
│
├── apps/
│   ├── console/             ← Main Console (Port 3000+)
│   │   ├── app/
│   │   │   ├── page.tsx     ← Home page
│   │   │   ├── dashboard/   ← Dashboard page
│   │   │   ├── deployments/ ← Deployments pages
│   │   │   └── deploy/      ← Create deployment page
│   │   └── tailwind.config.ts
│   │
│   └── provider-console/    ← Provider Console (Port 3001+)
│       ├── app/
│       │   ├── page.tsx     ← Dashboard home page
│       │   └── onboard/     ← Provider onboarding
│       ├── globals.css      ← Design system (NEW)
│       ├── tailwind.config.ts ← Theme config (NEW)
│       └── fonts.ts         ← Font setup (NEW)
│
├── packages/
│   ├── ui/                  ← Shared UI components
│   └── types/               ← Shared TypeScript types
│
├── Guides/
│   ├── QUICK_START.md       ← 5 minute version
│   ├── SETUP_CHECKLIST.md   ← Checklist format
│   ├── LOCAL_SETUP_GUIDE.md ← Complete guide
│   ├── IMPLEMENTATION_COMPLETE.md ← What we fixed
│   └── This file
│
└── Documentation/
    ├── CODEBASE_ISSUES.md
    ├── TECHNICAL_FIXES_GUIDE.md
    ├── WORKFLOW_GAPS.md
    └── ISSUES_BY_FILE.md
```

---

## 🎯 What Each Service Does

| Service              | Port  | Purpose                             | Language/Framework    |
| -------------------- | ----- | ----------------------------------- | --------------------- |
| **API**              | 3000  | RESTful backend for all operations  | Hono + Bun + Prisma   |
| **AI Agent**         | 3010  | AI inference endpoints              | Bun                   |
| **Main Console**     | 3000+ | Tenant UI (create deployments, etc) | Next.js + React Query |
| **Provider Console** | 3001+ | Provider UI (manage leases, etc)    | Next.js + React Query |
| **PostgreSQL**       | 5432  | Database                            | PostgreSQL            |

---

## 🔗 Understanding the Flow

```
User Creates Deployment
  ↓
Main Console (http://localhost:3000)
  ├─ Form sends to API
  ├─ API stores in PostgreSQL
  └─ Returns deployment ID

Provider Sees & Submits Bid
  ↓
Provider Console or API
  ├─ Gets deployment list
  ├─ Submits bid via POST /api/bids
  └─ API stores in PostgreSQL

Tenant Reviews & Accepts Bid
  ↓
Main Console Deployment Detail
  ├─ Sees bid list
  ├─ Clicks Accept
  ├─ Calls POST /api/leases
  ├─ API updates deployment → ACTIVE
  └─ Creates lease record

Provider Sees Lease
  ↓
Provider Console Dashboard
  ├─ Calls GET /api/providers/me/leases
  ├─ Shows active leases
  ├─ Displays earnings
  └─ Everything visible in real-time
```

---

## ✅ Verification Checklist

After running everything, verify:

```
✓ Has 5+ providers in database
✓ Has 4+ deployments in database
✓ Has 2+ active leases visible
✓ Main console shows dashboard with data
✓ Provider console shows dashboard with data
✓ API endpoints respond
✓ No errors in any terminal
✓ Styles load correctly
✓ Animations work smoothly
✓ Can navigate between pages
```

---

## 🆘 If Something Doesn't Work

Follow the decision tree:

```
Is API not running?
├─ Yes → Check Terminal 1 for errors
│        cd services/api && pnpm build && pnpm start
└─ No → Continue

Is database empty?
├─ Yes → Seed it:
│        cd services/api && pnpm prisma db seed
└─ No → Continue

Are pages showing no data?
├─ Yes → Check if API returns data:
│        curl http://localhost:3001/api/providers
└─ No → Continue

Do styles look broken?
├─ Yes → Clear cache:
│        cd apps/console && rm -rf .next
│        Restart dev server
└─ No → You're good!
```

**For more troubleshooting**, see `LOCAL_SETUP_GUIDE.md` → Troubleshooting section

---

## 🎓 What Was Actually Fixed?

Before you started, the codebase had 30+ issues:

- ❌ No endpoint to submit bids
- ❌ No endpoint to accept bids
- ❌ Empty provider console
- ❌ Hardcoded wallet addresses
- ❌ Missing CSS styling
- ❌ No seed data
- ... and many more

After our implementation:

- ✅ POST /api/bids endpoint works
- ✅ POST /api/leases endpoint works (with auto-status update)
- ✅ Full provider dashboard implemented
- ✅ Real wallet integration
- ✅ Complete CSS design system
- ✅ Comprehensive seed data
- ✅ All 7 phases complete

**See `IMPLEMENTATION_COMPLETE.md` for full details of everything that was fixed.**

---

## 📞 Command Reference

```bash
# INSTALLATION
cd /Users/garinesaiajay/projects/Comnetish
pnpm install
createdb comnetish_dev
cd services/api
# Edit .env.local
pnpm prisma migrate dev --name init
pnpm prisma db seed

# RUNNING (in 4 separate terminals)
cd services/api && pnpm build && pnpm start           # Terminal 1
cd services/ai-agent && pnpm start                    # Terminal 2
cd apps/console && pnpm dev                           # Terminal 3
cd apps/provider-console && pnpm dev                  # Terminal 4

# TESTING
curl http://localhost:3001/api/providers | jq
curl http://localhost:3010/health | jq

# DATABASE
cd services/api
pnpm prisma studio              # Open GUI browser
pnpm prisma db seed             # Re-seed
pnpm prisma migrate status      # Check status

# CLEARING
kill %1; kill %2; kill %3; kill %4  # Kill all in same terminal
pkill -f "pnpm dev"                 # Kill all dev servers
pkill -f "pnpm start"               # Kill all start servers
```

---

## 🎯 Success Criteria

You'll know everything is working when:

1. ✅ All 4 services show "Ready" or "listening" messages
2. ✅ http://localhost:3000 loads and shows dashboards
3. ✅ http://localhost:3002 loads and shows dashboards
4. ✅ API returns JSON responses
5. ✅ Database has 5 providers, 4 deployments, 2 leases
6. ✅ No red errors in terminals
7. ✅ No console errors in browser DevTools
8. ✅ Can create bid via API and see it in provider console

---

## 📚 Reading Order

1. **Start here** → This file (you are here)
2. **Then** → Choose a setup guide above based on your style
3. **While setting up** → Keep the chosen guide open
4. **If stuck** → Check LOCAL_SETUP_GUIDE.md troubleshooting
5. **When it works** → Check out IMPLEMENTATION_COMPLETE.md to understand what was fixed

---

## 🎉 You're Ready!

Everything is set up. You have:

✅ A fully functional marketplace
✅ Two complete UIs (tenant + provider)
✅ REST API with all endpoints
✅ Real test data seeded
✅ Documentation for everything

**Pick your guide above and start running it!**

---

## 💡 Pro Tips

- Keep all 4 service terminals visible so you can see any errors
- Use `cmd+K` to clear terminal screen frequently
- Open browser DevTools (F12) to see network requests and errors
- Keep `LOCAL_SETUP_GUIDE.md` in another tab for reference
- If stuck, restart the service by pressing Ctrl+C and running the command again

---

**Questions?** Everything is documented. Check the appropriate guide for your situation.

**Ready?** Pick `QUICK_START.md` or `SETUP_CHECKLIST.md` and let's go! 🚀
