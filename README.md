# Comnetish

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-0b5fff?style=for-the-badge)](https://www.apache.org/licenses/LICENSE-2.0)

Comnetish is a decentralized cloud compute marketplace. Tenants describe workloads in SDL, providers bid in real time, containers launch on distributed capacity, and settlement flows through on-chain economics.

This monorepo includes the full product surface: tenant console, provider console, marketing website, REST API, chain client SDK, smart contracts, and an AI agent service.

---

## Architecture

```
┌─────────────────────────┐       ┌─────────────────────────┐
│     apps/console        │──────▶│      services/api        │
│  Tenant deploy/dash     │       │  Bun + Hono + Prisma     │
└─────────────────────────┘       └────────────┬────────────┘
                                               │
┌─────────────────────────┐       ┌────────────▼────────────┐
│  apps/provider-console  │──────▶│  packages/chain-client  │
│  Provider onboarding    │       │  Typed Cosmos SDK client │
└─────────────────────────┘       └────────────┬────────────┘
                                               │
┌─────────────────────────┐       ┌────────────▼────────────┐
│     apps/website        │       │      contracts/         │
│   Astro marketing site  │       │   Hardhat + Solidity    │
└─────────────────────────┘       └─────────────────────────┘
```

---

## Quick Start

### Prerequisites

| Tool                                     | Version | Required for                |
| ---------------------------------------- | ------- | --------------------------- |
| [Bun](https://bun.sh)                    | 1.0+    | API service, AI agent       |
| [Node.js](https://nodejs.org)            | 20+     | Next.js consoles, website   |
| [pnpm](https://pnpm.io)                  | 9+      | Monorepo package management |
| [PostgreSQL](https://www.postgresql.org) | 14+     | API database                |

```bash
bun --version
node -v        # >= 20
pnpm -v        # >= 9
psql --version # >= 14
```

### One-command setup

```bash
git clone https://github.com/<your-org>/comnetish.git
cd comnetish
chmod +x setup.sh
./setup.sh
```

The setup script handles everything: dependency install, database creation, migrations, and seeding.

### Start all services

```bash
./start-services.sh
```

This opens 4 terminal windows, one per service.

| Service          | URL                   | Description                        |
| ---------------- | --------------------- | ---------------------------------- |
| Tenant Console   | http://localhost:3002 | Create and manage deployments      |
| Provider Console | http://localhost:3001 | Register and manage provider nodes |
| API              | http://localhost:3000 | REST API (Hono + Prisma)           |
| AI Agent         | http://localhost:3010 | SDL generation and inference       |
| Website          | http://localhost:4321 | Marketing site (Astro)             |

### Verify everything is running

```bash
./verify.sh
```

---

## Manual Setup (step by step)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
cp services/api/.env.example services/api/.env.local
```

Edit `services/api/.env.local` and set your `DATABASE_URL`:

```env
DATABASE_URL=postgresql://<user>@localhost:5432/comnetish_dev
```

### 3. Create database and run migrations

```bash
createdb comnetish_dev
cd services/api
export DATABASE_URL="postgresql://<user>@localhost:5432/comnetish_dev"
pnpm prisma migrate dev --name init
pnpm prisma db seed
```

### 4. Start services individually

```bash
# Terminal 1 — API (port 3000)
cd services/api && API_PORT=3000 bun run src/index.ts

# Terminal 2 — AI Agent (port 3010)
cd services/ai-agent && pnpm build && pnpm start

# Terminal 3 — Provider Console (port 3001)
cd apps/provider-console && pnpm dev

# Terminal 4 — Tenant Console (port 3002)
cd apps/console && PORT=3002 pnpm dev

# Terminal 5 (optional) — Website (port 4321)
cd apps/website && pnpm dev
```

---

## Multi-Laptop Provider Network

Use this when running a decentralized demo across multiple physical machines.

**Topology:**

- **Your laptop** — API + tenant console
- **Friend's laptop** — provider console pointing at your API

### On your laptop

Start the API bound to all network interfaces:

```bash
cd services/api
API_HOST=0.0.0.0 API_PORT=3000 bun run src/index.ts
```

Find your local IP:

```bash
ipconfig getifaddr en0   # macOS
```

### On your friend's laptop

1. Clone the repo and install dependencies:

```bash
git clone https://github.com/<your-org>/comnetish.git
cd comnetish
pnpm install
```

2. Create `apps/provider-console/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://<YOUR_LAPTOP_IP>:3000
```

3. Start the provider console:

```bash
cd apps/provider-console
pnpm dev
```

4. Open `http://localhost:3001` → click **Register as Provider** → complete the 4-step onboarding.

---

## Smart Contracts

Contracts are in `contracts/` (Hardhat + Solidity).

```bash
# Build and test
pnpm --filter @comnetish/contracts build
pnpm --filter @comnetish/contracts test

# Deploy locally
pnpm --filter @comnetish/contracts run deploy

# Deploy to Sepolia
export SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/<key>"
export PRIVATE_KEY="0x..."
pnpm --filter @comnetish/contracts run deploy:sepolia
```

ABI and address exports are written to `contracts/exports/`.

---

## Blockchain / Chain Setup (Optional)

The `scripts/` directory contains helper scripts to run a local Akash-based chain fork:

```bash
# Clone and build the comnetishd binary, start a local testnet
chmod +x scripts/setup-chain-fork.sh
./scripts/setup-chain-fork.sh

# Set up a local provider daemon with k3s
chmod +x scripts/setup-provider-fork.sh
./scripts/setup-provider-fork.sh
```

> **Note:** This requires Go 1.21+ and Docker. It is not required for running the console apps and API locally.

---

## Environment Variables

All variables are documented in `.env.example`. Key groups:

| Group     | Variables                                                                                   |
| --------- | ------------------------------------------------------------------------------------------- |
| API       | `API_PORT`, `API_HOST`, `API_CORS_ORIGIN`, `DATABASE_URL`                                   |
| Consoles  | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CHAIN_RPC_URL`, `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` |
| AI Agent  | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`                                                      |
| Contracts | `PRIVATE_KEY`, `SEPOLIA_RPC_URL`                                                            |
| Website   | `PUBLIC_SITE_URL`, `PUBLIC_CONSOLE_URL`                                                     |

Never commit populated `.env` files. All `.env.*` files are gitignored by default.

---

## Tech Stack

| Layer             | Technology                                                        |
| ----------------- | ----------------------------------------------------------------- |
| Monorepo          | Turborepo + pnpm workspaces                                       |
| Tenant Console    | Next.js 14, React 18, Tailwind CSS, Framer Motion, TanStack Query |
| Provider Console  | Next.js 14, React 18, RainbowKit, wagmi                           |
| Marketing Website | Astro 4                                                           |
| API               | Bun, Hono, Prisma, Zod, PostgreSQL                                |
| AI Agent          | Bun + TypeScript                                                  |
| Smart Contracts   | Hardhat, Solidity                                                 |
| Chain Integration | Cosmos SDK patterns, `@comnetish/chain-client`                    |
| Shared UI         | `@comnetish/ui` component library                                 |

---

## Demo Checklist

- [ ] `pnpm install` completed
- [ ] `.env` and `services/api/.env.local` configured
- [ ] Database created and migrations run (`prisma migrate dev`)
- [ ] Seed data present (`prisma db seed`)
- [ ] API responding at `http://localhost:3000/api/stats`
- [ ] Tenant console live at `http://localhost:3002`
- [ ] Provider console live at `http://localhost:3001`
- [ ] At least one deployment created and visible in dashboard
- [ ] Provider registered and visible in map

---

## Contributing

1. Fork and create a feature branch.
2. Keep PRs focused — one concern per PR.
3. Run checks before opening a PR:

```bash
pnpm typecheck
pnpm test
pnpm build
```

4. Include screenshots for UI changes.

---

## License

Apache License 2.0 — see [LICENSE](./LICENSE) or https://www.apache.org/licenses/LICENSE-2.0
