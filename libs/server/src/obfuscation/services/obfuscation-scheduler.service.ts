import { CronJob } from "cron";
import { eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { db } from "../../db";
import { obfuscationSessionsSchema } from "../schema/obfuscation.schema";
import { routesSchema } from "../../routes/schema/route.schema";
import { obfuscationService } from "./obfuscation.service";
import { intermediateWalletService } from "./intermediate-wallet.service";
import { walletXService } from "./wallet-x.service";
import { obfuscationTxBuilder } from "./obfuscation-tx-builder.service";
import {
  initializeRouteFromWalletX,
  addHopsFromWalletX,
  isRouteDeployedOnChain,
  getRouteConfigPda,
} from "../../solana/services/contract.service";
import routesService from "../../routes/services/routes.service";

// Constants
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Track failed operations
interface FailedOperation {
  id: string; // sessionId_walletIndex_type
  failureCount: number;
  lastAttempt: Date;
  lastError?: string;
}
const failedOperations = new Map<string, FailedOperation>();

// Lock to prevent concurrent job execution
let isProcessorRunning = false;

/**
 * Record a failed operation for retry tracking
 */
function recordFailure(operationId: string, error: string): void {
  const existing = failedOperations.get(operationId);
  const now = new Date();

  if (existing) {
    existing.failureCount++;
    existing.lastAttempt = now;
    existing.lastError = error;
  } else {
    failedOperations.set(operationId, {
      id: operationId,
      failureCount: 1,
      lastAttempt: now,
      lastError: error,
    });
  }

}


/**
 * Check if an operation should be retried
 */
function shouldRetry(operationId: string): boolean {
  const info = failedOperations.get(operationId);
  if (!info) return true;

  if (info.failureCount >= MAX_RETRY_ATTEMPTS) {
    const timeSinceLastAttempt = Date.now() - info.lastAttempt.getTime();
    return timeSinceLastAttempt >= RETRY_COOLDOWN_MS;
  }

  return true;
}

/**
 * Phase 1: Process pending aggregations
 * Transfers funds from intermediate wallets to Wallet X
 */
async function processAggregations(): Promise<void> {
  const readyWallets =
    await intermediateWalletService.getWalletsReadyForAggregation();

  for (const wallet of readyWallets) {
    const operationId = `${wallet.sessionId}_${wallet.walletIndex}_aggregate`;
    if (!shouldRetry(operationId)) {
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
        await intermediateWalletService.updateAggregationStatus(
          wallet.id,
          "failed",
        );
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
      failedOperations.delete(operationId);
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Combined status + error update (single DB call)
      await intermediateWalletService.updateAggregationStatus(
        wallet.id,
        "failed",
        undefined,
        errorMessage,
      );
      recordFailure(operationId, errorMessage);
    }
  }
}

/**
 * Phase 2: Deploy route and cleanup
 * For fully aggregated sessions:
 * - Deploy route from Wallet X
 * - Immediately cleanup intermediate wallets + Wallet X
 * - Mark session as completed
 */
async function processDeploymentAndCleanup(): Promise<void> {
  // Find sessions in 'aggregating' status
  const sessions = await db.query.obfuscationSessionsSchema.findMany({
    where: eq(obfuscationSessionsSchema.status, "aggregating"),
  });

  for (const session of sessions) {
    const operationId = `${session.id}_deploy_and_cleanup`;

    if (!shouldRetry(operationId)) {
      continue;
    }

    try {
      // Check if all wallets are aggregated
      const allAggregated =
        await intermediateWalletService.areAllWalletsAggregated(session.id);

      if (!allAggregated) {
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
        continue;
      }

      // Check if route is already deployed - verify BOTH database AND on-chain state
      const isDeployedInDb = !!route.deploymentTxHash;
      const routeConfigPda = await getRouteConfigPda(new BN(route.routeId));
      const isDeployedOnChain = await isRouteDeployedOnChain(route.routeId);

      // Handle case where route is on-chain but DB not updated
      if (isDeployedOnChain && !isDeployedInDb) {
        await routesService.updateRouteStatus(
          route.id,
          route.creator,
          "deployed",
          { deploymentTxHash: "recovered-from-chain" },
        );
      }

      const isDeployed = isDeployedInDb || isDeployedOnChain;

      if (!isDeployed) {
        // Update session status to deploying
        await obfuscationService.updateSessionStatus(session.id, "deploying");

        // Get Wallet X keypair
        const walletXKeypair = await walletXService.getKeypair(session.id);
        if (!walletXKeypair) {
          continue;
        }

        const connection = obfuscationService.getConnection();

        // For SPL routes, verify Wallet X has received all tokens before deployment
        if (session.tokenType === "SPL" && session.tokenMint) {
          const tokenBalance = await walletXService.getTokenBalance(
            session.id,
            session.tokenMint,
          );
          const expectedAmount = new BN(session.totalAmount);

          if (tokenBalance.lt(expectedAmount)) {
            // Skip deployment - tokens haven't arrived yet
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
          continue;
        }

        // Initialize route from Wallet X
        // IMPORTANT: Use route.routeId (on-chain identifier), not route.id (database ID)
        const signature = await initializeRouteFromWalletX(
          walletXKeypair,
          new BN(route.routeId),
          new BN(session.totalAmount),
          hops,
          session.tokenType as "SOL" | "SPL",
          session.tokenMint || undefined,
        );

        // STEP 2: Add hops to the route
        const addHopsSignature = await addHopsFromWalletX(
          walletXKeypair,
          new BN(route.routeId),
          hops,
        );

        // IMPORTANT: Store deployment hash immediately to prevent retry issues
        await routesService.updateRouteStatus(
          route.id,
          route.creator,
          "deployed",
          { deploymentTxHash: signature },
        );
      }

      // NOW CLEANUP - happens immediately after deployment

      const sourceWallet = new PublicKey(route.creator);

      // Cleanup all intermediate wallets
      const walletsPendingCleanup =
        await intermediateWalletService.getWalletsPendingCleanup(session.id);

      for (const wallet of walletsPendingCleanup) {
        const cleanupOpId = `${session.id}_${wallet.walletIndex}_cleanup`;

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

            failedOperations.delete(cleanupOpId);
          } else {
            // No cleanup needed (no dust to transfer)
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
          // Combined status + error update (single DB call)
          await intermediateWalletService.updateCleanupStatus(
            wallet.id,
            "failed",
            undefined,
            undefined,
            errorMessage,
          );
          // Don't fail the whole operation for cleanup errors
        }
      }

      // Cleanup Wallet X (close ATA + return dust, but don't fully close)
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
        }
      } catch (walletXCleanupError: any) {
        // Don't fail the whole operation for Wallet X cleanup errors
      }

      // Mark session as completed
      await obfuscationService.completeSession(session.id, "0");

      // Clear failure tracking on success
      failedOperations.delete(operationId);
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      recordFailure(operationId, errorMessage);
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
    // Prevent concurrent execution
    if (isProcessorRunning) {
      return;
    }
    isProcessorRunning = true;
    try {
      // Phase 1: Process pending aggregations
      await processAggregations();

      // Phase 2: Deploy and cleanup for fully aggregated sessions
      await processDeploymentAndCleanup();
    } catch (error) {
      // Critical error during processing
    } finally {
      isProcessorRunning = false;
    }
  },
);

/**
 * Start the obfuscation scheduler
 */
export function startObfuscationScheduler(): void {
  obfuscationProcessorJob.start();
}

/**
 * Stop the obfuscation scheduler
 */
export function stopObfuscationScheduler(): void {
  obfuscationProcessorJob.stop();
}

export const obfuscationSchedulerService = {
  obfuscationProcessorJob,
  startObfuscationScheduler,
  stopObfuscationScheduler,
};
