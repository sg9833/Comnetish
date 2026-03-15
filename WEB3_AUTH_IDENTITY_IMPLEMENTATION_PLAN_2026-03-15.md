# Comnetish Web3 + Identity Implementation Plan

Date: 2026-03-15

## Goal

Build a production-grade identity, authentication, and authorization system for Comnetish that supports:

- Web3 wallet authentication
- Web2 email/password signup and login
- Email verification
- Google signup/login
- JWT-based access control
- Refresh tokens and session management
- Password hashing with bcrypt
- Role-based authorization
- Provider and tenant ownership enforcement
- Secure account linking between wallets and Web2 identities

This plan is based on a repo scan of the current codebase, not on a hypothetical greenfield architecture.

## Executive Summary

The current codebase already has real wallet connectivity and a partial provider-only challenge/response session flow, but it does not have a unified user identity model.

What exists today:

- Real wallet connectivity in both consoles via wagmi/RainbowKit
- A provider-only wallet signature challenge flow in the API
- A custom HMAC-signed JWT-like token for provider dashboard sessions
- Provider-specific protected routes like `/api/providers/me`

What is missing today:

- No `User` or `Account` model in the database
- No email/password accounts
- No email verification flow
- No Google OAuth/OIDC integration
- No tenant authentication
- No tenant ownership enforcement on deployments
- No refresh tokens
- No revocation model
- No durable challenge storage
- No authorization layer across deployments, bids, and leases

The correct direction is a unified identity system with one user record that can authenticate through email/password, Google, and linked wallets. Web3 should not live as an isolated provider-only mechanism.

## Current State Scan

### 1. What Already Exists and Is Real

#### Wallet integration in consoles

- `apps/console/app/deploy/page.tsx`
  - Uses wagmi and RainbowKit.
  - Uses `useAccount()` and `useBalance()`.
  - Uses connected wallet address as `tenantAddress` in deployment creation.

- `apps/provider-console/app/providers.tsx`
  - Configures wagmi/RainbowKit provider state.
  - Uses injected wallet flow only.

- `apps/provider-console/app/page.tsx`
  - Signs a challenge message.
  - Exchanges that signature for a provider session.
  - Sends bearer token to `/api/providers/me*` routes.

#### Provider session flow in API

- `services/api/src/routes/providers.ts`
  - Has `/api/providers/auth/challenge`.
  - Has `/api/providers/auth/verify`.
  - Issues provider session token.
  - Protects `/api/providers/me` and `/api/providers/me` patch flow.

- `services/api/src/lib/provider-auth.ts`
  - Implements challenge message generation.
  - Implements HMAC token signing and verification.
  - Reads bearer token.

#### Existing domain models

- `services/api/prisma/schema.prisma`
  - Has `Provider`, `Deployment`, `Lease`, `Bid`, `Transaction`, `WaitlistEntry`.
  - `Deployment` stores `tenantAddress` as a raw string.
  - `Provider` stores `address` as a raw string.

### 2. What Is Stubbed, Weak, or Local-Only

#### No unified identity layer

- No `User` model
- No `Session` model
- No `RefreshToken` model
- No `LinkedWallet` model
- No `EmailVerificationToken` model
- No `PasswordResetToken` model

#### Tenant auth is effectively absent

- `services/api/src/routes/deployments.ts`
  - Accepts any `tenantAddress` string on create.
  - Allows close of any deployment by ID with no ownership check.

#### Provider auth is partial

- `services/api/src/lib/provider-auth.ts`
  - Challenges are stored in an in-memory `Map`.
  - This is not restart-safe and not horizontally scalable.
  - Session tokens are not persisted or revocable.

#### Client auth state is weak

- `apps/provider-console/app/page.tsx`
  - Holds provider session only in React state.
  - Falls back to `localStorage` to guess whether wallet was registered before.

- `apps/provider-console/app/onboard/page.tsx`
  - Writes registration marker to `localStorage`.

#### No Web2 auth stack exists

- No Google login infrastructure
- No SMTP/email provider integration
- No bcrypt usage
- No password-based login/signup routes
- No email verification routes
- No forgot-password flow

#### Authorization is missing in core market routes

- `services/api/src/routes/deployments.ts`
- `services/api/src/routes/bids.ts`
- `services/api/src/routes/leases.ts`

These currently trust input identifiers rather than authenticated principals.

## Main Problems to Solve

### Problem 1: Identity is fragmented

Today, provider identity is partly wallet-based, tenant identity is just a string, and there is no first-class account model.

### Problem 2: Web3 integration is not standardized

The provider auth flow uses a custom signed message format rather than a standard such as SIWE for EVM wallets.

### Problem 3: Web2 auth does not exist

There is no email/password or Google OAuth path, so the product cannot support account recovery, verified user communications, or non-wallet-native users.

### Problem 4: Authorization is insufficient

Core business objects like deployments, bids, and leases are not consistently protected by ownership and role checks.

## Recommended Target Architecture

## Identity Model

Use one primary `User` entity with related authentication and profile tables.

Recommended model:

- `User`
  - Core identity
  - Roles and lifecycle flags
- `AuthIdentity`
  - Email/password identity
  - Google identity
  - Wallet identity link metadata
- `LinkedWallet`
  - One or more wallets per user
- `Session`
  - Access/refresh session metadata
- `RefreshToken`
  - Rotating refresh tokens, stored hashed
- `EmailVerificationToken`
  - One-time verification tokens
- `PasswordResetToken`
  - One-time reset tokens
- `ProviderProfile`
  - Provider-specific metadata
- `TenantProfile`
  - Tenant-specific metadata

### Recommended User Roles

- `TENANT`
- `PROVIDER`
- `ADMIN`

Allow one user to have multiple roles in the long term, even if MVP uses a primary role flag.

## Authentication Strategy

### Web2 login

- Email/password signup and login
- Passwords hashed with bcrypt
- Email verification required before elevated actions
- Forgot-password and password reset
- Google login via OAuth 2.0 / OpenID Connect

### Web3 login

- EVM wallet sign-in using SIWE-style challenge messages
- Wallet login can either:
  - create a new user account, or
  - attach to an existing logged-in user account

### Sessions

- Short-lived access JWT
- Long-lived rotating refresh token
- Store refresh token hashes in DB
- Prefer HttpOnly secure cookies for browser apps
- Allow bearer-token mode for selected service-to-service or CLI integrations

### Authorization

- API middleware resolves authenticated user
- API middleware enforces role and ownership
- Every protected route must operate on authenticated principal, not raw user-supplied IDs alone

## Recommended Technology Choices

### API/Auth libraries

- `jose` for standards-compliant JWT signing/verification
- `bcryptjs` or `bcrypt`
  - Preferred for this repo: `bcryptjs` if portability with Bun is prioritized
  - If strict bcrypt native dependency is acceptable, use `bcrypt`
- Google OAuth via OpenID Connect against Google Identity
- Email delivery via Resend or SMTP provider

Why `jose`:

- Current custom JWT implementation works only for the provider path.
- `jose` gives stronger standards compliance, validation, future key rotation support, and cleaner token handling.

Why bcrypt:

- The request explicitly calls for bcrypt.
- It is appropriate for password hashing in this stack.

### Email provider

Recommended first choice:

- Resend

Fallback:

- SMTP with Nodemailer

## Recommended Database Changes

Add these Prisma models to `services/api/prisma/schema.prisma`.

### Core identity tables

```prisma
model User {
  id                String   @id @default(cuid())
  email             String?  @unique
  emailVerifiedAt   DateTime?
  passwordHash      String?
  displayName       String?
  avatarUrl         String?
  primaryRole       UserRole @default(TENANT)
  status            UserStatus @default(ACTIVE)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  wallets           LinkedWallet[]
  sessions          Session[]
  providerProfile   ProviderProfile?
  tenantProfile     TenantProfile?
  oauthAccounts     OAuthAccount[]
}

enum UserRole {
  TENANT
  PROVIDER
  ADMIN
}

enum UserStatus {
  ACTIVE
  PENDING_VERIFICATION
  SUSPENDED
  DELETED
}
```

### Wallet linkage

```prisma
model LinkedWallet {
  id             String      @id @default(cuid())
  userId         String
  chainType      WalletChainType
  address        String
  isPrimary      Boolean     @default(false)
  verifiedAt     DateTime?
  createdAt      DateTime    @default(now())

  user           User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([chainType, address])
  @@index([userId])
}

enum WalletChainType {
  EVM
  COSMOS
}
```

### OAuth identities

```prisma
model OAuthAccount {
  id                    String   @id @default(cuid())
  userId                String
  provider              String
  providerAccountId     String
  email                 String?
  createdAt             DateTime @default(now())

  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}
```

### Sessions and refresh tokens

```prisma
model Session {
  id                String   @id @default(cuid())
  userId            String
  refreshTokenHash  String
  userAgent         String?
  ipAddress         String?
  expiresAt         DateTime
  revokedAt         DateTime?
  createdAt         DateTime @default(now())

  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

### Verification and recovery tokens

```prisma
model EmailVerificationToken {
  id         String   @id @default(cuid())
  userId      String
  tokenHash   String
  expiresAt   DateTime
  usedAt      DateTime?
  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model PasswordResetToken {
  id         String   @id @default(cuid())
  userId      String
  tokenHash   String
  expiresAt   DateTime
  usedAt      DateTime?
  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### Role-specific profiles

```prisma
model ProviderProfile {
  id              String   @id @default(cuid())
  userId          String   @unique
  providerId      String?  @unique
  onboardingState String   @default("PENDING")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model TenantProfile {
  id              String   @id @default(cuid())
  userId          String   @unique
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

## Existing Domain Model Refactor Plan

### Provider

Current model:

- `Provider.address` is the main identity anchor.

Target:

- Keep `Provider.address` for chain-level compatibility.
- Add `userId` relation so provider ownership is explicit.

### Deployment

Current model:

- `Deployment.tenantAddress` is just a string.

Target:

- Add `userId` relation.
- Keep `tenantAddress` as the linked primary wallet for on-chain flows.

This lets the system enforce ownership by user while still preserving wallet identity for chain operations.

## API Plan

## New Authentication Routes

Add a new route group, for example:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `POST /api/auth/google/start`
- `GET /api/auth/google/callback`
- `POST /api/auth/email/verify/request`
- `POST /api/auth/email/verify/confirm`
- `POST /api/auth/password/forgot`
- `POST /api/auth/password/reset`
- `GET /api/auth/me`

## Wallet Auth Routes

Unify wallet auth under general auth routes rather than provider-only routes.

Recommended:

- `POST /api/auth/wallet/challenge`
- `POST /api/auth/wallet/verify`
- `POST /api/auth/wallet/link`
- `POST /api/auth/wallet/unlink`

For EVM wallets, use SIWE-compatible message construction.

## Provider Auth Refactor

Current provider auth in:

- `services/api/src/routes/providers.ts`
- `services/api/src/lib/provider-auth.ts`

Plan:

- Keep current flow temporarily for migration.
- Replace custom in-memory challenge storage with DB-backed challenge records.
- Fold provider auth into unified auth service.
- Replace custom token code with shared JWT/session utilities.

## Authorization Middleware Plan

Add shared middleware layers:

- `requireAuth`
- `requireVerifiedEmail`
- `requireRole('PROVIDER')`
- `requireRole('TENANT')`
- `requireDeploymentOwner`
- `requireProviderOwner`

### Specific route enforcement

#### `services/api/src/routes/deployments.ts`

Current problems:

- Anyone can create a deployment for any address.
- Anyone can close any deployment by ID.

Target enforcement:

- `POST /deployments`
  - authenticated tenant only
  - derive user from session
  - derive wallet from linked wallet or require linked wallet
- `POST /deployments/:id/close`
  - tenant owner or admin only

#### `services/api/src/routes/bids.ts`

Current problems:

- Caller can submit any `providerId`.

Target enforcement:

- authenticated provider only
- provider identity must match session-bound provider profile
- no raw provider ID from client for ownership decisions

#### `services/api/src/routes/leases.ts`

Current problems:

- Lease creation trusts supplied IDs.

Target enforcement:

- authenticated tenant or marketplace orchestration role only
- verify winning bid belongs to selected provider
- ensure deployment belongs to current tenant

## Frontend Plan

## Tenant Console Plan

Primary files:

- `apps/console/app/deploy/page.tsx`

Current state:

- Connects wallet in frontend.
- Sends `tenantAddress` directly.
- No backend session.

Target state:

- Add account entry flow:
  - Sign up with email/password
  - Sign in with Google
  - Optional wallet connect/link
- For deployment actions:
  - require authenticated tenant session
  - require linked wallet for on-chain payment operations
  - backend derives tenant identity from session, not from arbitrary input string

Recommended UI additions:

- `/login`
- `/signup`
- `/verify-email`
- `/forgot-password`
- `/reset-password`
- `/settings/security`
- wallet linking panel in user settings

## Provider Console Plan

Primary files:

- `apps/provider-console/app/page.tsx`
- `apps/provider-console/app/onboard/page.tsx`

Current state:

- Signs provider challenge.
- Stores bearer token in component state.
- Uses `localStorage` registration flag as fallback.

Target state:

- Provider signs in through unified auth system.
- Provider account can be created using:
  - email/password + verify email + link wallet, or
  - Google login + link wallet, or
  - wallet-first signup with optional later email attachment
- Remove `localStorage` registration heuristic.
- Replace with authoritative backend provider profile and onboarding state.

Recommended provider-specific rules:

- provider actions require:
  - authenticated account
  - linked verified wallet
  - provider role
  - completed onboarding state for production actions

## Website Plan

Primary opportunity:

- Convert waitlist into verified product signup funnel later.

Not Phase 1, but keep plan ready for:

- sign-up CTA from landing page
- email capture merging with user signup flow

## Session and Token Design

### Access token

- JWT signed with `jose`
- 15 minutes expiry
- claims:
  - `sub`
  - `role`
  - `email_verified`
  - `wallet_linked`
  - `provider_profile_id` or `tenant_profile_id` where relevant

### Refresh token

- 30 days expiry
- random opaque token
- only store hash in DB
- rotate on every refresh
- revoke all sessions on password reset or suspicious activity

### Storage

Preferred for browser apps:

- HttpOnly secure cookies

Reason:

- avoids `localStorage` token theft via XSS
- better fit for multi-page browser flows

Frontend fetch changes:

- use `credentials: 'include'` where cookie-based auth is used

## Email Verification Plan

### Signup flow

1. User signs up with email and password.
2. Password is hashed with bcrypt.
3. User status starts as `PENDING_VERIFICATION`.
4. Verification token is created and emailed.
5. User opens verification link.
6. Token is validated and marked used.
7. `emailVerifiedAt` is set.

### Google flow

1. User completes Google OAuth.
2. If Google email is verified, treat email as verified.
3. Create or attach `OAuthAccount`.
4. Issue normal session.

## Wallet Linking Plan

### Why wallet linking matters

Comnetish is Web3-native in operations, but user identity should not depend only on a wallet.

Wallet linking lets users:

- recover account via email/Google
- keep stable account history if they rotate wallets
- use Web2 identity for notifications and admin workflows
- still sign chain-sensitive actions with wallet proof

### Wallet link flow

1. Logged-in user requests wallet-link challenge.
2. API creates SIWE-style challenge.
3. User signs with wallet.
4. API verifies signature.
5. Wallet is attached to that user if not already linked.
6. Optionally mark as primary wallet.

### Provider-specific rule

Provider registration and provider dashboard access should require a linked wallet that matches the registered provider identity.

## Recommended Security Controls

## Required in Phase 1

- bcrypt password hashing
- JWT with `jose`
- refresh token rotation
- DB-backed auth challenges
- email verification
- CSRF protection for cookie-auth POST routes
- rate limiting on:
  - signup
  - login
  - password reset
  - wallet challenge
  - wallet verify
- request audit logs for auth events
- token revocation on logout/password reset
- remove all `localStorage` auth assumptions

## Recommended soon after Phase 1

- account lockout / soft throttling after repeated failures
- suspicious login detection
- admin session revocation tools
- optional 2FA for admin users

## Environment Variable Plan

Add these to `.env.example` and deployment secrets:

### Core auth

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `AUTH_COOKIE_DOMAIN`
- `AUTH_COOKIE_SECURE`
- `AUTH_BASE_URL`

### Google OAuth

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

### Email

- `EMAIL_FROM`
- `RESEND_API_KEY` or SMTP settings

### Web3 auth

- `SIWE_DOMAIN`
- `SIWE_URI`
- `SIWE_CHAIN_ID`

## Implementation Phases

## Phase 0: Foundation and schema

Scope:

- Add identity/session/token tables
- Add user relations to provider and deployment models
- Add shared auth utility module
- Add migration scripts

Outputs:

- New Prisma schema
- Prisma migration
- Shared auth types

## Phase 1: Web2 auth

Scope:

- Signup/login/logout
- bcrypt password hashing
- access + refresh token issuance
- email verification
- forgot/reset password

Outputs:

- `/api/auth/*` core routes
- email provider integration
- auth cookies

## Phase 2: Google auth

Scope:

- Google OAuth/OIDC callback flow
- account creation or linking

Outputs:

- Google auth routes
- OAuth account storage

## Phase 3: Wallet auth and linking

Scope:

- SIWE-style challenge verification
- linked wallet management
- replace custom provider auth with unified wallet auth

Outputs:

- `/api/auth/wallet/*`
- linked wallet UI

## Phase 4: Authorization hardening

Scope:

- protect deployments, bids, leases, provider `/me` flows
- enforce owner/role checks everywhere

Outputs:

- new auth middleware
- route-by-route authorization checks

## Phase 5: Console integration

Scope:

- add login/signup/settings flows to tenant console
- replace direct unauthenticated deployment calls
- remove provider localStorage registration logic

Outputs:

- new pages and auth hooks in both consoles

## Phase 6: Security, testing, and rollout

Scope:

- rate limits
- audit logs
- session revocation
- integration tests
- staged rollout

## Testing Plan

## API tests

- signup success/failure
- login success/failure
- email verify success/expired/reused token
- password reset success/expired/reused token
- Google callback create/link cases
- wallet challenge and verify success/failure
- refresh token rotation
- logout and revocation
- deployment create/close ownership enforcement
- provider-only route enforcement
- bid/lease authorization

## Frontend tests

- signup/login forms
- auth error handling
- protected route redirects
- provider onboarding with linked wallet
- wallet link/unlink flows

## Security tests

- replay attempt on wallet challenge
- expired token behavior
- revoked refresh token behavior
- unauthorized route access
- CSRF behavior where cookie auth is used

## File-Level Change Plan

### API

- `services/api/prisma/schema.prisma`
  - add identity/session/token tables
  - add relations from deployments/providers

- `services/api/src/config/env.ts`
  - add auth, email, Google env vars

- `services/api/src/routes/providers.ts`
  - migrate to unified auth
  - remove provider-specific custom session logic over time

- `services/api/src/routes/deployments.ts`
  - require tenant auth and ownership enforcement

- `services/api/src/routes/bids.ts`
  - require provider auth and ownership enforcement

- `services/api/src/routes/leases.ts`
  - enforce authorized lease creation and settlement flow

- Add new files likely under:
  - `services/api/src/routes/auth.ts`
  - `services/api/src/lib/auth/`
  - `services/api/src/middleware/auth/`
  - `services/api/src/lib/email/`

### Tenant console

- `apps/console/app/deploy/page.tsx`
  - stop trusting raw `tenantAddress`
  - integrate authenticated user session
  - require linked wallet for chain actions

- Add likely pages:
  - `apps/console/app/login/page.tsx`
  - `apps/console/app/signup/page.tsx`
  - `apps/console/app/verify-email/page.tsx`
  - `apps/console/app/forgot-password/page.tsx`
  - `apps/console/app/reset-password/page.tsx`
  - `apps/console/app/settings/security/page.tsx`

### Provider console

- `apps/provider-console/app/page.tsx`
  - remove `localStorage` fallback registration assumptions
  - use unified auth/session hook

- `apps/provider-console/app/onboard/page.tsx`
  - tie onboarding to authenticated provider profile state

- Add likely shared auth modules:
  - `apps/provider-console/lib/auth.ts`
  - `apps/console/lib/auth.ts`

## Migration and Rollout Strategy

### Migration principle

Do not break current wallet-based provider flows immediately.

Recommended rollout:

1. Add new identity schema without removing old fields.
2. Backfill provider users from existing providers.
3. Add tenant users for newly authenticated tenants going forward.
4. Introduce new auth routes.
5. Migrate provider console to unified auth.
6. Migrate tenant console to unified auth.
7. Lock down old unauthenticated paths.

### Backfill plan

For existing providers:

- Create one `User` per provider address.
- Create `LinkedWallet` entries from existing `Provider.address`.
- Create `ProviderProfile` records.

For deployments:

- Existing deployments can keep `tenantAddress`.
- New deployments should also store `userId`.
- Optional future migration can try matching tenant wallet addresses to linked users.

## Acceptance Criteria

The implementation should be considered complete when all of the following are true:

- Users can sign up with email/password.
- Passwords are stored hashed with bcrypt.
- Users receive and complete email verification.
- Users can sign in with Google.
- Users can sign in or link an EVM wallet via signature.
- Provider dashboard access requires authenticated provider session, not localStorage heuristics.
- Tenant deployment creation is tied to authenticated tenant identity.
- Deployment close is owner-protected.
- Bid and lease actions are role- and ownership-protected.
- Sessions support refresh and revocation.
- Auth challenges are persisted in DB, not memory.
- JWT handling is standardized and test-covered.

## Immediate Recommendation

Start with the backend foundation before any frontend auth screens.

Best first build order:

1. Prisma identity schema and migration
2. Shared auth library (`jose` + bcrypt)
3. Core `/api/auth` routes
4. Wallet challenge/link routes
5. Route authorization middleware
6. Provider console migration
7. Tenant console migration

That order reduces rework and avoids building UI on top of unstable auth primitives.
