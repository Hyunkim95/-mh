# Security Lockdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 45 security audit findings in a single coordinated deployment during a maintenance window.

**Architecture:** Backend-first changes (secrets, auth middleware, race condition fixes, crypto upgrades), then frontend changes (remove `creator` from inputs, cookie auth), then infrastructure (nginx, Dockerfile, Docker Compose). All shipped atomically.

**Tech Stack:** TypeScript, Fastify + tRPC, React + @trpc/react-query, Drizzle ORM + PostgreSQL, Solana web3.js, Node.js 18

**Design doc:** `docs/plans/2026-03-02-security-lockdown-design.md`

---

## Task 1: Remove Hardcoded Secrets and Add Startup Validation (C1, C4, C6)

**Files:**
- Modify: `libs/server/src/executors/executor.service.ts:14-15,25,40`
- Modify: `libs/server/src/solana/services/tokens.service.ts:32`
- Modify: `libs/server/src/trpc.ts:21`
- Modify: `scripts/search-add-hops.ts:4`
- Modify: `scripts/investigate-route.ts:8`
- Modify: `scripts/classify-addresses.ts:50`
- Modify: `scripts/check-sol-vault.ts:3`
- Modify: `scripts/check-executor-balances.ts:4`
- Modify: `scripts/check-transaction.ts:3`

**Step 1: Remove hardcoded Helius RPC URL from executor.service.ts**

Replace the Connection instantiation (around line 14):
```typescript
// FROM:
const connection = new Connection(
  process.env.SOLANA_RPC_URL ||
    "https://mainnet.helius-rpc.com/?api-key=f6d0c03a-...",
  { commitment: "confirmed" }
);

// TO:
if (!process.env.SOLANA_RPC_URL) {
  throw new Error("SOLANA_RPC_URL environment variable is required");
}
const connection = new Connection(
  process.env.SOLANA_RPC_URL,
  { commitment: "confirmed" }
);
```

**Step 2: Remove EXECUTOR_SEED defaults from executor.service.ts**

In `getWalletByRouteId` (line 25) and `getSigner` (line 40), change:
```typescript
// FROM:
const executorSeed = process.env.EXECUTOR_SEED || "executor_seed";

// TO:
const executorSeed = process.env.EXECUTOR_SEED;
if (!executorSeed) {
  throw new Error("EXECUTOR_SEED environment variable is required");
}
```

**Step 3: Remove JWT_SECRET default from trpc.ts**

Line 21:
```typescript
// FROM:
server.register(jwt, {
  secret: process.env.JWT_SECRET || "secret",
});

// TO:
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
server.register(jwt, {
  secret: process.env.JWT_SECRET,
});
```

**Step 4: Remove hardcoded RPC URLs from all scripts and tokens.service.ts**

For each file, find the hardcoded Helius URL and replace with `process.env.SOLANA_RPC_URL`. Each script should throw on missing env var. Check each file — some may already use env vars.

**Step 5: Verify the app boots locally**

Run: `cd apps/api && yarn build`
Expected: Build succeeds. Server won't start without env vars (which is correct).

**Step 6: Commit**

```bash
git add libs/server/src/executors/executor.service.ts libs/server/src/solana/services/tokens.service.ts libs/server/src/trpc.ts scripts/
git commit -m "fix: remove hardcoded secrets and add startup validation (C1, C4, C6)"
```

---

## Task 2: Fix JWT Expiration and Admin Role Check (C5, C8)

**Files:**
- Modify: `libs/server/src/routers/auth.router.ts:28-33`
- Modify: `libs/server/src/trpc.ts:64-83`

**Step 1: Fix JWT expiresIn placement in auth.router.ts**

Lines 28-33:
```typescript
// FROM:
const token = ctx.fastify.jwt.sign({
  userId: user.id,
  role: user.role,
  expiresIn: "1d",
  publicKey: user.publicKey,
});

// TO:
const token = ctx.fastify.jwt.sign(
  {
    userId: user.id,
    role: user.role,
    publicKey: user.publicKey,
  },
  { expiresIn: "1d" }
);
```

**Step 2: Uncomment admin role check in trpc.ts**

Lines 69-75:
```typescript
// FROM:
/** TODO: Uncomment this when we have an admin role */
// if (ctx.user.role !== "admin") {
//   throw new TRPCError({
//     code: "FORBIDDEN",
//     message: "Admin access required",
//   });
// }

// TO:
if (ctx.user.role !== "admin") {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Admin access required",
  });
}
```

**Step 3: Commit**

```bash
git add libs/server/src/routers/auth.router.ts libs/server/src/trpc.ts
git commit -m "fix: correct JWT expiration and enable admin role check (C5, C8)"
```

---

## Task 3: Create Admin Role Migration

**Files:**
- Create: `libs/server/src/db/migrations/XXXX_add_admin_roles.sql`

**Step 1: Create migration SQL**

Check existing migrations for naming convention:
```bash
ls libs/server/src/db/migrations/ 2>/dev/null || ls init-db/
```

Create the migration (admin wallet addresses to be provided by user):
```sql
-- Set admin role for team wallets
-- Replace with actual team wallet public keys
UPDATE "user" SET role = 'admin' WHERE public_key IN (
  'ADMIN_WALLET_1_PUBLIC_KEY',
  'ADMIN_WALLET_2_PUBLIC_KEY'
);
```

**Step 2: Note — this migration MUST run before the backend deploy**

The admin role check (Task 2) will block all `adminProcedure` endpoints if no users have `role = 'admin'`. Run the migration first.

**Step 3: Commit**

```bash
git add init-db/ # or wherever the migration lives
git commit -m "feat: add admin role migration for team wallets (C8)"
```

---

## Task 4: Switch All Endpoints to protectedProcedure/adminProcedure (C2)

**Files:**
- Modify: `libs/server/src/routers/contract.router.ts`
- Modify: `libs/server/src/routers/routes.router.ts`
- Modify: `libs/server/src/routers/easy-routes.router.ts`
- Modify: `libs/server/src/routers/dual-contract-events.router.ts`
- Modify: `libs/server/src/routers/token-configs.router.ts`
- Modify: `libs/server/src/routers/tokens.router.ts`

**Step 1: Update contract.router.ts imports**

Line 3:
```typescript
// FROM:
import { router, publicProcedure } from "../trpc";

// TO:
import { router, protectedProcedure, adminProcedure } from "../trpc";
```

**Step 2: Replace all `publicProcedure` with `protectedProcedure` in contract.router.ts**

Do a find-and-replace in the file: `publicProcedure` → `protectedProcedure`

All 19 procedures become `protectedProcedure`:
- `initializeTokenConfig`, `initializeTokenConfigSOL`, `updateTokenConfig`, `updateTokenConfigSOL`
- `getTokenConfigSPL`, `getTokenConfigSOL`
- `initializeRoute`, `initializeRouteSOL`
- `routeHasHops`, `addHops`, `addHopsBatched`
- `getRouteConfig`, `getRouteState`
- `getExecutorInfo`, `getExecutorBalance`
- `withdrawOnBehalf`, `triggerHop`
- `estimateDeploymentCost`

**Step 3: Update routes.router.ts imports and procedures**

Line 4:
```typescript
// FROM:
import { publicProcedure, router } from '../trpc';

// TO:
import { protectedProcedure, router } from '../trpc';
```

Replace all `publicProcedure` → `protectedProcedure` in this file (all 15+ procedures).

**Step 4: Update easy-routes.router.ts**

Line 2:
```typescript
// FROM:
import { publicProcedure, router } from '../trpc';

// TO:
import { protectedProcedure, router } from '../trpc';
```

Replace `publicProcedure` → `protectedProcedure` for both `create` and `validate`.

**Step 5: Update dual-contract-events.router.ts — use adminProcedure**

This router has admin operations (ETL control, config updates). These should require admin role.

Line 3:
```typescript
// FROM:
import { router, publicProcedure } from '../trpc';

// TO:
import { router, protectedProcedure, adminProcedure } from '../trpc';
```

- `getStatus` → `protectedProcedure` (read-only)
- `runEtlNow` → `adminProcedure`
- `processEventsNow` → `adminProcedure`
- `updateConfig` → `adminProcedure`
- `getProcessingStats` → `protectedProcedure` (read-only)
- `isReady` → `protectedProcedure` (read-only)
- `getCursors` → `protectedProcedure` (read-only)
- `resetCursor` → `adminProcedure`

**Step 6: Update tokens.router.ts and token-configs.router.ts**

Check these files and switch `publicProcedure` → `protectedProcedure`.

**Step 7: Verify build**

Run: `cd libs/server && yarn build`
Expected: Build succeeds.

**Step 8: Commit**

```bash
git add libs/server/src/routers/
git commit -m "fix: switch all endpoints to protectedProcedure/adminProcedure (C2)"
```

---

## Task 5: Replace input.creator with ctx.user.publicKey (C3)

**Files:**
- Modify: `libs/server/src/routers/routes.router.ts`
- Modify: `libs/server/src/routers/easy-routes.router.ts`
- Modify: `libs/server/src/routers/contract.router.ts`

**Step 1: Update Zod schemas in routes.router.ts — remove `creator` from mutation schemas**

```typescript
// createRouteSchema — remove creator
const createRouteSchema = z.object({
  name: z.string().min(1).max(255),  // also adds M3 max length
  tokenType: z.enum(['SPL', 'SOL']),
  tokenMint: z.string().optional(),
  tokenSymbol: z.string().optional(),
  tokenDecimals: z.number(),
  hopAmountTokens: z.string(),
  hopAmountRaw: z.string(),
  hops: z.array(routeHopSchema),
  // creator REMOVED — now from ctx.user.publicKey
});

// routeIdSchema — remove creator
const routeIdSchema = z.object({
  id: z.number(),
  // creator REMOVED
});

// updateRouteSchema — remove creator
const updateRouteSchema = z.object({
  id: z.number(),
  // creator REMOVED
  updates: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    hopAmountTokens: z.string().optional(),
    hopAmountRaw: z.string().optional(),
    hops: z.array(routeHopSchema).optional(),
  }),
});
```

**Step 2: Update all route procedure bodies to use `ctx.user.publicKey`**

For every procedure that currently uses `input.creator`, replace with `ctx.user.publicKey`. Example for `create`:

```typescript
create: protectedProcedure
  .input(createRouteSchema)
  .mutation(async ({ ctx, input }) => {  // ADD ctx
    try {
      const creator = ctx.user.publicKey;  // FROM AUTH CONTEXT
      const validation = await validateRoute({ ...input, creator });
      // ... rest uses `creator` variable instead of `input.creator`
      const route = await routesService.createRoute({ ...input, creator });
```

Do this for ALL procedures: `create`, `replay`, `getByCreator`, `getById`, `update`, `delete`, `updateHopTimestamps`, `markDeployed`, and all obfuscation endpoints.

**Step 3: Update easy-routes.router.ts — remove creator from schema**

```typescript
const easyRouteSchema = z.object({
  arrivalTime: z.string().transform((str) => new Date(str)),
  hopCount: z.number().min(1),
  destinationWallet: z.string().min(32).max(64),
  tokenType: z.enum(['SPL', 'SOL']),
  tokenMint: z.string().optional(),
  tokenSymbol: z.string().optional(),
  tokenDecimals: z.number().default(6),
  hopAmountTokens: z.string(),
  hopAmountRaw: z.string(),
  // creator REMOVED
});
```

Update the `create` procedure body to use `ctx.user.publicKey`.

**Step 4: Update contract.router.ts — remove creator from input schemas**

Find `initializeTokenConfigInputSchema` and other schemas that include `creator`. Replace `input.creator` with `ctx.user.publicKey` in procedure bodies. For `initializeRoute`, `initializeRouteSOL`, `withdrawOnBehalf`, etc. — audit each procedure for `input.creator` usage.

**Step 5: Verify build**

Run: `cd libs/server && yarn build`

**Step 6: Commit**

```bash
git add libs/server/src/routers/
git commit -m "fix: replace input.creator with ctx.user.publicKey for ownership (C3)"
```

---

## Task 6: Update Frontend — Remove creator from tRPC Inputs (C3 client)

**Files (7 core hooks + 6 components + 4 pages):**
- Modify: `libs/client/src/hooks/useDeploy.ts` (lines 115, 123, 216-228, 380, 419, 443)
- Modify: `libs/client/src/hooks/useSubmitRoute.ts` (lines 13-20, 37)
- Modify: `libs/client/src/hooks/useInitializeTokenConfig.ts` (lines 33, 76)
- Modify: `libs/client/src/hooks/useUpdateTokenConfig.ts` (lines 26, 68)
- Modify: `libs/client/src/hooks/useReplayRoute.ts` (lines 9, 12, 15)
- Modify: `libs/client/src/hooks/useObfuscationDeploy.ts` (line 51)
- Modify: `libs/client/src/hooks/useTriggerHop.ts` (lines 3-7)
- Modify: `libs/client/src/components/admin/AdminHopsTab.tsx` (lines 59, 100, 108, 134)
- Modify: `libs/client/src/components/HopsTab.tsx` (lines 64, 131, 139, 175)
- Modify: `libs/client/src/components/RouteDetailView.tsx` (line 104)
- Modify: `libs/client/src/components/TokenConfigForm.tsx` (line 10)
- Modify: `libs/client/src/components/admin/AdminTokenConfigForm.tsx`
- Modify: `libs/client/src/components/history/RouteItem.tsx`
- Modify: `libs/client/src/pages/ConfigureHops.tsx` (lines 82, 810)
- Modify: `libs/client/src/pages/Multihop.tsx` (lines 99, 111, 131, 139, 175)
- Modify: `libs/client/src/pages/TokenConfigDetail.tsx` (line 172)
- Modify: `libs/client/src/pages/AdminMultihop.tsx` (line 87)

**Step 1: Find all files passing creator to tRPC calls**

Run:
```bash
grep -rn "creator:" libs/client/src/ --include="*.tsx" --include="*.ts" | grep -v "node_modules" | grep -v "types/" | grep -v "route.ts"
```

**Step 2: For each mutation call, remove the `creator` property**

Example — `useDeploy.ts:115`:
```typescript
// FROM:
creator: publicKey.toBase58(),

// TO:
// (line removed — server derives from JWT)
```

**Step 3: For each query call, remove the `creator` property**

Example — `AdminHopsTab.tsx:59`:
```typescript
// FROM:
trpc.routes.getByCreator.useQuery(
  { creator: userData?.publicKey ?? '' },
  { enabled: !!userData?.publicKey }
)

// TO:
trpc.routes.getByCreator.useQuery(
  undefined,  // or {} — server uses ctx.user.publicKey
  { enabled: !!userData?.publicKey }
)
```

Note: The `getByCreator` endpoint now uses `ctx.user.publicKey` server-side, so no input needed.

**Step 4: Keep `creator` in display-only contexts**

Components like `RouteDetailView.tsx:297` that just display `{route.creator}` — these read from the route data object, not the input. Leave them alone.

**Step 5: Rebuild client**

Run: `cd libs/client && yarn build`
Expected: Build succeeds with type-checked tRPC contract.

**Step 6: Commit**

```bash
git add libs/client/src/
git commit -m "fix: remove creator from tRPC mutation/query inputs (C3 frontend)"
```

---

## Task 7: Restrict CORS Origins (C12)

**Files:**
- Modify: `libs/server/src/trpc.ts:13-18`

**Step 1: Replace open CORS with whitelist**

```typescript
// FROM:
server.register(cors, {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// TO:
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : ["http://localhost:5173"];

server.register(cors, {
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
```

**Step 2: Set `CORS_ORIGINS` env var in production**

Value: `https://YOUR_PRODUCTION_DOMAIN` (user to provide)

**Step 3: Commit**

```bash
git add libs/server/src/trpc.ts
git commit -m "fix: restrict CORS to whitelisted origins (C12)"
```

---

## Task 8: Add Hop Scheduler Locking (C7)

**Files:**
- Modify: `libs/server/src/hops/services/hops-scheduler.service.ts`

**Step 1: Add an in-process lock to prevent re-entrant cron execution**

At the top of the file, add a lock flag:
```typescript
let isSchedulerRunning = false;

const _triggerHop = async () => {
  if (isSchedulerRunning) {
    console.log("[HopScheduler] Previous scan still running, skipping...");
    return;
  }
  isSchedulerRunning = true;
  try {
    // ... existing code ...
  } catch (error) {
    console.error("[HopScheduler] Critical error during hop scan:", error);
  } finally {
    isSchedulerRunning = false;
  }
};
```

This prevents the 10-second cron from overlapping with a still-running scan. For a single-instance deployment, this is sufficient.

**Step 2: Commit**

```bash
git add libs/server/src/hops/services/hops-scheduler.service.ts
git commit -m "fix: add re-entrant lock to hop scheduler (C7)"
```

---

## Task 9: Make Event Processing Atomic (C10)

**Files:**
- Modify: `libs/server/src/solana/services/contract-event-processor.ts:46-88`

**Step 1: Wrap the outer loop's process + mark-as-processed in a transaction**

The current code (around lines 63-83):
```typescript
// FROM:
for (const event of unprocessedEvents) {
  try {
    await this.processEvent(event);
    await this.db
      .update(contractEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(contractEvents.id, event.id));
    processed++;
  } catch (error) { ... }
}

// TO:
for (const event of unprocessedEvents) {
  try {
    await this.db.transaction(async (tx) => {
      await this.processEvent(event, tx);
      await tx
        .update(contractEvents)
        .set({ processed: true, processedAt: new Date() })
        .where(eq(contractEvents.id, event.id));
    });
    processed++;
  } catch (error) { ... }
}
```

**Step 2: Update processEvent and sub-methods to accept optional tx parameter**

The `processEvent` method and its sub-methods (`processHopCompletedEvent`, etc.) need to accept a `tx` parameter and use it instead of `this.db` when provided. `processHopCompletedEvent` already uses `this.db.transaction` internally — when a `tx` is passed, use it directly instead.

**Step 3: Commit**

```bash
git add libs/server/src/solana/services/contract-event-processor.ts
git commit -m "fix: make event processing atomic with DB transaction (C10)"
```

---

## Task 10: Fix Busy Wallet Race Condition (H8)

**Files:**
- Modify: `libs/server/src/busy-wallets/services/busy-wallets.service.ts`

**Step 1: Wrap getRandomWallets + markWalletsUsed in a transaction with locking**

```typescript
async getRandomWalletsAndMark(count: number): Promise<BusyWallet[]> {
  return await this.db.transaction(async (tx) => {
    const candidates = await tx
      .select()
      .from(busyWalletsSchema)
      .where(eq(busyWalletsSchema.isActive, true))
      .orderBy(sql`RANDOM()`)
      .limit(count)
      .for('update', { skipLocked: true });

    const now = new Date();
    for (const wallet of candidates) {
      await tx
        .update(busyWalletsSchema)
        .set({ lastUsedAt: now })
        .where(eq(busyWalletsSchema.id, wallet.id));
    }

    return candidates;
  });
}
```

Note: Check if Drizzle supports `.for('update', { skipLocked: true })`. If not, use raw SQL via `sql` template.

**Step 2: Update callers to use the new combined method**

**Step 3: Commit**

```bash
git add libs/server/src/busy-wallets/
git commit -m "fix: add transactional locking to busy wallet allocation (H8)"
```

---

## Task 11: Upgrade Encryption KDF with Migration Support (H3)

**Files:**
- Modify: `libs/crypto-utils/src/encryption.ts`

**Step 1: Add PBKDF2 key derivation alongside existing sha256**

```typescript
import { createCipheriv, createDecipheriv, randomBytes, createHash, pbkdf2Sync } from 'crypto';

export interface EncryptionResult {
  encrypted: string;
  iv: string;
  salt?: string;      // NEW: for PBKDF2
  kdfVersion?: number; // NEW: 1 = sha256, 2 = PBKDF2
}

function deriveKeyV1(encryptionKey: string): Buffer {
  return createHash('sha256').update(encryptionKey).digest();
}

function deriveKeyV2(encryptionKey: string, salt: Buffer): Buffer {
  return pbkdf2Sync(encryptionKey, salt, 100000, 32, 'sha512');
}

export function encryptPrivateKey(privateKey: string, encryptionKey: string): EncryptionResult {
  const iv = randomBytes(16);
  const salt = randomBytes(32);
  const key = deriveKeyV2(encryptionKey, salt);
  const cipher = createCipheriv('aes-256-cbc', key, iv);

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
    kdfVersion: 2,
  };
}

export function decryptPrivateKey(encryptedData: EncryptionResult, encryptionKey: string): string {
  const version = encryptedData.kdfVersion ?? 1;
  let key: Buffer;

  if (version === 2 && encryptedData.salt) {
    key = deriveKeyV2(encryptionKey, Buffer.from(encryptedData.salt, 'hex'));
  } else {
    key = deriveKeyV1(encryptionKey);
  }

  const iv = Buffer.from(encryptedData.iv, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);

  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

**Step 2: Add a `salt` and `kdf_version` column to the custodial wallets table**

Check the schema for custodial wallets (likely in `libs/solana-node/` or `libs/server/src/db/schema/`) and add the columns.

**Step 3: Create a migration script to re-encrypt existing wallets**

```typescript
// scripts/migrate-wallet-encryption.ts
// For each wallet: decrypt with v1, re-encrypt with v2, update record
```

This script runs during the maintenance window.

**Step 4: Commit**

```bash
git add libs/crypto-utils/src/encryption.ts
git commit -m "fix: upgrade encryption to PBKDF2 with backward-compatible migration (H3)"
```

---

## Task 12: Secure Nonce Generation and Replay Protection (H10, M9)

**Files:**
- Modify: `libs/server/src/auth/services/auth.service.ts:6-18`
- Create: `libs/server/src/db/schema/auth-nonces.schema.ts`
- Modify: `libs/server/src/routers/auth.router.ts`

**Step 1: Replace Math.random() nonce with crypto.randomBytes**

In `auth.service.ts`:
```typescript
import crypto from 'crypto';

export const generateNonce = (): string => {
  return crypto.randomBytes(16).toString('hex'); // 32-char hex = 128 bits
};
```

**Step 2: Create nonce schema for replay protection**

```typescript
// libs/server/src/db/schema/auth-nonces.schema.ts
import { pgTable, serial, varchar, timestamp, boolean } from "drizzle-orm/pg-core";

export const authNoncesSchema = pgTable("auth_nonces", {
  id: serial("id").primaryKey(),
  nonce: varchar("nonce", { length: 64 }).notNull().unique(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});
```

**Step 3: Store nonce on creation, validate and mark used on verification**

Update `createChallenge` to store the nonce in DB with a 5-minute TTL.
Update `verifySignature` flow to check nonce exists, is not expired, and is not used.

**Step 4: Add DB migration for auth_nonces table**

**Step 5: Commit**

```bash
git add libs/server/src/auth/ libs/server/src/db/schema/
git commit -m "fix: use crypto.randomBytes for nonces with replay protection (H10, M9)"
```

---

## Task 13: Add Rate Limiting (H9)

**Files:**
- Modify: `libs/server/src/trpc.ts` or `libs/server/src/server.ts`
- Modify: `libs/server/package.json` (add dependency)

**Step 1: Install @fastify/rate-limit**

```bash
cd libs/server && yarn add @fastify/rate-limit
```

**Step 2: Register rate limiting in trpc.ts**

After the CORS registration:
```typescript
import rateLimit from '@fastify/rate-limit';

server.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});
```

**Step 3: Commit**

```bash
git add libs/server/src/trpc.ts libs/server/package.json
git commit -m "feat: add rate limiting middleware (H9)"
```

---

## Task 14: Increase Executor Funding and Priority Fees (H1, H2)

**Files:**
- Modify: `libs/server/src/solana/services/contract.service.ts`

**Step 1: Update executor funding formula (around line 798)**

```typescript
// FROM:
const fundingAmount = hopCount * 0.002 + 0.02;

// TO:
const fundingAmount = hopCount * 0.005 + 0.05;
```

**Step 2: Update priority fee default (around lines 132, 149)**

```typescript
// FROM:
const priorityFee = 1000; // or whatever the current fallback is

// TO:
const priorityFee = 10000;
```

Find the exact lines — search for `1000` or `priorityFee` in the file.

**Step 3: Fix the typo (L1) while in this file**

Line 103: Change "Recommnedef" to "Recommended".

**Step 4: Commit**

```bash
git add libs/server/src/solana/services/contract.service.ts
git commit -m "fix: increase executor funding and priority fees, fix typo (H1, H2, L1)"
```

---

## Task 15: Add Nginx Security Headers (H5)

**Files:**
- Modify: `apps/web/nginx.conf`

**Step 1: Add security headers to the server block**

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.helius-rpc.com wss://*.helius-rpc.com" always;

    # Handle client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;
}
```

**Step 2: Commit**

```bash
git add apps/web/nginx.conf
git commit -m "fix: add security headers to nginx config (H5)"
```

---

## Task 16: Frontend Security Fixes (H6, H7, L5)

**Files:**
- Modify: `libs/client/src/components/RouteCreateForm.tsx:233`
- Modify: `libs/client/src/hooks/useSolanaAuth.tsx`
- Modify: `libs/client/src/trpc.ts`
- Modify: `libs/client/src/components/RoleGuardHOC.tsx`

**Step 1: Replace dangerouslySetInnerHTML (H6)**

In `RouteCreateForm.tsx`, find (around line 233):
```typescript
// FROM:
<style dangerouslySetInnerHTML={{ __html: datePickerStyles }} />

// TO:
<style>{datePickerStyles}</style>
```

**Step 2: Migrate token storage from localStorage to HttpOnly cookies (H7)**

**Server side** — update `auth.router.ts` to set cookie on login:
```typescript
const token = ctx.fastify.jwt.sign(
  { userId: user.id, role: user.role, publicKey: user.publicKey },
  { expiresIn: "1d" }
);

// Set HttpOnly cookie
ctx.res.setCookie('token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 86400, // 1 day in seconds
});

return { token }; // Still return for backward compat during transition
```

Register `@fastify/cookie` in `trpc.ts`:
```bash
cd libs/server && yarn add @fastify/cookie
```

```typescript
import cookie from '@fastify/cookie';
server.register(cookie);
```

Update `createContext` to read from cookie OR Authorization header:
```typescript
export const createContext = async ({ req, res }: CreateFastifyContextOptions) => {
  let user = null;

  // Try Authorization header first, then cookie
  const token = req.headers.authorization?.split(" ")[1]
    || req.cookies?.token;

  if (token) {
    try {
      user = server.jwt.verify(token);
    } catch { /* invalid token */ }
  }

  return { user, fastify: server, req, res };
};
```

**Client side** — update `useSolanaAuth.tsx`:
```typescript
// Remove localStorage.setItem("token", token) — server sets cookie now
// Remove localStorage.removeItem("token") — server clears cookie on logout
```

Update `trpc.ts` — remove manual Authorization header:
```typescript
// The httpBatchLink already has credentials: "include" (line 44-46)
// Remove the token header logic:
headers() {
  return {
    "content-type": "application/json",
  };
},
```

Add a logout endpoint on the server that clears the cookie.

**Step 3: Add loading spinner to RoleGuardHOC (L5)**

In `RoleGuardHOC.tsx`, replace the `return null` with a loading indicator:
```typescript
// FROM:
return null;

// TO:
return <div className="flex items-center justify-center h-screen">Loading...</div>;
```

**Step 4: Commit**

```bash
git add libs/client/src/ libs/server/src/
git commit -m "fix: migrate to HttpOnly cookies, remove dangerouslySetInnerHTML (H6, H7, L5)"
```

---

## Task 17: Input Validation Fixes (M1, M2, M3, M5)

**Files:**
- Modify: `libs/server/src/routers/contract.router.ts:29-33`
- Modify: `libs/server/src/routers/routes.router.ts:17,22`
- Modify: `libs/server/src/routers/easy-routes.router.ts:10`
- Modify: `libs/server/src/routes/services/route-validation.service.ts:57-64`
- Modify: `libs/server/src/token-configs/services/token-configs.service.ts:37-44`

**Step 1: Fix PublicKey validation (M1)**

In `contract.router.ts`, update `publicKeySchema`:
```typescript
// FROM:
const publicKeySchema = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[A-Za-z0-9]+$/, "Invalid public key format");

// TO:
const publicKeySchema = z
  .string()
  .min(32)
  .max(44)
  .refine((val) => {
    try { new PublicKey(val); return true; } catch { return false; }
  }, "Invalid Solana public key");
```

Apply similar validation to `routes.router.ts` `recipient` field and `easy-routes.router.ts` `destinationWallet` field.

**Step 2: Re-enable max hops validation (M2)**

In `route-validation.service.ts`, uncomment lines 57-64:
```typescript
// Validate maximum hops
const hopCount = routeInput.hops.length;
const maxHops = parseInt(tokenConfig.maxHops);
if (hopCount > maxHops) {
  errors.push(
    `Route has ${hopCount} hops but token config allows maximum ${maxHops} hops`
  );
}
```

**Step 3: Add route name max length (M3)**

Already done in Task 5 — `name: z.string().min(1).max(255)`.

**Step 4: Fix LIKE pattern injection (M5)**

In `token-configs.service.ts:37-44`:
```typescript
// FROM:
const findByCreator = async (creator: string) => {
  return await db
    .select()
    .from(tokenConfigsSchema)
    .where(and(
      ilike(tokenConfigsSchema.creator, `%${creator}%`)
    ));
};

// TO:
const findByCreator = async (creator: string) => {
  return await db
    .select()
    .from(tokenConfigsSchema)
    .where(eq(tokenConfigsSchema.creator, creator));
};
```

Use exact match with `eq()` instead of partial LIKE match.

**Step 5: Commit**

```bash
git add libs/server/src/routers/ libs/server/src/routes/ libs/server/src/token-configs/
git commit -m "fix: improve input validation — PublicKey, max hops, LIKE injection (M1-M5)"
```

---

## Task 18: Docker and Infrastructure Fixes (C11, M4, M6, M7, M10)

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`
- Modify: `apps/web/Dockerfile`
- Modify: `libs/server/src/db/connection.ts`

**Step 1: Move hardcoded DB credentials to env var references (C11)**

In `docker-compose.yml` and `docker-compose.dev.yml`:
```yaml
environment:
  POSTGRES_DB: ${POSTGRES_DB:-trpc_dev}
  POSTGRES_USER: ${POSTGRES_USER:-trpc_user}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

Remove hardcoded passwords. The `:-` syntax provides defaults only for non-secret values.

**Step 2: Add non-root user to web Dockerfile (M6)**

Before `CMD`:
```dockerfile
# Run as non-root user
RUN addgroup -g 101 -S nginx && \
    adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx nginx && \
    chown -R nginx:nginx /usr/share/nginx/html
USER nginx
```

Note: `nginx:alpine` already has the nginx user, so you may just need `USER nginx`.

**Step 3: Bind DB port to localhost only (M7)**

In `docker-compose.dev.yml`:
```yaml
ports:
  - "127.0.0.1:5433:5432"
```

**Step 4: Add connection pool limits (M10)**

In `libs/server/src/db/connection.ts`:
```typescript
const client = new Pool({
  connectionString: DATABASE_CONFIG.getConnectionString(),
  options: "-c timezone=UTC",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: DATABASE_CONFIG.isDevelopment()
    ? false
    : {
        rejectUnauthorized: true, // M4 fix: enable cert validation
      },
});
```

**Step 5: Commit**

```bash
git add docker-compose.yml docker-compose.dev.yml apps/web/Dockerfile libs/server/src/db/connection.ts
git commit -m "fix: Docker security, pool limits, SSL cert validation (C11, M4, M6, M7, M10)"
```

---

## Task 19: Remaining LOW/MEDIUM Fixes (L2, L3, L4, L6, M8, M13)

**Files:**
- Modify: `libs/server/src/hops/services/hops.service.ts:244` (L2)
- Modify: `libs/server/src/routers/easy-routes.router.ts:42-48` (L3)
- Modify: `libs/solana-node/src/custodial-wallets/solana-wallet-manager.ts` (L4, H4)
- Modify: `libs/server/src/solana/services/contract.service.ts` (L6)
- Modify: `libs/server/src/hops/services/hops-scheduler.service.ts` (M8 — add timeout)
- Modify: `libs/server/src/routers/contract.router.ts` (M13)
- Modify: `libs/server/src/routers/routes.router.ts` (M13)

**Step 1: Remove debug log (L2)**

In `hops.service.ts:244`, remove:
```typescript
console.log("checkTime", ...);
```

**Step 2: Use TRPCError in easy-routes router (L3)**

In `easy-routes.router.ts`, replace:
```typescript
// FROM:
throw new Error(error instanceof Error ? error.message : 'Failed to create Easy Route');

// TO:
throw new TRPCError({
  code: 'INTERNAL_SERVER_ERROR',
  message: error instanceof Error ? error.message : 'Failed to create Easy Route',
});
```

**Step 3: Clear private key from memory (L4, H4)**

In `solana-wallet-manager.ts`, after transaction signing, null out references:
```typescript
const keypair = this.getKeypairFromWallet(wallet);
try {
  // ... use keypair for signing ...
} finally {
  // Best-effort memory cleanup
  keypair.secretKey.fill(0);
}
```

**Step 4: Add env var override for program IDs (L6)**

In `contract.service.ts`, find hardcoded program IDs and add env var overrides:
```typescript
const MULTI_HOPPER_PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "EXISTING_HARDCODED_ID"
);
```

**Step 5: Add hop timeout handling (M8)**

In `hops-scheduler.service.ts`, add a check at the start of `_triggerHop`:
```typescript
// Mark hops older than 24 hours as failed
await hopsService.markStaleHopsAsFailed(24 * 60 * 60 * 1000);
```

Implement `markStaleHopsAsFailed` in `hops.service.ts`.

**Step 6: Generic error messages to clients (M13)**

In `contract.router.ts` and `routes.router.ts`, find raw error re-throws and replace with generic messages:
```typescript
// FROM:
throw new Error(error.message);

// TO:
console.error('Internal error:', error);
throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' });
```

**Step 7: Commit**

```bash
git add libs/server/src/ libs/solana-node/src/
git commit -m "fix: remaining LOW/MEDIUM security findings (L2-L6, M8, M13)"
```

---

## Task 20: Add DOMPurify Dependency (H11)

**Files:**
- Modify: `libs/client/package.json`

**Step 1: Install dompurify**

```bash
cd libs/client && yarn add dompurify && yarn add -D @types/dompurify
```

**Step 2: Commit**

```bash
git add libs/client/package.json yarn.lock
git commit -m "feat: add dompurify for input sanitization (H11)"
```

---

## Deployment Checklist

Run through this after all tasks are complete:

1. [ ] All changes committed on a feature branch
2. [ ] `yarn build` succeeds for all packages
3. [ ] Deploy to staging with all new env vars set
4. [ ] Run admin role migration on staging DB
5. [ ] Run wallet re-encryption migration on staging
6. [ ] Test auth flow: connect wallet → sign → get cookie → make authenticated requests
7. [ ] Test route CRUD: create → deploy → hops execute
8. [ ] Test CORS: requests from production domain work, others blocked
9. [ ] Test rate limiting: exceeding limit returns 429
10. [ ] Verify security headers with `curl -I https://staging-domain`
11. [ ] Rotate Helius API key on dashboard
12. [ ] Deploy to production during maintenance window
13. [ ] Run migrations on production DB
14. [ ] Verify production auth flow
15. [ ] Monitor hop scheduler for 30 minutes
16. [ ] Remove maintenance page
