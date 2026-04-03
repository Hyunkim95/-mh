# MultiHopper — Technical Documentation

## Overview

MultiHopper is a Solana-based token routing application that enables scheduled, multi-hop token transfers. Users create routes with timed hops, deploy them on-chain, and the system executes transfers at scheduled times. An optional abstraction layer distributes funds through intermediate wallets before deployment.

---

## Local Development

### Prerequisites

- Node.js 20+
- Yarn 4
- Docker Desktop

Enable Corepack so the pinned Yarn version is available:

```bash
corepack enable
```

### 1. Create your local env

Start from the example file:

```bash
cp env.example .env
```

Check what is still missing:

```bash
yarn env:check:local
```

Generate the values that can be safely generated locally:

```bash
yarn env:generate:local
```

Or append generated values directly into `.env`:

```bash
yarn env:generate:local:write
```

The helper script will generate these when missing:

- `EXECUTOR_SEED`
- `SIGNER_PRIVATE_KEY`
- `JWT_SECRET`

These still need to be supplied manually:

- `HELIUS_API`

The local dev stack uses these devnet defaults:

- `SOLANA_RPC_URL=https://api.devnet.solana.com`
- `VITE_RPC_URL=https://api.devnet.solana.com`

Frontend API requests are same-origin by default:

- browser/client uses `/trpc`
- Vite proxies `/trpc` to `http://localhost:3001` in development
- static hosting should proxy `/trpc` to the API origin

Important notes:

- `SIGNER_PRIVATE_KEY` must be a base58-encoded Solana secret key
- if you change `.env`, restart the affected Docker services so they pick up the new values

### 2. Start the dev stack

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

In a separate terminal, run the shared workspace watchers once:

```bash
yarn dev:libs
```

The dev stack runs as separate processes:

- `api-dev`: HTTP API on `http://localhost:3001`
- `scheduler-dev`: hop + obfuscation schedulers
- `indexer-dev`: contract events / ETL worker
- `web-dev`: frontend on `http://localhost:5173`
- `postgres-dev`: Postgres on `localhost:5433`

The web app no longer needs a separate `VITE_API_URL` for normal local development.
If you need to point Vite at a different backend during local work, set:

- `VITE_DEV_API_PROXY_TARGET=http://localhost:3001`

Useful checks:

```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs api-dev --tail=200
docker compose -f docker-compose.dev.yml logs scheduler-dev --tail=200
docker compose -f docker-compose.dev.yml logs indexer-dev --tail=200
```

### 3. Live reload behavior

Frontend edits refresh from mounted source:

- `apps/`
- `libs/`

Backend behavior:

- `apps/api/src` changes reload the API
- `libs/server/src` changes rebuild `libs/server/dist`, which the API consumes

### 4. Seed local data

Seed the dev Postgres database:

```bash
NODE_ENV=development \
DATABASE_URL=postgresql://trpc_user:trpc_password@localhost:5433/trpc_dev \
yarn workspace @trpc-template/server db:seed
```

### 5. Reset the local database

If you need a clean local DB:

```bash
docker compose -f docker-compose.dev.yml exec postgres-dev \
  psql -U trpc_user -d trpc_dev -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

docker compose -f docker-compose.dev.yml exec api-dev sh -lc \
  'cd /app && DATABASE_URL=postgresql://trpc_user:trpc_password@postgres-dev:5432/trpc_dev yarn workspace @trpc-template/server db:push'
```

### 6. Mint a devnet SPL token with metadata

Use the signer from `SIGNER_PRIVATE_KEY` to create a fungible SPL token on devnet, attach Metaplex metadata, and mint an initial supply to a target wallet:

```bash
SIGNER_PRIVATE_KEY=YOUR_BASE58_SECRET_KEY \
yarn create:devnet-spl-token \
  --name "Multihopper Dev Token" \
  --symbol MDEV \
  --amount 1000 \
  --decimals 6 \
  --recipient YOUR_WALLET_ADDRESS
```

Optional flags:

- `--uri https://your-domain/token.json` to point metadata at a real token JSON
- `--rpc https://api.devnet.solana.com` to override the RPC explicitly

Notes:

- the signer wallet must have enough devnet SOL to pay for mint creation, metadata creation, and the initial mint
- the default metadata URI is `https://example.com/devnet-token.json`, which is fine for testing but will not show rich token details in most wallets

### 7. Create a SOL route locally

Use this flow to validate the basic easy-route path on devnet after the stack is running.

1. Open `http://localhost:5173`
2. Connect a wallet with devnet SOL
3. Sign in when prompted
4. Go to `/configure-hops`
5. Choose `SOL`
6. Enter the destination wallet, hop count, and amount
7. Create the route and confirm the wallet transactions
8. Watch the route move through draft, deployed, and completed states in the app

Notes:

- the connected wallet needs enough devnet SOL for the route amount and obfuscation overhead
- the frontend talks to the API through the Vite `/trpc` proxy in local development, so you do not need to set `VITE_API_URL` for the normal local flow

### 8. Create an SPL route locally

Use this flow when you want to test token routing instead of native SOL.

1. Mint a devnet SPL token first using the command in the previous section
2. Make sure the destination wallet can receive the token
3. Open `http://localhost:5173`
4. Connect the wallet that holds the minted token and enough devnet SOL for fees
5. Sign in when prompted
6. Go to `/configure-hops`
7. Choose the SPL token
8. If the token does not appear in the selector yet, use the manual mint input path and paste the mint address
9. Enter the destination wallet, hop count, and amount
10. Create the route and confirm the wallet transactions

Notes:

- SPL routes still require SOL in the creator wallet for fees, obfuscation overhead, and associated token account creation when needed
- when testing a fresh mint, you may need to initialize token config through the admin flow before the token is routable in the full app flow

### 9. Make a wallet admin locally

```bash
docker compose -f docker-compose.dev.yml exec postgres-dev \
  psql -U trpc_user -d trpc_dev -c \
  "INSERT INTO \"user\" (public_key, role) VALUES ('YOUR_PUBLIC_KEY', 'admin') ON CONFLICT (public_key) DO UPDATE SET role = EXCLUDED.role;"
```

### 10. Common local issues

If the frontend shows `Failed to fetch` or `ERR_CONNECTION_RESET`:

- check `docker compose -f docker-compose.dev.yml ps`
- inspect `api-dev` logs
- confirm `http://localhost:3001/health` is reachable

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
│   ├── web/          # Vite React app (port 5173 dev)
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

- **Production**: `docker-compose.yml` — PostgreSQL + API
- **Development**: `docker-compose.dev.yml` — PostgreSQL (port 5433) + hot-reload API + Vite dev server

### Frontend Static Hosting

Production web app served via static hosting with:

- Reverse proxy `/trpc` → API server
- SPA fallback: all routes → `index.html`

For Netlify, the repo includes `netlify.toml`:

- `apps/web/dist` is the publish directory
- `/trpc/*` is proxied to `https://multihopper-prod-db4f6830ced3.herokuapp.com/trpc/:splat`
- all other routes fall back to `/index.html`

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
