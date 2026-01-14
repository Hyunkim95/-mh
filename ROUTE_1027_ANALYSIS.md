# Route 1027 Investigation Report

## Executive Summary

**Route 1027 was deployed successfully BUT no hops were added to the on-chain state.** The funds (0.1 SOL) are currently held in the user's token account as wrapped tokens. **No funds are stuck or lost** - they can be recovered.

## Route Comparison

### Route 1027 (ISSUE)
- **Status**: Deployed but incomplete
- **Database**: 4 hops configured (hop_index 0-3)
- **On-chain**: 0 hops in route config
- **Current State**: current_index = 0, but no hops to execute
- **Funds**: 0.1 SOL wrapped as route tokens in user's account

### Route 1031 (REFERENCE - Partially Working)
- **Status**: Deployed and partially executed
- **Database**: 2 hops configured
- **On-chain**: 2 hops in route config
- **Current State**: current_index = 2 (completed all hops)
- **Final hop failed**: Error 6003 "NoMoreHops" when trying to execute hop 2

## Timeline

### Route 1027
1. **11:26:47 UTC** - Route created in database with 4 hops
2. **11:34:52 UTC** - Route deployed on-chain (tx: 4CvAC9...dELL)
   - InitializeRouteSol executed successfully
   - 0.1 SOL wrapped into route tokens
   - Executor funded with 0.028 SOL
3. **NO addHops transaction was ever sent for route 1027**
4. Route remains in "deployed" status but cannot execute

### Route 1031
1. **11:30:08 UTC** - Route created in database with 2 hops
2. **11:34:14 UTC** - Route deployed on-chain (tx: 3Yai3M...Uqjh)
3. **11:34:17 UTC** - AddHops transaction executed (tx: WHzZNW...mBj)
   - Successfully added 2 hops on-chain
4. **11:40:10 UTC** - Hop 0 executed successfully
5. **11:40:33 UTC** - Hop 1 executed (last hop, unwrap attempted)
6. **11:40:41 UTC** - Duplicate hop execution failed with "NoMoreHops"

## On-Chain State Details

### Route 1027 Config PDA (8xcEzzz9o1UNFhcemrEFpWhrCcPkZpFHr7F5WBfdhpcW)
```
Route ID: 1027
Creator: 93AceAmSTY4sCkdwnaExuUj8nmaCVKijDHCABx49pTFw
Executor: 9pTi3LXgTV6SZLjuNh2vVsSQ4gf3k4iPNj8MJxBU2vRU
Hop Amount: 100000000 (0.1 SOL)
Route Token Mint: uQDJjhk5fJMZoMV3xrbN2u7QHKWLmUU8zo9u7aErBcs
Total Hops: 0 ⚠️ PROBLEM: Should be 4
Is Finalized: false
```

### Route 1027 State PDA (AHVXCsDPUuEqfZWBNir6es7p78kpehFoc1LsWv5Srxtq)
```
Current Hop Index: 0
Hops Count: 0 ⚠️ PROBLEM: Should be 4
```

## Token Balances

### Route 1027
- **User (93Ace...)**: 0.1 route tokens (wrapped SOL)
- **Executor (9pTi3...)**: 0.028 SOL, 0 route tokens
- **Route Token Mint**: uQDJjhk5fJMZoMV3xrbN2u7QHKWLmUU8zo9u7aErBcs

## Root Cause Analysis

### Primary Issue: Missing addHops Transaction

The deployment process for route 1027 did NOT include an `addHops` transaction. The sequence should have been:

1. ✅ InitializeRouteSol (creates route config with empty hops array)
2. ❌ **MISSING: AddHops transaction** (populate the hops array)
3. ❌ Cannot execute hops (no hops exist on-chain)

### Evidence
- Route 1027's PDA (8xcEzzz9...) has only 1 transaction: InitializeRouteSol
- Route 1031's PDA (HdfzdT...) has 6 transactions including 1 AddHops
- Search for addHops shows: Route 1031 has it, Route 1027 does not

### Why This Happened

**Code Analysis Shows the Deploy Flow is Correct**

The `useDeploy.ts` hook has the correct deployment flow:
```typescript
// From useDeploy.ts deploy() method:
if (!isDeployed) {
  // Step 1: Initialize route
  await initializeRouteMutation({ ...data, hops: freshHops }, type);

  // Step 2: Add hops (may require multiple batches)
  await addHopsMutation(data.routeId, publicKey.toBase58(), freshHops);

  // Step 3: Mark as deployed in database
  await markDeployed.mutateAsync(...);
}
```

**Root Cause: Transaction Failure NOT Caught Properly**

The most likely scenarios:
1. **User closed wallet before addHops**: User may have signed InitializeRoute but closed the wallet prompt for addHops
2. **Transaction silently failed**: addHops transaction failed but error wasn't properly caught/displayed
3. **Network/RPC issue**: Transaction was sent but never confirmed, error not handled
4. **Race condition**: markDeployed was called despite addHops failing

**Evidence Supporting This**:
- Route 1027 has ZERO on-chain transactions for addHops (confirmed via Solana explorer)
- Route 1031 has a successful addHops transaction (WHzZNW...mBj at 11:34:17 UTC)
- Both routes show "deployed" status in database
- Route 1027 was created at 11:26:47 and deployed at 11:34:52 - 8 minutes later
- Route 1031 was created at 11:30:08 and had addHops at 11:34:17 - 4 minutes later

## Route 1031's Secondary Issue

Route 1031 has a different issue: it tried to execute more hops than exist. The error on hop 2 execution:

```
Error Code: 6003 - NoMoreHops
Error Message: No more hops remaining
```

This suggests:
- Database shows 2 hops (hop_index 0-1)
- Database `current_index = 1` (should be on hop 1)
- On-chain shows `currentHopIndex = 2` (already past the last hop)
- Attempted to execute a 3rd hop that doesn't exist

## Funds Status

### Route 1027: ✅ FUNDS ARE SAFE
- **Location**: User's route token account (2iQVodJR7pqrzmFiQorocRdZJva2UNkxGxGNFytZ9vz3)
- **Amount**: 0.1 route tokens (representing 0.1 SOL)
- **Can be recovered**: Yes, by calling `unwrapSol` directly

### Route 1031: ✅ FUNDS WERE DELIVERED
- Hop 0: Successfully sent 0.1 SOL to 3BLjRc...k4Ei
- Hop 1: Successfully unwrapped and sent 0.1 SOL to final recipient 5UHMyY...yDYp
- The error on the duplicate hop execution didn't affect fund delivery

## Recovery Options for Route 1027

### Option 1: Manual Unwrap (Immediate)
Call `unwrapSol` to burn the route tokens and return 0.1 SOL to the user:
```typescript
await unwrapSol(
  executor,
  user,
  tokenConfigPda,
  routeTokenMint,
  amount,
  routeId
)
```

### Option 2: Add Hops and Execute (Fix the Route)
1. Call `addHops` with the 4 configured hops
2. Execute the hops as normal via the scheduler

### Option 3: Database Cleanup
Mark the route as "failed" in the database and refund via option 1

## Recommended Actions

### Immediate (Fix Route 1027)
1. ✅ Call `addHops` transaction with the 4 configured hops from the database
2. ✅ Allow scheduler to execute the hops normally
3. ✅ Verify funds are delivered to final recipient

### Short-term (Prevent Future Issues)
1. 🔧 Fix the Easy Route deployment flow to ensure `addHops` is called
2. 🔧 Add validation: check that on-chain hop count matches database before marking "deployed"
3. 🔧 Add monitoring: alert when deployed routes have 0 hops on-chain

### Long-term (System Improvements)
1. 📊 Add transaction verification: confirm all deployment steps completed
2. 📊 Add health check endpoint: compare DB state vs on-chain state
3. 📊 Add retry logic for failed addHops transactions
4. 📊 Improve error handling in route execution to prevent duplicate hop attempts

## Code Locations to Investigate

1. **Easy Route Deployment**:
   - `/libs/client/src/pages/configureHops/EasyRouteForm.tsx`
   - `/libs/server/src/routers/contract.router.ts` (easy route handler)

2. **AddHops Logic**:
   - `/libs/server/src/solana/services/contract.service.ts` (addHops, addHopsBatched)

3. **Deployment Flow**:
   - `/libs/server/src/routers/contract.router.ts` (deployRoute endpoint)

## Verification Checklist

- [x] Route 1027 on-chain config has 0 hops (CONFIRMED)
- [x] Route 1027 database has 4 hops (CONFIRMED)
- [x] No addHops transaction exists for route 1027 (CONFIRMED)
- [x] Funds are safe in user's token account (CONFIRMED - 0.1 tokens)
- [x] Route 1031 had addHops called (CONFIRMED)
- [x] Route 1031 funds were delivered (CONFIRMED)
- [x] Issue is specific to Easy Route flow (HIGH PROBABILITY)

## Additional Notes

### Executor Funding
Both routes properly funded their executors:
- Route 1027: 0.028 SOL to executor
- Route 1031: ~0.02 SOL to executor (used some for hops)

### Database Integrity
The database state is correct - it's the on-chain state that's incomplete due to the missing addHops transaction.

### No Funds Lost
**Important**: No SOL was lost or stuck in an inaccessible state. The 0.1 SOL is wrapped as route tokens and can be unwrapped at any time.
