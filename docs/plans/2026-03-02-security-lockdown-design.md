# Security Lockdown Design

**Date**: 2026-03-02
**Approach**: Aggressive Lockdown — single coordinated deployment during maintenance window
**Window**: 4-8 hours with full staging validation beforehand
**Scope**: All CRITICAL + HIGH findings, plus safe MEDIUM/LOW fixes from the 2026-02-27 codebase audit

---

## Context

- Production with real funds on Solana mainnet
- Single API server instance
- Public frontend access
- Full staging environment available
- `JWT_SECRET` and `EXECUTOR_SEED` already set to strong values in production
- Helius API key not yet rotated (hardcoded in 8 files)
- C9 (transaction confirmation race) already fixed in current code
- C10 (event processing) partially addressed — inner `processHopCompletedEvent` uses DB transactions, outer loop does not

---

## Section 1: Secrets & Configuration (Zero Breakage)

### C1 — Remove Hardcoded Helius API Key
Replace hardcoded Helius RPC URL with `process.env.SOLANA_RPC_URL` (no fallback) in:
- `libs/server/src/executors/executor.service.ts:15`
- `libs/server/src/solana/services/tokens.service.ts:32`
- `scripts/search-add-hops.ts:4`
- `scripts/investigate-route.ts:8`
- `scripts/classify-addresses.ts:50`
- `scripts/check-sol-vault.ts:3`
- `scripts/check-executor-balances.ts:4`
- `scripts/check-transaction.ts:3`

Rotate the key on Helius dashboard after deployment.

### C4 — Remove Weak JWT_SECRET Default
- `libs/server/src/trpc.ts:21` — Remove `|| "secret"` fallback
- Add startup check: throw if `JWT_SECRET` is not set

### C6 — Remove Weak EXECUTOR_SEED Default
- `libs/server/src/executors/executor.service.ts:25,40` — Remove `|| "executor_seed"` fallback
- Add startup check: throw if `EXECUTOR_SEED` is not set

### C11 — Move DB Credentials from Docker Compose
- `docker-compose.yml` and `docker-compose.dev.yml` — Replace hardcoded `POSTGRES_PASSWORD` etc. with `${POSTGRES_PASSWORD}` env var references

---

## Section 2: Auth Overhaul (Coordinated Frontend + Backend)

Full lockdown: every endpoint except auth endpoints themselves requires authentication.

### Backend Changes

#### C2 — Switch All Endpoints to protectedProcedure
Switch from `publicProcedure` to `protectedProcedure` on ALL procedures in:
- `libs/server/src/routers/routes.router.ts` — all 15+ procedures
- `libs/server/src/routers/contract.router.ts` — all 26+ procedures (including `withdrawOnBehalf`, `triggerHop`)
- `libs/server/src/routers/easy-routes.router.ts` — `create`, `validate`
- `libs/server/src/routers/dual-contract-events.router.ts` — all procedures (`updateConfig`, `runEtlNow`, `processEventsNow`, `resetCursor` should use `adminProcedure`)

Keep `publicProcedure` ONLY on:
- `authRouter.createMessage`
- `authRouter.verifyUserWithSignature`

#### C3 — Replace input.creator with ctx.user.publicKey
For all mutation endpoints:
- Remove `creator` from Zod input schemas
- Use `ctx.user.publicKey` instead of `input.creator`
- Read-only queries that take `creator` as a lookup param should validate `ctx.user.publicKey === input.creator`

Affected files:
- `libs/server/src/routers/routes.router.ts` — `createRouteSchema`, `routeIdSchema`, `updateRouteSchema`, and all procedure bodies
- `libs/server/src/routers/easy-routes.router.ts` — `easyRouteSchema`
- `libs/server/src/routers/contract.router.ts` — all procedures using creator from input

#### C5 — Fix JWT Expiration
`libs/server/src/routers/auth.router.ts:28-33` — Change:
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
  { userId: user.id, role: user.role, publicKey: user.publicKey },
  { expiresIn: "1d" }
);
```

Impact: All existing tokens will lack proper `exp` claim. Users must re-login after deploy (acceptable during maintenance).

#### C8 — Enable Admin Role Check
`libs/server/src/trpc.ts:69-75` — Uncomment the admin role check.

Add a DB migration to set `role = 'admin'` for team wallet addresses. The migration must run BEFORE the deploy or admin endpoints become inaccessible.

#### C12 — Restrict CORS Origins
`libs/server/src/trpc.ts:14` — Change `origin: true` to:
```typescript
origin: [process.env.CORS_ORIGIN || 'https://YOUR_DOMAIN', 'http://localhost:5173']
```
Production domain to be provided during implementation.

### Frontend Changes

#### C3 (client side) — Remove creator from tRPC Inputs
Update all tRPC mutation calls to stop sending `creator` in the input. The server now derives it from the JWT.

Affected hooks/components that call:
- `trpc.routes.create.mutate(...)`
- `trpc.routes.update.mutate(...)`
- `trpc.routes.delete.mutate(...)`
- `trpc.routes.replay.mutate(...)`
- `trpc.routes.markDeployed.mutate(...)`
- `trpc.routes.updateHopTimestamps.mutate(...)`
- `trpc.routes.getByCreator.query(...)`
- `trpc.routes.getById.query(...)`
- `trpc.easyRoutes.create.mutate(...)`
- All `trpc.contract.*` calls that pass creator

---

## Section 3: Race Conditions & Atomicity

### C7 — Hop Scheduler Locking
`libs/server/src/hops/services/hops-scheduler.service.ts`

Add a database-level advisory lock or `SELECT ... FOR UPDATE` before the hop execution loop:
- Before fetching on-chain state for a route, acquire a per-route lock
- Release after the hop execution completes or fails
- This prevents re-entrant cron executions from double-executing the same hop

Since it's single-instance, a simple in-process mutex per route would also work, but DB locking is more robust for future scaling.

### C10 — Atomic Event Processing
`libs/server/src/solana/services/contract-event-processor.ts:46-88`

Wrap the outer loop's `processEvent()` + `markAsProcessed` in a single DB transaction:
```typescript
await this.db.transaction(async (tx) => {
  await this.processEvent(event, tx);  // pass tx context
  await tx.update(contractEvents)
    .set({ processed: true, processedAt: new Date() })
    .where(eq(contractEvents.id, event.id));
});
```

### H8 — Fix Busy Wallet Race Condition
`libs/server/src/busy-wallets/services/busy-wallets.service.ts`

Wrap `getRandomWallets()` + `markWalletsUsed()` in a single transaction with `SELECT ... FOR UPDATE SKIP LOCKED`.

---

## Section 4: Crypto & Token Security

### H3 — Upgrade Encryption Key Derivation
`libs/crypto-utils/src/encryption.ts`

Migration strategy with backward compatibility:
1. Add `kdfVersion` column to custodial wallets table (default `1`)
2. Implement PBKDF2 with 100,000 iterations and random salt as v2
3. Decryption checks `kdfVersion` and uses appropriate KDF
4. Migration script during maintenance window: decrypt with v1, re-encrypt with v2, update `kdfVersion`
5. After migration completes and all wallets are v2, remove v1 code path

### H4 — Clear Keypair from Memory After Use
`libs/solana-node/src/custodial-wallets/solana-wallet-manager.ts`

Null keypair references after use in transaction signing methods. Best-effort given JS GC constraints.

### H7 — Migrate Tokens from localStorage to HttpOnly Cookies
Full auth transport change:

**Server:**
- On successful auth, set an HttpOnly cookie: `Set-Cookie: token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/`
- Read token from cookie in `createContext` (fallback to Authorization header during transition)
- On logout, clear the cookie

**Client:**
- Remove `localStorage.setItem("token", ...)` from `useSolanaAuth.tsx`
- Remove `localStorage.getItem("token")` from `trpc.ts`
- tRPC client uses `credentials: 'include'` to send cookies automatically
- No manual Authorization header needed

### H10 — Secure Nonce Generation with Replay Protection
`libs/server/src/auth/services/auth.service.ts`

- Replace `Math.random()` with `crypto.randomBytes(16).toString('hex')`
- Add `auth_nonces` table: `{ nonce, createdAt, usedAt, expiresAt }`
- On challenge creation: store nonce with 5-minute TTL
- On verification: check nonce exists, not expired, not already used. Mark as used.

---

## Section 5: Infrastructure & Frontend Hardening

### H1 — Increase Executor Wallet Funding
`libs/server/src/solana/services/contract.service.ts:798-804`
Change formula to `(hopCount * 0.005) + 0.05 SOL`. Only affects new route deployments.

### H2 — Increase Priority Fee Default
`libs/server/src/solana/services/contract.service.ts:132,149`
Increase default from 1,000 to 10,000 micro-lamports.

### H5 — Add Nginx Security Headers
`apps/web/nginx.conf` — Add:
```nginx
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.helius-rpc.com" always;
```

### H6 — Remove dangerouslySetInnerHTML
`libs/client/src/components/RouteCreateForm.tsx:233`
Replace `<style dangerouslySetInnerHTML={{ __html: datePickerStyles }} />` with `<style>{datePickerStyles}</style>`.

### H9 — Add Rate Limiting
Add `@fastify/rate-limit` to the API server:
- Global: 100 requests/minute per IP
- Auth endpoints: 10 requests/minute per IP
- Financial mutations: 20 requests/minute per user

### H11 — Add DOMPurify
Add `dompurify` to client dependencies. Sanitize any user-controlled strings before rendering.

### M1 — PublicKey Input Validation
Add `.refine()` to all Zod schemas accepting Solana addresses:
```typescript
z.string().refine((val) => {
  try { new PublicKey(val); return true; } catch { return false; }
}, "Invalid Solana address")
```

### M2 — Re-enable Max Hops Validation
`libs/server/src/routes/services/route-validation.service.ts:57-64` — Re-enable with limit of 50 hops.

### M3 — Route Name Max Length
`libs/server/src/routers/routes.router.ts:22` — Change `.min(1)` to `.min(1).max(255)`.

### M4 — SSL Certificate Validation
`libs/server/src/db/connection.ts:19` — Change to `rejectUnauthorized: true` in production (or use proper CA cert).

### M5 — Escape LIKE Wildcards
`libs/server/src/token-configs/services/token-configs.service.ts:37-44` — Escape `%` and `_` in user input before LIKE query, or switch to exact match with `eq()`.

### M6 — Non-root Web Dockerfile
`apps/web/Dockerfile` — Add non-root user before CMD.

### M7 — Bind DB Port to Localhost
`docker-compose.dev.yml:17` — Change `"5433:5432"` to `"127.0.0.1:5433:5432"`.

### M8 — Hop Timeout Handling
Add logic to mark hops as `failed` after 24 hours of pending status. Log alert on 3+ consecutive failures per route.

### M10 — Connection Pool Limits
`libs/server/src/db/connection.ts` — Add `max: 20`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`.

### M13 — Generic Error Messages
Replace raw error re-throws in routers with generic messages. Log details server-side only.

### L1-L6 — All Low Findings
- L1: Fix "Recommnedef" typo
- L2: Remove `console.log("checkTime", ...)`
- L3: Use `TRPCError` instead of generic `Error` in easy-routes router
- L4: Null private key string after decryption
- L5: Add loading spinner to RoleGuardHOC before redirect
- L6: Add env var override for program IDs

---

## Deferred Items

| Finding | Reason |
|---------|--------|
| **M11** — Node.js 18 to 20 upgrade | Too risky to combine. Separate deployment after lockdown stabilizes. |
| **M12** — Security test suite | Not a code fix. Plan as follow-up sprint. |
| **C9** — Transaction confirmation race | Already fixed in current code. No action needed. |

---

## Deployment Sequence

### Before Maintenance Window
1. Deploy all changes to staging
2. Run full regression: auth flow, route CRUD, deploy route, execute hops
3. Run wallet re-encryption migration on staging DB
4. Test CORS with staging domain
5. Verify rate limiting doesn't block normal usage
6. Prepare rollback branch (tag current main as `pre-lockdown`)

### During Maintenance Window (4-8 hours)

```
Hour 0:    Announce maintenance, put up maintenance page
Hour 0.5:  Run DB migrations (admin roles, nonce table, kdfVersion column)
Hour 1:    Run wallet re-encryption migration script
Hour 1.5:  Deploy backend
Hour 2:    Rotate Helius API key on dashboard
Hour 2.5:  Deploy frontend
Hour 3:    Verify auth flow end-to-end (login, create route, deploy, hops execute)
Hour 3.5:  Verify CORS, rate limiting, security headers (curl tests)
Hour 4:    Remove maintenance page, monitor
Hours 4-8: Monitor for issues, hot-fix if needed

ROLLBACK PLAN:
- If backend deploy fails: revert to pre-lockdown tag, re-deploy
- If wallet migration fails midway: kdfVersion column allows mixed state, v1 decryption still works
- If frontend/backend mismatch: both are tagged, deploy matching versions
```

---

## Risk Summary

| Risk | Mitigation |
|------|-----------|
| Auth overhaul breaks frontend/backend contract | Ship both in same window, test on staging first |
| Wallet re-encryption fails midway | kdfVersion column allows mixed v1/v2 state |
| CORS whitelist blocks legitimate traffic | Include localhost for debugging, monitor |
| Rate limiting too aggressive | Start generous (100/min), tighten later |
| Existing JWT tokens invalidated by expiration fix | Expected — users re-login (maintenance window) |
| Hop scheduler paused during deploy | Hops are time-tolerant (scheduler retries on next 10s tick) |
