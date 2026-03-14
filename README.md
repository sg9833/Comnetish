# Comnetish

[![Build Status](https://img.shields.io/github/actions/workflow/status/comnetish/comnetish/ci.yml?branch=main&style=for-the-badge)](https://github.com/comnetish/comnetish/actions)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-0b5fff?style=for-the-badge)](https://www.apache.org/licenses/LICENSE-2.0)
[![GitHub Stars](https://img.shields.io/github/stars/comnetish/comnetish?style=for-the-badge)](https://github.com/comnetish/comnetish/stargazers)

![Comnetish Hero](./docs/assets/hero.png)

> **Hero image placeholder:** add your product screenshot/GIF to `docs/assets/hero.png` (recommended: 1600×900, dark background, console + provider map visible).

Comnetish is a decentralized cloud compute marketplace that makes multi-provider infrastructure feel as smooth as modern PaaS: tenants describe workloads, providers bid in real time, containers launch on distributed capacity, and settlement flows through transparent on-chain economics. This monorepo includes the full product surface—console apps, marketing site, API services, provider tooling, chain/client SDK, and smart contracts.

## ✨ Core Features

- 🚀 **Intent-based deployment wizard** with AI/manual SDL generation
- 🌍 **Real-time provider topology map** with bid and lease visibility
- 💸 **Transparent price discovery** through provider bidding
- 🧾 **On-chain payment escrow** for trust-minimized settlement
- 🖥️ **Provider onboarding in minutes** (resource detection + wallet registration)
- 🔗 **Typed chain SDK** for transaction and query orchestration
- 🧠 **Bun + Hono API** with Prisma-backed marketplace endpoints
- 🎨 **Premium dark-mode design system** shared across apps

## 🏗️ Architecture

```text
													 ┌──────────────────────────┐
													 │      apps/website        │
													 │    Astro marketing site  │
													 └─────────────┬────────────┘
																				 │
┌──────────────────────────┐             │             ┌──────────────────────────┐
│      apps/console        │─────────────┼────────────▶│      services/api        │
│ Tenant deploy/dashboard  │             │             │ Bun + Hono + Prisma      │
└─────────────┬────────────┘             │             └─────────────┬────────────┘
							│                          │                           │
┌─────────────▼────────────┐             │             ┌─────────────▼────────────┐
│   apps/provider-console  │─────────────┘             │   packages/chain-client   │
│ Provider onboarding/ops  │                           │ Typed Cosmos SDK client    │
└─────────────┬────────────┘                           └─────────────┬────────────┘
							│                                                      │
							│                                   ┌──────────────────▼──────────────────┐
							└──────────────────────────────────▶│       chain + contracts layer        │
																									│ comnetishd fork + Hardhat escrow     │
																									└───────────────────────────────────────┘
```

## ⚡ Quick Start (5 commands)

```bash
git clone https://github.com/comnetish/comnetish.git
cd comnetish
cp .env.example .env
pnpm install
pnpm dev
```

After boot:

- Console: `http://localhost:3000`
- Provider Console: `http://localhost:3002`
- Marketing Website: `http://localhost:4321`
- API: `http://localhost:3001`

## 🧰 Full Local Development Setup

### 1) Prerequisites

Install and verify:

```bash
node -v     # >= 20
pnpm -v
go version  # >= 1.21
docker --version
kubectl version --client
```

Required runtime stack:

- **Node.js 20+**
- **pnpm 9+**
- **Go 1.21+**
- **Docker / Docker Desktop**
- **k3s** (or k3d-backed local cluster)

### 2) Install dependencies and env

```bash
cp .env.example .env
pnpm install
```

### 3) Chain setup (Comnetish local fork)

Use the automated script from this repo root:

```bash
chmod +x scripts/setup-chain-fork.sh
./scripts/setup-chain-fork.sh
```

What it does:

- Clones Akash node fork into `./chain`
- Rebrands binaries and token naming toward Comnetish/CNT
- Builds `comnetishd`
- Initializes single-validator local testnet (`comnetish-1`)
- Creates demo wallets (`tenant1`, `provider1`, `provider2`)
- Starts node in background and writes logs/PID

### 4) Provider setup (local daemon + health)

```bash
chmod +x scripts/setup-provider-fork.sh
./scripts/setup-provider-fork.sh
cd provider && docker compose up -d
```

What it generates:

- `provider/config.yaml`
- `provider/docker-compose.yml`
- macOS helper: `provider/scripts/setup-k3s-macos.sh`
- Windows helper doc: `provider/scripts/WSL2-K3S-INSTRUCTIONS.md`

### 5) Run console + API

All services:

```bash
pnpm dev
```

Targeted startup:

```bash
pnpm --filter @comnetish/api dev
pnpm --filter @comnetish/console dev
pnpm --filter @comnetish/provider-console dev
pnpm --filter @comnetish/website dev
```

### 6) Environment variables guide

All baseline variables are documented in `.env.example`. Key groups:

- **Global**: `NODE_ENV`, `COMNETISH_NETWORK`
- **Console apps**: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CHAIN_RPC_URL`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`
- **Website**: `PUBLIC_SITE_URL`, `PUBLIC_CONSOLE_URL`, `PUBLIC_PROVIDER_CONSOLE_URL`
- **API**: `API_PORT`, `API_CORS_ORIGIN`, `DATABASE_URL`, `REDIS_URL`
- **AI agent**: `OPENAI_API_KEY`, `OPENAI_MODEL`
- **Contracts**: `PRIVATE_KEY`, `ETH_RPC_URL`, `SEPOLIA_RPC_URL`

> Recommendation: never commit populated secrets; keep local `.env` untracked.

## 🖧 Multi-Laptop Provider Network Setup

Use this when demoing a decentralized fleet across multiple physical machines.

### Topology

- **Laptop A**: chain + API + tenant console
- **Laptop B/C/...**: provider stack (k3s + provider daemon)

### Steps

1. On Laptop A, run chain setup and expose reachable RPC (`26657`) and API (`3001`) on LAN.
2. On each provider laptop, run provider setup script.
3. Update each provider `config.yaml` to point `chain.node` to Laptop A IP:

```yaml
chain:
	id: comnetish-1
	node: http://192.168.1.10:26657
```

4. Start provider daemon stack on each provider laptop:

```bash
docker compose up -d
```

5. Verify heartbeat from each provider:

```bash
curl http://localhost:8080/health
```

6. Open provider map in console and confirm all nodes appear.

## 🔐 Smart Contract Deployment Guide

Contracts package: `contracts/` (Hardhat + Solidity)

### Local deployment

```bash
pnpm --filter @comnetish/contracts dev
pnpm --filter @comnetish/contracts build
pnpm --filter @comnetish/contracts test
pnpm --filter @comnetish/contracts run deploy
pnpm --filter @comnetish/contracts run seed
```

Generated artifacts:

- ABI exports: `contracts/exports/abi/*`
- Address exports: `contracts/exports/addresses/hardhat.json`

### Sepolia deployment

Set env values:

```bash
export SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/<key>"
export PRIVATE_KEY="0x..."
```

Deploy + seed:

```bash
pnpm --filter @comnetish/contracts run deploy:sepolia
pnpm --filter @comnetish/contracts run seed:sepolia
```

## 🎤 Demo Setup Checklist (Hackathon Presenters)

- [ ] `pnpm install` completed with no lockfile drift
- [ ] `.env` copied and required keys present
- [ ] Chain script run successfully (`scripts/setup-chain-fork.sh`)
- [ ] Provider script run successfully (`scripts/setup-provider-fork.sh`)
- [ ] Provider health endpoint returns 200 (`:8080/health`)
- [ ] API live (`http://localhost:3001/api/stats`)
- [ ] Console live (`http://localhost:3000`) and wallet connect working
- [ ] At least one deployment created and visible in dashboard
- [ ] Contracts deployed and exports generated in `contracts/exports`
- [ ] Backup demo recording ready in case of network instability

## 🧪 Tech Stack

| Layer                  | Technology                                                    |
| ---------------------- | ------------------------------------------------------------- |
| Monorepo orchestration | Turborepo + pnpm workspaces                                   |
| Tenant Console         | Next.js 14, React 18, Tailwind, Framer Motion, TanStack Query |
| Provider Console       | Next.js 14, React 18, RainbowKit, wagmi                       |
| Marketing Website      | Astro 4                                                       |
| API Services           | Bun, Hono, Prisma, Zod                                        |
| AI Agent               | Bun + TypeScript                                              |
| Smart Contracts        | Hardhat, Solidity                                             |
| Chain Integration      | Cosmos SDK patterns + custom `@comnetish/chain-client`        |
| Shared UI              | `@comnetish/ui` component package                             |
| Data Layer             | PostgreSQL, Redis                                             |
| Container Runtime      | Docker, k3s/Kubernetes                                        |

## 🤝 Contributing

We welcome serious contributors and collaborators.

1. Fork and create a feature branch.
2. Keep PR scope focused and production-quality.
3. Run checks before opening PR:

```bash
pnpm typecheck
pnpm test
pnpm build
```

4. Include clear reproduction notes and screenshots for UI changes.
5. Prefer incremental PRs over large unreviewable drops.

## 📄 License

Comnetish is licensed under the **Apache License 2.0**.

See: https://www.apache.org/licenses/LICENSE-2.0
