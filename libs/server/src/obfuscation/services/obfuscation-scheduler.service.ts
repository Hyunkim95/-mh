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
  isExtraAccountMetasInitialized,
  initializeExtraAccountMetasForRoute,
} from "../../solana/services/contract.service";
import routesService from "../../routes/services/routes.service";
import { hopsService } from "../../hops/services/hops.service";
import { createLogger } from "@libs/logger";
import { trace, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import {
  obfuscationSessionCounter,
  obfuscationDuration,
} from "../../telemetry/metrics";

const log = createLogger("ObfuscationScheduler");
const tracer = trace.getTracer("multihopper.scheduler.obfuscation");

// Constants (configurable via env vars for e2e testing with shorter values)
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_COOLDOWN_MS = Number(process.env.OBFUSCATION_RETRY_COOLDOWN_MS) || 5 * 60 * 1000; // default 5 minutes
const MAX_PERMANENT_FAILURES = 15; // Stop retrying entirely after this many failures
const LOCK_TIMEOUT_MS = Number(process.env.OBFUSCATION_LOCK_TIMEOUT_MS) || 5 * 60 * 1000; // default 5 minutes
const PER_SESSION_TIMEOUT_MS = Number(process.env.OBFUSCATION_SESSION_TIMEOUT_MS) || 4 * 60 * 1000; // default 4 minutes
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
    const [updatedWallet] = await db
      .update(intermediateWalletsSchema)
      .set({
        lastError: error,
        failureCount: sql`COALESCE(${intermediateWalletsSchema.failureCount}, 0) + 1`,
        lastFailureAt: now,
        nextRetryAt: nextRetryAt,
        updatedAt: now,
      })
      .where(eq(intermediateWalletsSchema.id, walletId))
      .returning({
        failureCount: intermediateWalletsSchema.failureCount,
      });

    if (updatedWallet?.failureCount === MAX_PERMANENT_FAILURES) {
      let balanceInfo = "";
      try {
        const pubkey = await intermediateWalletService.getPublicKeyForWallet(walletId);
        if (pubkey) {
          const balance = await obfuscationService.getConnection().getBalance(pubkey);
          balanceInfo = ` — ${balance} lamports (${(balance / 1_000_000_000).toFixed(4)} SOL) locked`;
        }
      } catch {
        // Do not let balance lookup interfere with failure persistence.
      }

      log.error(
        `[PERMANENT_FAILURE] Session ${sessionId} wallet ${walletId}: exceeded ${MAX_PERMANENT_FAILURES} failures${balanceInfo} — manual intervention required.`
      );
    }
  } else {
    // Update session failure tracking
    const [updatedSession] = await db
      .update(obfuscationSessionsSchema)
      .set({
        lastError: error,
        failureCount: sql`COALESCE(${obfuscationSessionsSchema.failureCount}, 0) + 1`,
        lastFailureAt: now,
        nextRetryAt: nextRetryAt,
      })
      .where(eq(obfuscationSessionsSchema.id, sessionId))
      .returning({
        failureCount: obfuscationSessionsSchema.failureCount,
      });

    if (updatedSession?.failureCount === MAX_PERMANENT_FAILURES) {
      let balanceInfo = "";
      try {
        const walletXBalance = await walletXService.getSOLBalance(sessionId);
        balanceInfo = ` — Wallet X: ${walletXBalance.toString()} lamports (${(walletXBalance.toNumber() / 1_000_000_000).toFixed(4)} SOL) locked`;
      } catch {
        // Do not let balance lookup interfere with failure persistence.
      }

      log.error(
        `[PERMANENT_FAILURE] Session ${sessionId}: exceeded ${MAX_PERMANENT_FAILURES} failures${balanceInfo} — manual intervention required.`
      );
    }
  }

  log.error(`Recorded failure for session ${sessionId}${walletId ? ` wallet ${walletId}` : ''}: ${error}`);
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
      let balanceInfo = "";
      try {
        const pubkey = await intermediateWalletService.getPublicKeyForWallet(walletId);
        if (pubkey) {
          const balance = await obfuscationService.getConnection().getBalance(pubkey);
          balanceInfo = ` — ${balance} lamports (${(balance / 1_000_000_000).toFixed(4)} SOL) locked`;
        }
      } catch { /* don't let RPC failure break retry logic */ }
      log.error(`[PERMANENT_FAILURE] Session ${sessionId} wallet ${walletId}: exceeded ${MAX_PERMANENT_FAILURES} failures${balanceInfo} — manual intervention required.`);
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
      let balanceInfo = "";
      try {
        const walletXBalance = await walletXService.getSOLBalance(sessionId);
        balanceInfo = ` — Wallet X: ${walletXBalance.toString()} lamports (${(walletXBalance.toNumber() / 1_000_000_000).toFixed(4)} SOL) locked`;
      } catch { /* don't let RPC failure break retry logic */ }
      log.error(`[PERMANENT_FAILURE] Session ${sessionId}: exceeded ${MAX_PERMANENT_FAILURES} failures${balanceInfo} — manual intervention required.`);
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
    log.warn(`Failed to acquire lock for session ${sessionId}:`, error);
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
    log.warn(`Failed to release lock for session ${sessionId}:`, error);
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
    log.warn(`Route ${route.id} has ${route.hops.length} hops, which may require multiple batch transactions`);
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
    log.info(`[Aggregation] Found ${readyWallets.length} ready wallets, ${failedWallets.length} failed wallets ready for retry`);
  }

  for (const wallet of allWallets) {
    // Check if we should retry based on DB failure tracking
    const shouldRetry = await shouldRetryFromDb(wallet.sessionId, wallet.id);
    if (!shouldRetry) {
      continue;
    }

    try {
      // Atomically claim wallet — prevents two servers from processing the same wallet.
      // Returns false if another server already claimed it (status no longer "scheduled"/"failed").
      const claimed = await intermediateWalletService.claimWalletForAggregation(wallet.id);
      if (!claimed) {
        log.info(`[Aggregation] Wallet ${wallet.id} already claimed by another server, skipping`);
        continue;
      }

      // Build and execute aggregation transaction
      const txData = await obfuscationTxBuilder.buildAggregationTransaction(
        wallet.id,
        wallet.sessionId,
      );

      if (!txData) {
        const errorMsg = "Failed to build aggregation transaction - no transaction data returned";
        log.error(`${errorMsg} for wallet ${wallet.id}`);
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
      log.info(`Successfully aggregated wallet ${wallet.id} for session ${wallet.sessionId}, tx: ${signature}`);
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      log.error(`Aggregation failed for wallet ${wallet.id}:`, errorMessage);

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
        log.info(`[Recovery] Session ${stuckSession.id} stuck in "funding" but all wallets funded — advancing to aggregating`);
        await obfuscationService.scheduleAggregations(stuckSession.id);
      }
    } catch (error) {
      log.error(`[Recovery] Error checking stuck session ${stuckSession.id}:`, error);
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
    log.info(`[Deployment] Found ${sessions.length} sessions to process (aggregating/deploying)`);
  }

  for (const session of sessions) {
    // Check if we should retry based on DB failure tracking
    const shouldRetry = await shouldRetryFromDb(session.id);
    if (!shouldRetry) {
      log.info(`Skipping session ${session.id} - max retries exceeded or cooling down`);
      continue;
    }

    // Acquire distributed lock for multi-server safety
    const lockAcquired = await acquireSessionLock(session.id);
    if (!lockAcquired) {
      log.info(`Could not acquire lock for session ${session.id} - another server is processing`);
      continue;
    }

    // Track actual fees for this session
    let actualFeesLamports = 0;

    // Per-session timeout: prevents one slow session from starving all others.
    // The timeout rejects into the catch block which records the failure and
    // the finally block releases the lock.
    let sessionTimeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      sessionTimeout = setTimeout(() => {
        reject(new Error(`Session ${session.id} timed out after ${PER_SESSION_TIMEOUT_MS / 1000}s`));
      }, PER_SESSION_TIMEOUT_MS);
    });

    try {
      await Promise.race([timeoutPromise, (async () => {
      // Check if all wallets are aggregated
      const allAggregated =
        await intermediateWalletService.areAllWalletsAggregated(session.id);

      if (!allAggregated) {
        return;
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
        log.error(`[Deployment] Route not found for session ${session.id}`);
        return;
      }

      // Validate hops configuration
      const validation = validateHopsConfiguration(route, session.routeId);
      if (!validation.valid) {
        log.error(`Hops validation failed for session ${session.id}: ${validation.error}`);
        await recordFailureToDb(session.id, validation.error!);
        return;
      }

      // Check if route is already deployed - verify BOTH database AND on-chain state
      const isDeployedInDb = !!route.deploymentTxHash;
      const isDeployedOnChain = await isRouteDeployedOnChain(route.routeId);

      // Handle case where route is on-chain but DB not updated
      if (isDeployedOnChain && !isDeployedInDb) {
        log.info(`[Deployment] Route ${route.id} found on-chain but not in DB, updating status`);
        await routesService.updateRouteStatus(
          route.id,
          route.creator,
          "deployed",
          { deploymentTxHash: "recovered-from-chain" },
        );
      }

      // If route is on-chain, verify ExtraAccountMetaList is initialized.
      // The setup tx (ExtraAccountMetaList init) can fail independently of the main
      // deployment tx. Without it, TransferChecked fails with InvalidAccountData.
      if (isDeployedOnChain) {
        const hasExtraMetas = await isExtraAccountMetasInitialized(route.routeId);
        if (!hasExtraMetas) {
          log.warn(`[Deployment] Route ${route.routeId}: ExtraAccountMetaList missing — initializing`);
          const walletXKeypair = await walletXService.getKeypair(session.id);
          if (walletXKeypair) {
            try {
              await initializeExtraAccountMetasForRoute(route.routeId, walletXKeypair);
              log.info(`[Deployment] Route ${route.routeId}: ExtraAccountMetaList initialized`);
            } catch (metaError: any) {
              log.error(`[Deployment] Route ${route.routeId}: Failed to init ExtraAccountMetaList: ${metaError.message}`);
              await recordFailureToDb(session.id, `ExtraAccountMetaList init failed: ${metaError.message}`);
              return;
            }
          }
        }
      }

      const isDeployed = isDeployedInDb || isDeployedOnChain;

      // Check if route is deployed but missing hops on-chain (incomplete deployment)
      // This happens when initialization succeeds but addHops fails (partially or fully)
      let needsHopsOnly = false;
      if (isDeployed) {
        try {
          const routeState = await getRouteStateAccount(route.routeId);
          const expectedHops = route.hops?.length || 0;
          if (routeState && routeState.hopsCount < expectedHops) {
            needsHopsOnly = true;
            log.info(`[Deployment] Session ${session.id}: Route ${route.routeId} deployed but has ${routeState.hopsCount}/${expectedHops} hops on-chain — adding missing hops`);
          }
        } catch {
          // If we can't read route state, skip
        }
      }

      if (!isDeployed || needsHopsOnly) {
        log.info(`[Deployment] Session ${session.id}: ${needsHopsOnly ? 'Adding missing hops' : 'Route not deployed yet, starting deployment'}...`);

        // Update session status to deploying
        await obfuscationService.updateSessionStatus(session.id, "deploying");

        // Get Wallet X keypair
        const walletXKeypair = await walletXService.getKeypair(session.id);
        if (!walletXKeypair) {
          log.error(`Could not get Wallet X keypair for session ${session.id}`);
          return;
        }

        // For SPL routes, verify Wallet X has received all tokens before deployment
        if (session.tokenType === "SPL" && session.tokenMint) {
          const tokenBalance = await walletXService.getTokenBalance(
            session.id,
            session.tokenMint,
          );
          const expectedAmount = new BN(session.totalAmount);

          if (tokenBalance.lt(expectedAmount)) {
            log.info(`Session ${session.id} waiting for tokens - have ${tokenBalance.toString()}, need ${expectedAmount.toString()}`);
            return;
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
          log.error(`No hops found for route ${route.id}`);
          return;
        }

        // Log hop count warning for large routes
        if (hops.length > MAX_HOPS_WARNING_THRESHOLD) {
          log.warn(`Route ${route.id} has ${hops.length} hops - deployment may require multiple transactions`);
        }

        try {
          if (needsHopsOnly) {
            // Route already initialized — just add hops
            log.info(`Adding hops to existing route ${route.routeId} for session ${session.id}`);

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

            // Shift hop schedules to account for obfuscation delay
            await hopsService.shiftHopSchedulesAfterDeployment(route.id);

            log.info(`Successfully added hops to route ${route.routeId} for session ${session.id}`);
          } else {
          // Initialize route from Wallet X
          // IMPORTANT: Use route.routeId (on-chain identifier), not route.id (database ID)
          log.info(`Initializing route ${route.routeId} from Wallet X for session ${session.id}`);
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

          // Shift hop schedules to account for obfuscation delay
          await hopsService.shiftHopSchedulesAfterDeployment(route.id);

          log.info(`Successfully deployed route ${route.routeId} for session ${session.id}, tx: ${signature}`);
          } // end else (full deployment)
        } catch (deployError: any) {
          const errorMessage = deployError instanceof Error ? deployError.message : "Unknown deployment error";
          log.error(`Deployment failed for session ${session.id}:`, errorMessage);

          // Record failure for retry
          await recordFailureToDb(session.id, errorMessage);
          return; // Skip cleanup if deployment failed
        }
      }

      // NOW CLEANUP - happens immediately after deployment
      const sourceWallet = new PublicKey(route.creator);

      // Fetch fees once for cleanup fee tracking (cached, essentially free)
      const cleanupDynamicFees = await obfuscationService.getDynamicFees();

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

            // Add cleanup tx fee (base + priority, consistent with deployment tracking)
            actualFeesLamports += 5000 + cleanupDynamicFees.priorityFeeLamports;
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
          log.error(`[Cleanup] Session ${session.id}: Cleanup failed for wallet ${wallet.id}:`, errorMessage);

          // Immediate retry: handles TOCTOU race where balance changed between
          // getBalance() and on-chain execution (e.g. another server cleaned up).
          // Re-querying balance now returns 0 → buildCleanup returns null → completed.
          try {
            const retryTxData = await obfuscationTxBuilder.buildCleanupTransaction(
              wallet.id,
              session.id,
              sourceWallet,
            );
            if (retryTxData) {
              const retrySig = await obfuscationTxBuilder.executeTransaction(
                retryTxData.transaction,
                retryTxData.signer,
              );
              await intermediateWalletService.updateCleanupStatus(
                wallet.id,
                "completed",
                retrySig,
                retrySig,
              );
              actualFeesLamports += 5000 + cleanupDynamicFees.priorityFeeLamports;
              await clearFailureTracking(session.id, wallet.id);
              continue;
            } else {
              // Balance is 0 or below fee — account already drained, mark completed
              await intermediateWalletService.updateCleanupStatus(
                wallet.id,
                "completed",
              );
              await clearFailureTracking(session.id, wallet.id);
              continue;
            }
          } catch (retryError) {
            // Retry also failed — fall through to record failure for next tick
            log.error(`[Cleanup] Session ${session.id}: Retry also failed for wallet ${wallet.id}`);
          }

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
          actualFeesLamports += 5000 + cleanupDynamicFees.priorityFeeLamports;
        } else {
          // Cleanup returned null — balance may be too low to cover tx fee.
          // Check if Wallet X still holds dust. If so, retry on next tick
          // when fees may be lower and the cleanup can succeed.
          const walletXBalance = await walletXService.getSOLBalance(session.id);
          if (walletXBalance.gtn(0)) {
            log.warn(`[Cleanup] Session ${session.id}: Wallet X cleanup skipped (balance ${walletXBalance.toString()} below tx fee) — will retry`);
            walletXCleanupSuccess = false;
            await recordFailureToDb(session.id, `Wallet X cleanup skipped: balance ${walletXBalance.toString()} lamports below tx fee`);
          }
        }
      } catch (walletXCleanupError: any) {
        const errorMessage = walletXCleanupError instanceof Error
          ? walletXCleanupError.message
          : "Unknown error";
        log.error(`[Cleanup] Session ${session.id}: Wallet X cleanup failed:`, errorMessage);
        walletXCleanupSuccess = false;
        // Record failure for retry on next scheduler run
        await recordFailureToDb(session.id, `Wallet X cleanup failed: ${errorMessage}`);
      }

      // Check if all intermediate wallets were cleaned up
      const allCleaned = await intermediateWalletService.areAllWalletsCleanedUp(session.id);

      // Only mark session as completed if ALL cleanups succeeded
      if (allCleaned && walletXCleanupSuccess) {
        await obfuscationService.completeSession(session.id, actualFeesLamports.toString());
        await clearFailureTracking(session.id);
        obfuscationSessionCounter.add(1, { status: "completed" });
        log.info(`[Completion] Session ${session.id}: COMPLETED SUCCESSFULLY - Route ${route.routeId} deployed, actual fees: ${actualFeesLamports} lamports (${(actualFeesLamports / 1_000_000_000).toFixed(6)} SOL)`);
      } else {
        log.info(`[Cleanup] Session ${session.id}: Some cleanups failed (wallets: ${allCleaned}, walletX: ${walletXCleanupSuccess}), will retry on next run`);
      }
      })()]); // end Promise.race + async IIFE
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      log.error(`Critical error processing session ${session.id}:`, errorMessage);
      await recordFailureToDb(session.id, errorMessage);
    } finally {
      // Clear the timeout to avoid leaking timers
      if (sessionTimeout) clearTimeout(sessionTimeout);
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

    await tracer.startActiveSpan(
      "scheduler.obfuscation.tick",
      { kind: SpanKind.INTERNAL, attributes: { "scheduler.name": "obfuscation" } },
      async (tickSpan) => {
    const tickStart = performance.now();
    try {
      // Phase 1: Process pending aggregations
      await processAggregations();

      // Phase 2: Deploy and cleanup for fully aggregated sessions
      await processDeploymentAndCleanup();

      tickSpan.setStatus({ code: SpanStatusCode.OK });
    } catch (error: any) {
      // Log critical errors for debugging - never swallow errors silently
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      log.error("Critical error during processing:", errorMessage);
      if (errorStack) {
        log.error("Stack trace:", errorStack);
      }
      tickSpan.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
      if (error instanceof Error) tickSpan.recordException(error);
    } finally {
      obfuscationDuration.record(Math.round(performance.now() - tickStart));
      tickSpan.end();
      isProcessorRunning = false;
    }
    }); // end tracer.startActiveSpan
  },
);

/**
 * Start the obfuscation scheduler
 */
export function startObfuscationScheduler(): void {
  log.info(`Starting scheduler (server ID: ${SERVER_ID})`);
  obfuscationProcessorJob.start();
  log.info(`Scheduler started - running every 5 seconds`);
}

/**
 * Stop the obfuscation scheduler
 */
export function stopObfuscationScheduler(): void {
  log.info(`Stopping scheduler...`);
  obfuscationProcessorJob.stop();
  log.info(`Scheduler stopped`);
}

export const obfuscationSchedulerService = {
  obfuscationProcessorJob,
  startObfuscationScheduler,
  stopObfuscationScheduler,
};
