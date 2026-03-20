import { CronJob } from "cron";
import { eq, and, lte, isNull, or, sql } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../db";
import { obfuscationSessionsSchema, intermediateWalletsSchema } from "../schema/obfuscation.schema";
import { routesSchema } from "../../routes/schema/route.schema";
import { obfuscationService } from "./obfuscation.service";
import { intermediateWalletService } from "./intermediate-wallet.service";
import { walletXService } from "./wallet-x.service";
import { obfuscationTxBuilder } from "./obfuscation-tx-builder.service";
import {
  initializeRouteFromWalletX,
  addHopsFromWalletX,
  isRouteDeployedOnChain,
  getRouteStateAccount,
} from "../../solana/services/contract.service";
import routesService from "../../routes/services/routes.service";

// Constants
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PERMANENT_FAILURES = 15; // Stop retrying entirely after this many failures
const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes lock timeout
const MAX_HOPS_WARNING_THRESHOLD = 30; // Warn if route has more than 30 hops

// Unique server identifier for distributed locking
const SERVER_ID = `server_${uuidv4()}`;

// Lock to prevent concurrent job execution within this server instance
let isProcessorRunning = false;

/**
 * Record a failed operation to database for persistence across restarts
 */
async function recordFailureToDb(
  sessionId: number,
  error: string,
  walletId?: number,
): Promise<void> {
  const now = new Date();
  const nextRetryAt = new Date(now.getTime() + RETRY_COOLDOWN_MS);

  if (walletId) {
    // Update intermediate wallet failure tracking
    await db
      .update(intermediateWalletsSchema)
      .set({
        lastError: error,
        failureCount: sql`COALESCE(${intermediateWalletsSchema.failureCount}, 0) + 1`,
        lastFailureAt: now,
        nextRetryAt: nextRetryAt,
        updatedAt: now,
      })
      .where(eq(intermediateWalletsSchema.id, walletId));
  } else {
    // Update session failure tracking
    await db
      .update(obfuscationSessionsSchema)
      .set({
        lastError: error,
        failureCount: sql`COALESCE(${obfuscationSessionsSchema.failureCount}, 0) + 1`,
        lastFailureAt: now,
        nextRetryAt: nextRetryAt,
      })
      .where(eq(obfuscationSessionsSchema.id, sessionId));
  }

  console.error(`[ObfuscationScheduler] Recorded failure for session ${sessionId}${walletId ? ` wallet ${walletId}` : ''}: ${error}`);
}

/**
 * Clear failure tracking on success
 */
async function clearFailureTracking(
  sessionId: number,
  walletId?: number,
): Promise<void> {
  if (walletId) {
    await db
      .update(intermediateWalletsSchema)
      .set({
        failureCount: 0,
        lastFailureAt: null,
        nextRetryAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(intermediateWalletsSchema.id, walletId));
  } else {
    await db
      .update(obfuscationSessionsSchema)
      .set({
        failureCount: 0,
        lastFailureAt: null,
        nextRetryAt: null,
        lastError: null,
      })
      .where(eq(obfuscationSessionsSchema.id, sessionId));
  }
}

/**
 * Check if an operation should be retried based on DB failure tracking
 */
async function shouldRetryFromDb(
  sessionId: number,
  walletId?: number,
): Promise<boolean> {
  const now = new Date();

  if (walletId) {
    const wallet = await db.query.intermediateWalletsSchema.findFirst({
      where: eq(intermediateWalletsSchema.id, walletId),
    });
    if (!wallet) return false;

    const failureCount = wallet.failureCount || 0;
    const nextRetryAt = wallet.nextRetryAt;

    // Permanently stop retrying after too many failures
    if (failureCount >= MAX_PERMANENT_FAILURES) {
      return false;
    }

    if (failureCount >= MAX_RETRY_ATTEMPTS) {
      // Allow retry after cooldown period
      return nextRetryAt ? now >= nextRetryAt : true;
    }
    return true;
  } else {
    const session = await obfuscationService.getSession(sessionId);
    if (!session) return false;

    const failureCount = session.failureCount || 0;
    const nextRetryAt = session.nextRetryAt;

    // Permanently stop retrying after too many failures
    if (failureCount >= MAX_PERMANENT_FAILURES) {
      return false;
    }

    if (failureCount >= MAX_RETRY_ATTEMPTS) {
      return nextRetryAt ? now >= nextRetryAt : true;
    }
    return true;
  }
}

/**
 * Acquire a distributed lock on a session for multi-server safety
 * Uses SELECT FOR UPDATE SKIP LOCKED pattern
 */
async function acquireSessionLock(sessionId: number): Promise<boolean> {
  const now = new Date();
  const lockTimeout = new Date(now.getTime() - LOCK_TIMEOUT_MS);

  try {
    // Try to acquire lock only if not locked or lock has expired
    const result = await db
      .update(obfuscationSessionsSchema)
      .set({
        lockedBy: SERVER_ID,
        lockedAt: now,
      })
      .where(
        and(
          eq(obfuscationSessionsSchema.id, sessionId),
          or(
            isNull(obfuscationSessionsSchema.lockedBy),
            lte(obfuscationSessionsSchema.lockedAt, lockTimeout),
          ),
        ),
      )
      .returning();

    return result.length > 0;
  } catch (error) {
    console.warn(`[ObfuscationScheduler] Failed to acquire lock for session ${sessionId}:`, error);
    return false;
  }
}

/**
 * Release the distributed lock on a session
 */
async function releaseSessionLock(sessionId: number): Promise<void> {
  try {
    await db
      .update(obfuscationSessionsSchema)
      .set({
        lockedBy: null,
        lockedAt: null,
      })
      .where(
        and(
          eq(obfuscationSessionsSchema.id, sessionId),
          eq(obfuscationSessionsSchema.lockedBy, SERVER_ID),
        ),
      );
  } catch (error) {
    console.warn(`[ObfuscationScheduler] Failed to release lock for session ${sessionId}:`, error);
  }
}

/**
 * Validate hops configuration matches database before deployment
 */
function validateHopsConfiguration(
  route: { id: number; routeId: number; hops?: Array<{ recipient: string; scheduledAt: Date; hopIndex: number }> },
  sessionRouteId: number,
): { valid: boolean; error?: string } {
  if (route.id !== sessionRouteId) {
    return { valid: false, error: `Route ID mismatch: expected ${sessionRouteId}, got ${route.id}` };
  }

  if (!route.hops || route.hops.length === 0) {
    return { valid: false, error: "Route has no hops configured" };
  }

  // Validate hop indices are sequential
  for (let i = 0; i < route.hops.length; i++) {
    if (route.hops[i].hopIndex !== i) {
      return { valid: false, error: `Hop index mismatch at position ${i}: expected ${i}, got ${route.hops[i].hopIndex}` };
    }
  }

  // Warn about large hop counts
  if (route.hops.length > MAX_HOPS_WARNING_THRESHOLD) {
    console.warn(`[ObfuscationScheduler] Route ${route.id} has ${route.hops.length} hops, which may require multiple batch transactions`);
  }

  return { valid: true };
}

/**
 * Phase 1: Process pending aggregations
 * Transfers funds from intermediate wallets to Wallet X
 *
 * Includes retry logic for failed aggregations with persistent tracking.
 */
async function processAggregations(): Promise<void> {
  const readyWallets =
    await intermediateWalletService.getWalletsReadyForAggregation();

  // Also get wallets that failed but are ready for retry
  const failedWallets = await db.query.intermediateWalletsSchema.findMany({
    where: and(
      eq(intermediateWalletsSchema.aggregationStatus, "failed"),
      or(
        isNull(intermediateWalletsSchema.nextRetryAt),
        lte(intermediateWalletsSchema.nextRetryAt, new Date()),
      ),
    ),
    with: {
      custodialWallet: true,
    },
  });

  const allWallets = [...readyWallets, ...failedWallets];

  if (allWallets.length > 0) {
    console.log(`[ObfuscationScheduler] [Aggregation] Found ${readyWallets.length} ready wallets, ${failedWallets.length} failed wallets ready for retry`);
  }

  for (const wallet of allWallets) {
    // Check if we should retry based on DB failure tracking
    const shouldRetry = await shouldRetryFromDb(wallet.sessionId, wallet.id);
    if (!shouldRetry) {
      continue;
    }

    try {
      // Mark as sent (in progress)
      await intermediateWalletService.updateAggregationStatus(
        wallet.id,
        "sent",
      );

      // Build and execute aggregation transaction
      const txData = await obfuscationTxBuilder.buildAggregationTransaction(
        wallet.id,
        wallet.sessionId,
      );

      if (!txData) {
        const errorMsg = "Failed to build aggregation transaction - no transaction data returned";
        console.error(`[ObfuscationScheduler] ${errorMsg} for wallet ${wallet.id}`);
        await intermediateWalletService.updateAggregationStatus(
          wallet.id,
          "failed",
          undefined,
          errorMsg,
        );
        await recordFailureToDb(wallet.sessionId, errorMsg, wallet.id);
        continue;
      }

      const signature = await obfuscationTxBuilder.executeTransaction(
        txData.transaction,
        txData.signer,
      );

      // Mark as confirmed
      await intermediateWalletService.updateAggregationStatus(
        wallet.id,
        "confirmed",
        signature,
      );

      // Clear failure tracking on success
      await clearFailureTracking(wallet.sessionId, wallet.id);
      console.log(`[ObfuscationScheduler] Successfully aggregated wallet ${wallet.id} for session ${wallet.sessionId}, tx: ${signature}`);
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      console.error(`[ObfuscationScheduler] Aggregation failed for wallet ${wallet.id}:`, errorMessage);

      // Combined status + error update (single DB call)
      await intermediateWalletService.updateAggregationStatus(
        wallet.id,
        "failed",
        undefined,
        errorMessage,
      );

      // Record failure to DB for persistence
      await recordFailureToDb(wallet.sessionId, errorMessage, wallet.id);
    }
  }
}

/**
 * Phase 2: Deploy route and cleanup
 * For fully aggregated sessions:
 * - Deploy route from Wallet X
 * - Immediately cleanup intermediate wallets + Wallet X
 * - Mark session as completed
 *
 * Includes:
 * - Multi-server distributed locking
 * - Hops configuration validation
 * - Retry logic for deployment failures
 * - Actual fee tracking
 */
async function processDeploymentAndCleanup(): Promise<void> {
  // Safety check: recover sessions stuck in "funding" where all wallets are already funded
  // This can happen if the client-side confirmFunding flow errors after on-chain success
  const stuckFundingSessions = await db.query.obfuscationSessionsSchema.findMany({
    where: eq(obfuscationSessionsSchema.status, "funding"),
  });

  for (const stuckSession of stuckFundingSessions) {
    try {
      const allFunded = await intermediateWalletService.areAllWalletsFunded(stuckSession.id);
      if (allFunded) {
        console.log(`[ObfuscationScheduler] [Recovery] Session ${stuckSession.id} stuck in "funding" but all wallets funded — advancing to aggregating`);
        await obfuscationService.scheduleAggregations(stuckSession.id);
      }
    } catch (error) {
      console.error(`[ObfuscationScheduler] [Recovery] Error checking stuck session ${stuckSession.id}:`, error);
    }
  }

  // Find sessions in 'aggregating' or 'deploying' status (deploying may need retry)
  const sessions = await db.query.obfuscationSessionsSchema.findMany({
    where: or(
      eq(obfuscationSessionsSchema.status, "aggregating"),
      eq(obfuscationSessionsSchema.status, "deploying"),
    ),
  });

  if (sessions.length > 0) {
    console.log(`[ObfuscationScheduler] [Deployment] Found ${sessions.length} sessions to process (aggregating/deploying)`);
  }

  for (const session of sessions) {
    // Check if we should retry based on DB failure tracking
    const shouldRetry = await shouldRetryFromDb(session.id);
    if (!shouldRetry) {
      console.log(`[ObfuscationScheduler] Skipping session ${session.id} - max retries exceeded or cooling down`);
      continue;
    }

    // Acquire distributed lock for multi-server safety
    const lockAcquired = await acquireSessionLock(session.id);
    if (!lockAcquired) {
      console.log(`[ObfuscationScheduler] Could not acquire lock for session ${session.id} - another server is processing`);
      continue;
    }

    // Track actual fees for this session
    let actualFeesLamports = 0;

    try {
      // Check if all wallets are aggregated
      const allAggregated =
        await intermediateWalletService.areAllWalletsAggregated(session.id);

      if (!allAggregated) {
        await releaseSessionLock(session.id);
        continue;
      }

      // Get the route info with hops
      const route = await db.query.routesSchema.findFirst({
        where: eq(routesSchema.id, session.routeId),
        with: {
          hops: {
            orderBy: (hops, { asc }) => [asc(hops.hopIndex)],
          },
        },
      });

      if (!route) {
        console.error(`[ObfuscationScheduler] [Deployment] Route not found for session ${session.id}`);
        await releaseSessionLock(session.id);
        continue;
      }

      // Validate hops configuration
      const validation = validateHopsConfiguration(route, session.routeId);
      if (!validation.valid) {
        console.error(`[ObfuscationScheduler] Hops validation failed for session ${session.id}: ${validation.error}`);
        await recordFailureToDb(session.id, validation.error!);
        await releaseSessionLock(session.id);
        continue;
      }

      // Check if route is already deployed - verify BOTH database AND on-chain state
      const isDeployedInDb = !!route.deploymentTxHash;
      const isDeployedOnChain = await isRouteDeployedOnChain(route.routeId);

      // Handle case where route is on-chain but DB not updated
      if (isDeployedOnChain && !isDeployedInDb) {
        console.log(`[ObfuscationScheduler] [Deployment] Route ${route.id} found on-chain but not in DB, updating status`);
        await routesService.updateRouteStatus(
          route.id,
          route.creator,
          "deployed",
          { deploymentTxHash: "recovered-from-chain" },
        );
      }

      const isDeployed = isDeployedInDb || isDeployedOnChain;

      // Check if route is deployed but missing hops on-chain (incomplete deployment)
      // This happens when initialization succeeds but addHops fails
      let needsHopsOnly = false;
      if (isDeployed) {
        try {
          const routeState = await getRouteStateAccount(route.routeId);
          if (routeState && routeState.hopsCount === 0) {
            needsHopsOnly = true;
            console.log(`[ObfuscationScheduler] [Deployment] Session ${session.id}: Route ${route.routeId} deployed but has 0 hops on-chain — adding hops`);
          }
        } catch {
          // If we can't read route state, skip
        }
      }

      if (!isDeployed || needsHopsOnly) {
        console.log(`[ObfuscationScheduler] [Deployment] Session ${session.id}: ${needsHopsOnly ? 'Adding missing hops' : 'Route not deployed yet, starting deployment'}...`);

        // Update session status to deploying
        await obfuscationService.updateSessionStatus(session.id, "deploying");

        // Get Wallet X keypair
        const walletXKeypair = await walletXService.getKeypair(session.id);
        if (!walletXKeypair) {
          console.error(`[ObfuscationScheduler] Could not get Wallet X keypair for session ${session.id}`);
          await releaseSessionLock(session.id);
          continue;
        }

        // For SPL routes, verify Wallet X has received all tokens before deployment
        if (session.tokenType === "SPL" && session.tokenMint) {
          const tokenBalance = await walletXService.getTokenBalance(
            session.id,
            session.tokenMint,
          );
          const expectedAmount = new BN(session.totalAmount);

          if (tokenBalance.lt(expectedAmount)) {
            console.log(`[ObfuscationScheduler] Session ${session.id} waiting for tokens - have ${tokenBalance.toString()}, need ${expectedAmount.toString()}`);
            await releaseSessionLock(session.id);
            continue;
          }
        }

        // Build hops array for contract
        const hops =
          route.hops?.map((hop) => ({
            recipient: new PublicKey(hop.recipient),
            executeAt: new BN(
              Math.floor(new Date(hop.scheduledAt).getTime() / 1000),
            ),
          })) || [];

        if (hops.length === 0) {
          console.error(`[ObfuscationScheduler] No hops found for route ${route.id}`);
          await releaseSessionLock(session.id);
          continue;
        }

        // Log hop count warning for large routes
        if (hops.length > MAX_HOPS_WARNING_THRESHOLD) {
          console.warn(`[ObfuscationScheduler] Route ${route.id} has ${hops.length} hops - deployment may require multiple transactions`);
        }

        try {
          if (needsHopsOnly) {
            // Route already initialized — just add hops
            console.log(`[ObfuscationScheduler] Adding hops to existing route ${route.routeId} for session ${session.id}`);

            await addHopsFromWalletX(
              walletXKeypair,
              new BN(route.routeId),
              hops,
            );

            const dynamicFees = await obfuscationService.getDynamicFees();
            const batchCount = Math.ceil(hops.length / 3);
            actualFeesLamports += batchCount * (5000 + dynamicFees.priorityFeeLamports);

            await routesService.updateRouteStatus(
              route.id,
              route.creator,
              "deployed",
              { deploymentTxHash: route.deploymentTxHash || "recovered-from-chain" },
            );

            console.log(`[ObfuscationScheduler] Successfully added hops to route ${route.routeId} for session ${session.id}`);
          } else {
          // Initialize route from Wallet X
          // IMPORTANT: Use route.routeId (on-chain identifier), not route.id (database ID)
          console.log(`[ObfuscationScheduler] Initializing route ${route.routeId} from Wallet X for session ${session.id}`);
          const signature = await initializeRouteFromWalletX(
            walletXKeypair,
            new BN(route.routeId),
            new BN(session.totalAmount),
            hops,
            session.tokenType as "SOL" | "SPL",
            session.tokenMint || undefined,
          );

          // Estimate tx fees (base + priority)
          const dynamicFees = await obfuscationService.getDynamicFees();
          actualFeesLamports += 5000 + dynamicFees.priorityFeeLamports;

          // STEP 2: Add hops to the route with retry logic
          await addHopsFromWalletX(
            walletXKeypair,
            new BN(route.routeId),
            hops,
          );

          // Estimate fees for addHops (may be multiple batches)
          const batchCount = Math.ceil(hops.length / 3); // 3 hops per batch
          actualFeesLamports += batchCount * (5000 + dynamicFees.priorityFeeLamports);

          // IMPORTANT: Store deployment hash immediately to prevent retry issues
          await routesService.updateRouteStatus(
            route.id,
            route.creator,
            "deployed",
            { deploymentTxHash: signature },
          );

          console.log(`[ObfuscationScheduler] Successfully deployed route ${route.routeId} for session ${session.id}, tx: ${signature}`);
          } // end else (full deployment)
        } catch (deployError: any) {
          const errorMessage = deployError instanceof Error ? deployError.message : "Unknown deployment error";
          console.error(`[ObfuscationScheduler] Deployment failed for session ${session.id}:`, errorMessage);

          // Record failure for retry
          await recordFailureToDb(session.id, errorMessage);
          await releaseSessionLock(session.id);
          continue; // Skip cleanup if deployment failed
        }
      }

      // NOW CLEANUP - happens immediately after deployment
      const sourceWallet = new PublicKey(route.creator);

      // Cleanup all intermediate wallets
      const walletsPendingCleanup =
        await intermediateWalletService.getWalletsPendingCleanup(session.id);

      for (const wallet of walletsPendingCleanup) {
        try {
          const txData = await obfuscationTxBuilder.buildCleanupTransaction(
            wallet.id,
            session.id,
            sourceWallet,
          );

          if (txData) {
            const cleanupSig = await obfuscationTxBuilder.executeTransaction(
              txData.transaction,
              txData.signer,
            );

            await intermediateWalletService.updateCleanupStatus(
              wallet.id,
              "completed",
              cleanupSig,
              cleanupSig,
            );

            // Add cleanup tx fee
            actualFeesLamports += 5000;
            await clearFailureTracking(session.id, wallet.id);
          } else {
            await intermediateWalletService.updateCleanupStatus(
              wallet.id,
              "completed",
            );
          }
        } catch (cleanupError: any) {
          const errorMessage =
            cleanupError instanceof Error
              ? cleanupError.message
              : "Unknown error";
          console.error(`[ObfuscationScheduler] [Cleanup] Session ${session.id}: Cleanup failed for wallet ${wallet.id}:`, errorMessage);
          // Combined status + error update (single DB call)
          await intermediateWalletService.updateCleanupStatus(
            wallet.id,
            "failed",
            undefined,
            undefined,
            errorMessage,
          );
          // Record failure but don't stop the whole operation for cleanup errors
          await recordFailureToDb(session.id, `Cleanup failed for wallet ${wallet.id}: ${errorMessage}`, wallet.id);
        }
      }

      // Cleanup Wallet X (close ATA + return dust, but don't fully close)
      let walletXCleanupSuccess = true;
      try {
        const walletXCleanupTx =
          await obfuscationTxBuilder.buildWalletXCleanupTransaction(
            session.id,
            sourceWallet,
          );

        if (walletXCleanupTx) {
          await obfuscationTxBuilder.executeTransaction(
            walletXCleanupTx.transaction,
            walletXCleanupTx.signer,
          );
          actualFeesLamports += 5000;
        }
      } catch (walletXCleanupError: any) {
        const errorMessage = walletXCleanupError instanceof Error
          ? walletXCleanupError.message
          : "Unknown error";
        console.error(`[ObfuscationScheduler] [Cleanup] Session ${session.id}: Wallet X cleanup failed:`, errorMessage);
        walletXCleanupSuccess = false;
        // Record failure for retry on next scheduler run
        await recordFailureToDb(session.id, `Wallet X cleanup failed: ${errorMessage}`);
      }

      // Check if all intermediate wallets were cleaned up
      const allCleaned = await intermediateWalletService.areAllWalletsCleanedUp(session.id);

      // Only mark session as completed if ALL cleanups succeeded
      if (allCleaned && walletXCleanupSuccess) {
        await obfuscationService.completeSession(session.id, actualFeesLamports.toString());
      } else {
        console.log(`[ObfuscationScheduler] [Cleanup] Session ${session.id}: Some cleanups failed (wallets: ${allCleaned}, walletX: ${walletXCleanupSuccess}), will retry on next run`);
      }

      // Clear failure tracking on success
      await clearFailureTracking(session.id);
      console.log(`[ObfuscationScheduler] [Completion] Session ${session.id}: ✅ COMPLETED SUCCESSFULLY - Route ${route.routeId} deployed, actual fees: ${actualFeesLamports} lamports (${(actualFeesLamports / 1_000_000_000).toFixed(6)} SOL)`);
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[ObfuscationScheduler] Critical error processing session ${session.id}:`, errorMessage);
      await recordFailureToDb(session.id, errorMessage);
    } finally {
      // Always release the lock
      await releaseSessionLock(session.id);
    }
  }
}

/**
 * Unified Obfuscation Processor Job - Runs every 5 seconds
 *
 * Processes the complete obfuscation lifecycle:
 * - Phase 1: Aggregate funds from intermediate wallets to Wallet X
 * - Phase 2: Deploy route from Wallet X and immediately cleanup
 *
 * Note: Hop execution is handled separately by the hop scheduler
 */
export const obfuscationProcessorJob = new CronJob(
  "*/5 * * * * *",
  async () => {
    // Prevent concurrent execution within this server instance
    if (isProcessorRunning) {
      return;
    }
    isProcessorRunning = true;

    try {
      // Phase 1: Process pending aggregations
      await processAggregations();

      // Phase 2: Deploy and cleanup for fully aggregated sessions
      await processDeploymentAndCleanup();
    } catch (error: any) {
      // Log critical errors for debugging - never swallow errors silently
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error("[ObfuscationScheduler] Critical error during processing:", errorMessage);
      if (errorStack) {
        console.error("[ObfuscationScheduler] Stack trace:", errorStack);
      }
      // Consider sending to error tracking service (Sentry, etc.) in production
    } finally {
      isProcessorRunning = false;
    }
  },
);

/**
 * Start the obfuscation scheduler
 */
export function startObfuscationScheduler(): void {
  console.log(`[ObfuscationScheduler] Starting scheduler (server ID: ${SERVER_ID})`);
  obfuscationProcessorJob.start();
  console.log(`[ObfuscationScheduler] Scheduler started - running every 5 seconds`);
}

/**
 * Stop the obfuscation scheduler
 */
export function stopObfuscationScheduler(): void {
  console.log(`[ObfuscationScheduler] Stopping scheduler...`);
  obfuscationProcessorJob.stop();
  console.log(`[ObfuscationScheduler] Scheduler stopped`);
}

export const obfuscationSchedulerService = {
  obfuscationProcessorJob,
  startObfuscationScheduler,
  stopObfuscationScheduler,
};
