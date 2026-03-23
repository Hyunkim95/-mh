# MultiHopper — Technical Documentation

## Overview

MultiHopper is a Solana-based token routing application that enables scheduled, multi-hop token transfers. Users create routes with timed hops, deploy them on-chain, and the system executes transfers at scheduled times. An optional abstraction layer distributes funds through intermediate wallets before deployment.

---

## Tech Stack

### Frontend

| Technology            | Version         | Purpose                                           |
| --------------------- | --------------- | ------------------------------------------------- |
| React                 | 18.2.0 / 19.2.0 | UI framework                                      |
| Vite                  | 5.2.0           | Build tool & dev server                           |
| TanStack Router       | 1.132.41        | File-based routing                                |
| TanStack React Query  | 4.36.1          | Server state management                           |
| Jotai                 | 2.13.1          | Client state (atoms)                              |
| TailwindCSS           | 3.4.0           | Styling                                           |
| Solana Web3.js        | 1.98.4          | Blockchain interaction                            |
| Solana Wallet Adapter | 0.15.35         | Wallet connection (Phantom, Backpack, Magic Eden) |
| react-hot-toast       | 2.6.0           | Notifications                                     |

### Backend

| Technology   | Version | Purpose             |
| ------------ | ------- | ------------------- |
| Fastify      | 5.1.0   | HTTP server         |
| tRPC         | 10.45.2 | Type-safe API layer |
| Drizzle ORM  | 0.29.3  | Database ORM        |
| PostgreSQL   | 15      | Database            |
| @fastify/jwt | 10.0.0  | JWT authentication  |
| Zod          | 3.22.4  | Schema validation   |
| cron         | 4.3.3   | Job scheduling      |

### Blockchain

| Technology        | Version        | Purpose                                               |
| ----------------- | -------------- | ----------------------------------------------------- |
| Anchor            | 0.31.1         | Solana program framework                              |
| @solana/web3.js   | 1.87.6         | RPC interaction                                       |
| @solana/spl-token | 0.3.11 / 0.4.8 | Token operations                                      |
| Token2022         | —              | Token extensions (permanent delegate, transfer hooks) |

### Build & Testing

| Technology             | Version | Purpose                |
| ---------------------- | ------- | ---------------------- |
| Turborepo              | 2.5.5   | Monorepo orchestration |
| TypeScript             | 5.2–5.3 | Type safety            |
| TSUp                   | 8.0.2   | Library bundling       |
| Vitest                 | 4.0.16  | Test runner            |
| @testing-library/react | 16.3.1  | Component testing      |

---

## Monorepo Structure

```
multihopper/
├── apps/
│   ├── web/          # Vite React app (port 5173 dev, nginx in prod)
│   └── api/          # Fastify server (port 3001)
├── libs/
│   ├── client/       # React components, hooks, pages, state
│   ├── server/       # tRPC routers, services, DB schemas, Solana integration
│   ├── shared/       # tRPC client + React Query setup
│   ├── solana-node/  # Solana RPC utilities, token metadata
│   ├── crypto-utils/ # Custodial wallet encryption
│   └── etl/          # ETL cursor framework for blockchain indexing
├── turbo.json
├── docker-compose.yml
├── docker-compose.dev.yml
└── Procfile          # Heroku dyno definitions
```

### Package Relationships

```
apps/web → libs/client → libs/shared
apps/api → libs/server → libs/solana-node → libs/crypto-utils
                        → libs/etl
```

---

## Frontend Architecture

### Entry Point

`apps/web/src/main.tsx` → renders `Root` from `libs/client` with providers:

- tRPC + React Query
- Solana `ConnectionProvider` (RPC from `VITE_RPC_URL`)
- `WalletProvider` (Phantom, Backpack, Magic Eden)
- Toast notifications

### Routing (TanStack Router)

```
/                    → LandingPage (public)
/login               → Login (wallet signature auth)
/my-assets           → MyAssets (protected)
/configure-hops      → ConfigureHops (protected, route creation)
/history             → History (protected)
/token-config/$id    → TokenConfigDetail (protected)
/admin/multihopper   → AdminMultihop (admin)
```

### State Management (Jotai Atoms)

```typescript
selectedAssetAtom; // TokenAsset | null
hopsConfigAtom; // HopConfigItem[] (wallet + delay)
selectedAmountAtom; // number
routeModeAtom; // 'easy' | 'custom'
easyRouteConfigAtom; // { arrivalTime, hopCount, destinationWallet }
```

### Key Hooks

| Hook                     | Purpose                              |
| ------------------------ | ------------------------------------ |
| `useSolanaAuth()`        | JWT login via wallet message signing |
| `useDeploy()`            | Deploy route on-chain                |
| `useObfuscationDeploy()` | Deploy via intermediate wallets      |
| `useSubmitRoute()`       | Save route to database               |
| `useUpdateTokenConfig()` | Update on-chain token config         |
| `useFreshTokenBalance()` | Real-time token balance polling      |
| `useTimezone()`          | UTC/local timezone handling          |

### tRPC Client

- `httpBatchLink` to `/trpc`
- JWT auto-included from `localStorage`
- Retry: none on 401, max 3 otherwise

---

## Backend Architecture

### Fastify Server

- Port: `PORT` env (default 3001)
- Plugins: JWT, CORS (origin: true)
- Max param length: 5000

### tRPC Router Hierarchy

```
appRouter
├── auth              # createMessage, verifyUserWithSignature, me
├── routes            # Route CRUD, deployment, status
├── easyRoutes        # Simplified route creation
├── contract          # Solana program interactions
│   ├── initializeRoute / initializeRouteSol
│   ├── addHops / addHopsBatched
│   ├── updateTokenConfig / updateTokenConfigSOL
│   ├── getTokenConfigSPL / getTokenConfigSOL
│   └── estimateDeploymentCost
├── tokenConfigs      # Token config DB management
├── tokens            # Token metadata retrieval
└── dual-contract-events  # On-chain event monitoring
```

### Authentication Flow

1. Client calls `auth.createMessage()` → receives challenge string
2. Wallet signs the challenge
3. Client calls `auth.verifyUserWithSignature()` → receives JWT (1 day TTL)
4. JWT payload: `{ userId, role, publicKey, expiresIn: "1d" }`

### Procedure Types

| Type                 | Auth Required    | Usage                                |
| -------------------- | ---------------- | ------------------------------------ |
| `publicProcedure`    | No               | Token config reads, contract queries |
| `protectedProcedure` | JWT              | Route CRUD, user data                |
| `adminProcedure`     | JWT + admin role | Token config writes                  |

---

## Database Schema (PostgreSQL + Drizzle ORM)

### Core Tables

**users**

```
id, role, publicKey (Solana address, unique), createdAt, updatedAt
```

**routes**

```
id, routeId (on-chain), name, description, tokenType (SPL|SOL),
tokenMint, tokenSymbol, tokenDecimals, hopAmountTokens, hopAmountRaw,
isEasyRoute, hasObfuscation, creator, status (draft|deploying|deployed|completed|failed),
deployedAt, deploymentTxHash, routeConfigPda, deploymentError, createdAt, updatedAt
```

**hops**

```
id, routeId (FK→routes), hopIndex, recipient (wallet address),
scheduledAt (UTC), executedAt, txHash, error, createdAt, updatedAt
```

**token_configs**

```
id, tokenMint, tokenConfigAddress (on-chain PDA), creator,
minTransferAmount, feeBps, feeTreasury, maxHops,
maxDelaySeconds, timelockSeconds, pairAddress, flatFeeLamports
```

### Abstraction Layer Tables

**obfuscation_sessions**

```
id, routeId (FK→routes, unique), status (pending|funding|aggregating|deploying|completed|failed),
walletXId (FK→custodial_wallets), intermediateCount (5-8),
tokenMint, tokenType, totalAmount, estimatedFeesLamports, actualFeesLamports,
createdAt, startedAt, completedAt, lastError, retryCount, failureCount,
lockedBy (distributed lock), lockedAt
```

**intermediate_wallets**

```
id, sessionId (FK→obfuscation_sessions), custodialWalletId (FK→custodial_wallets),
walletIndex, allocatedAmount (random split),
fundingStatus + fundingTxHash + fundedAt,           # Step 1: User → Intermediate
aggregationStatus + aggregationTxHash + aggregatedAt, # Step 2: Intermediate → Wallet X
cleanupStatus + dustReturnTxHash + ataCloseTxHash,   # Step 3: Cleanup
lastError, failureCount, lastFailureAt, nextRetryAt
```

### Infrastructure Tables

**custodial_wallets** — encrypted server-managed wallets

```
id, address, encryptedPrivateKey, createdAt
```

**contract_transactions** — indexed on-chain transactions

```
id, signature (unique), slot, blockTime, fee, success, error,
programId, transactionData (JSON), processedAt
```

**contract_events** — parsed program events

```
id, transactionId (FK), signature, eventType (HopCompleted|RouteCreated|RouteFinished|TokenConfigCreated),
eventData (JSON), routePda, routeId, creator, hopIndex, processed, processedAt
```

**etl_cursors** — blockchain indexing progress

```
id, cursorKey (unique), value, updatedAt
```

**busy_wallets** — executor wallet tracking

```
id, address, transactionsAmount, isActive, lastUsedAt
```

### Migrations

14 migration files in `libs/server/src/db/migrations/`, managed via `drizzle-kit`.

---

## Solana Integration

### Programs

| Program              | ID                                             | Purpose                             |
| -------------------- | ---------------------------------------------- | ----------------------------------- |
| Multi Hopper Project | `3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh` | Route management, hop execution     |
| Transfer Hook Guard  | `2JEv3pD6nczEvn1xDXaEzehkJofPPjoQQpnW5nGY3r52` | Token2022 transfer hook enforcement |

### PDA Seeds

```
Route config:       ["route", route_id_le_bytes]
Route state:        ["state", route_id_le_bytes]
Permanent delegate: ["delegate", route_id_le_bytes]
Mint authority:     ["mint_authority", route_id_le_bytes]
Vault authority:    ["vault_authority", original_mint]
SOL vault:          ["sol_vault", token_config_creator]
Token config:       ["token_config_global"]
Guard PDA:          ["guard", mint]                    (guard program)
ExtraAccountMetas:  ["extra-account-metas", mint]      (guard program)
```

### Token Types

1. **SPL Tokens** — standard token program
2. **SOL** — native, wrapped as WSOL for program interaction
3. **Token2022** — extended tokens with permanent delegate, metadata pointer, and transfer hook extensions

### Transaction Building Pattern

1. Backend constructs `TransactionInstruction` (via Anchor IDL or manual encoding)
2. Wraps in `Transaction` with dynamic priority fee instructions
3. Serializes with `serialize()` (sets fee payer, no signing) or `signAndSerialize()` (adds executor partial signature)
4. Client deserializes, wallet signs, submits to network

### Executor Wallets

- Deterministic keypair derived from `EXECUTOR_SEED` env var
- Seed derivation: `sha256("${EXECUTOR_SEED}_signer")` → first 32 bytes → `Keypair.fromSeed()`
- Used for: hop execution, abstraction aggregation, server-side signing

### Fee Structure

| Parameter         | Description                   | On-chain field                |
| ----------------- | ----------------------------- | ----------------------------- |
| `feeBps`          | Basis points fee (50 = 0.5%)  | `TokenConfig.feeBps`          |
| `flatFeeLamports` | Fixed SOL fee per transaction | `TokenConfig.flatFeeLamports` |
| `feeTreasury`     | Wallet receiving fees         | `TokenConfig.feeTreasury`     |

---

## Background Jobs

### Hop Scheduler

- **Trigger**: CronJob every 10 seconds
- **Enabled by**: `SCHEDULER_ENABLED=true`
- **Logic**: Fetches hops where `scheduledAt <= now` and `executedAt IS NULL`, calls `executeHop` on-chain
- **Retries**: Max 3 attempts, 5-minute cooldown
- **Completion**: Marks route `completed` when all hops executed

### Abstraction Scheduler

- **Trigger**: CronJob (configurable interval)
- **Enabled by**: `SCHEDULER_ENABLED=true`
- **Logic**: Processes `obfuscation_sessions` through stages:
  1. **Funding**: User signs transactions sending to intermediate wallets
  2. **Aggregation**: Server signs transactions from intermediates → Wallet X
  3. **Deployment**: Wallet X deploys route on-chain
  4. **Cleanup**: Close ATAs, return dust SOL
- **Distributed locking**: `lockedBy` field prevents concurrent processing
- **Retries**: Max 3 attempts, 5-minute cooldown, failure tracking in DB

### Contract Events Indexer

- **Trigger**: Two schedulers (forward + backward)
- **Enabled by**: `DUAL_DIRECTION_ENABLED=true`
- **Logic**: Fetches transactions from Solana RPC, parses program logs for events
- **Events**: `HopCompleted`, `RouteCreated`, `RouteFinished`, `TokenConfigCreated`
- **Persistence**: ETL cursors track indexing progress

---

## Deployment

### Heroku (Production)

```
Procfile:
  web:       node apps/api/dist/index.js           # API server
  scheduler: SCHEDULER_ENABLED=true node apps/api/dist/index.js  # Hop execution
  indexer:   DUAL_DIRECTION_ENABLED=true node apps/api/dist/index.js  # Event indexer
```

All three dynos run the same built API binary, differentiated by environment variables.

### Key Environment Variables

| Variable                 | Purpose                             | Example                                       |
| ------------------------ | ----------------------------------- | --------------------------------------------- |
| `DATABASE_URL`           | PostgreSQL connection string        | `postgres://user:pass@host:5432/db`           |
| `SOLANA_RPC_URL`         | Solana RPC endpoint                 | `https://mainnet.helius-rpc.com/?api-key=...` |
| `EXECUTOR_SEED`          | Deterministic executor keypair seed | (secret)                                      |
| `JWT_SECRET`             | JWT signing key                     | (secret)                                      |
| `PORT`                   | API server port                     | `3001`                                        |
| `VITE_RPC_URL`           | Frontend Solana RPC                 | (same as SOLANA_RPC_URL or separate)          |
| `SCHEDULER_ENABLED`      | Enable hop/abstraction scheduler    | `true` / `false`                              |
| `DUAL_DIRECTION_ENABLED` | Enable contract events indexer      | `true` / `false`                              |

### Docker

- **Production**: `docker-compose.yml` — PostgreSQL + API (multi-stage build) + Web (nginx)
- **Development**: `docker-compose.dev.yml` — PostgreSQL (port 5433) + hot-reload API + Vite dev server

### Frontend Static Hosting

Production web app served via nginx with:

- Reverse proxy `/trpc` → API server
- SPA fallback: all routes → `index.html`

---

## Route Lifecycle

```
1. CREATE         User configures route (hops, amounts, timing)
   │              Saved to DB as status="draft"
   │
2. OBFUSCATE?     If hasObfuscation=true:
   │              → Create obfuscation_session
   │              → Generate 5-8 intermediate wallets
   │              → User funds intermediates (wallet signs)
   │              → Server aggregates to Wallet X
   │
3. DEPLOY         Call initialize_route on Solana
   │              Call add_hops with hop data
   │              Status: draft → deploying → deployed
   │
4. EXECUTE        Scheduler picks up hops at scheduledAt
   │              Calls executeHop on-chain
   │              Each hop: pending → executed
   │
5. COMPLETE       All hops executed
                  Status: deployed → completed
                  Cleanup: close ATAs, return dust (if obfuscated)
```

---

## Testing

- **Framework**: Vitest 4.0.16 with jsdom environment
- **Component tests**: `@testing-library/react` + `@testing-library/jest-dom`
- **Test location**: `libs/client/src/__tests__/`
- **Commands**: `yarn test` (once), `yarn test:watch` (watch mode)
- **Type checking**: `yarn type-check` (all packages via turbo)

---

## Development Commands

```bash
# Development
yarn dev                    # Start all services (turbo)
yarn dev:web               # Web app only (Vite)
yarn dev:api               # API only (Fastify)

# Build
yarn build                 # Build all packages

# Database
yarn db:generate           # Generate Drizzle migrations
yarn db:migrate            # Run migrations
yarn db:studio             # Open Drizzle Studio (GUI)
yarn db:push               # Push schema directly
yarn db:reset              # Reset DB (Docker)
yarn db:seed               # Seed data

# Testing
yarn test                  # Run tests
yarn test:watch            # Watch mode

# Type Checking
yarn type-check            # TypeScript check all packages

# Docker
yarn docker:dev            # Start dev environment
yarn docker:prod           # Start production
yarn docker:down           # Stop containers
```
