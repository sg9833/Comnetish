# Comnetish Website Run Commands

Use this file as the exact command checklist to run the website locally.

## 1) Open project root

```bash
cd /Users/garinesaiajay/projects/Comnetish
```

## 2) Install dependencies (first time only)

```bash
pnpm install
```

## 3) Start everything (recommended)

```bash
chmod +x ./start-services.sh
./start-services.sh
```

This opens 4 terminal windows and starts:

- API service
- AI agent service
- Main console
- Provider console

## 4) Open website URLs

Try these in browser:

- Main console: http://localhost:3000
- Provider console: http://localhost:3002

If ports auto-shift, also try:

- Provider console fallback: http://localhost:3003

## 5) Verify services from terminal

```bash
curl -sS http://localhost:3001/api/providers | head -c 300
curl -sS http://localhost:3010/health
```

## 6) If ports are busy, clear and restart

```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:3002 | xargs kill -9 2>/dev/null || true
lsof -ti:3003 | xargs kill -9 2>/dev/null || true
lsof -ti:3010 | xargs kill -9 2>/dev/null || true

./start-services.sh
```

## 7) Manual start (if you do not want the script)

Run each block in a separate terminal.

### Terminal 1 (API)

```bash
cd /Users/garinesaiajay/projects/Comnetish/services/api
pnpm build
pnpm start
```

### Terminal 2 (AI agent)

```bash
cd /Users/garinesaiajay/projects/Comnetish/services/ai-agent
pnpm start
```

### Terminal 3 (Main console)

```bash
cd /Users/garinesaiajay/projects/Comnetish/apps/console
pnpm dev
```

### Terminal 4 (Provider console)

```bash
cd /Users/garinesaiajay/projects/Comnetish/apps/provider-console
pnpm dev
```
