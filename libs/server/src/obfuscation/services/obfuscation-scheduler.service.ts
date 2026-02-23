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
  isRouteDeployedOnChain,
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

  const info = failedOperations.get(operationId)!;
  console.log(
    `[ObfuscationScheduler] Recorded failure ${info.failureCount}/${MAX_RETRY_ATTEMPTS} for ${operationId}: ${error}`,
  );
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
 * Aggregation Job - Run every 5 seconds
 * Transfers funds from intermediate wallets to Wallet X
 */
export const aggregationJob = new CronJob("*/5 * * * * *", async () => {
  try {
    console.log("[ObfuscationScheduler] Starting aggregation scan...");

    // Get wallets ready for aggregation
    const readyWallets =
      await intermediateWalletService.getWalletsReadyForAggregation();

    console.log(
      `[ObfuscationScheduler] Found ${readyWallets.length} wallets ready for aggregation`,
    );

    for (const wallet of readyWallets) {
      const operationId = `${wallet.sessionId}_${wallet.walletIndex}_aggregate`;

      if (!shouldRetry(operationId)) {
        console.log(
          `[ObfuscationScheduler] Skipping ${operationId} - max retries reached, cooling down`,
        );
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
          console.warn(
            `[ObfuscationScheduler] Could not build aggregation tx for wallet ${wallet.id}`,
          );
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

        console.log(
          `[ObfuscationScheduler] Aggregated wallet ${wallet.id} to Wallet X: ${signature}`,
        );

        // Check if all wallets are now aggregated
        const allAggregated =
          await intermediateWalletService.areAllWalletsAggregated(
            wallet.sessionId,
          );
        if (allAggregated) {
          console.log(
            `[ObfuscationScheduler] All wallets aggregated for session ${wallet.sessionId}`,
          );
          // Trigger route execution job will pick this up
        }
      } catch (error: any) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[ObfuscationScheduler] Failed to aggregate wallet ${wallet.id}: ${errorMessage}`,
        );

        await intermediateWalletService.updateAggregationStatus(
          wallet.id,
          "failed",
        );
        await intermediateWalletService.setError(wallet.id, errorMessage);
        recordFailure(operationId, errorMessage);
      }
    }

    console.log("[ObfuscationScheduler] Aggregation scan completed");
  } catch (error) {
    console.error(
      "[ObfuscationScheduler] Critical error during aggregation scan:",
      error,
    );
  }
});

/**
 * Route Trigger Job - Run every 10 seconds
 * Invokes the multihopper contract once all funds are aggregated to Wallet X
 */
export const routeTriggerJob = new CronJob("*/10 * * * * *", async () => {
  try {
    console.log("[ObfuscationScheduler] Starting route trigger scan...");

    // Find sessions in 'aggregating' status where all wallets are aggregated
    const sessions = await db.query.obfuscationSessionsSchema.findMany({
      where: eq(obfuscationSessionsSchema.status, "aggregating"),
    });

    for (const session of sessions) {
      const operationId = `${session.id}_route_trigger`;

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

        console.log(
          `[ObfuscationScheduler] Session ${session.id} ready for contract invocation`,
        );

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
          console.warn(
            `[ObfuscationScheduler] Route ${session.routeId} not found`,
          );
          continue;
        }

        // Check if route is already deployed on-chain
        const isDeployed = await isRouteDeployedOnChain(route.id);
        if (isDeployed) {
          console.log(
            `[ObfuscationScheduler] Route ${session.routeId} already deployed, updating status`,
          );
          await obfuscationService.updateSessionStatus(session.id, "executing");
          failedOperations.delete(operationId);
          continue;
        }

        // Get Wallet X keypair
        const walletXKeypair = await walletXService.getKeypair(session.id);
        if (!walletXKeypair) {
          console.warn(
            `[ObfuscationScheduler] Wallet X keypair not found for session ${session.id}`,
          );
          continue;
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
          console.warn(
            `[ObfuscationScheduler] Route ${session.routeId} has no hops`,
          );
          continue;
        }

        console.log(
          `[ObfuscationScheduler] Initializing route ${session.routeId} from Wallet X`,
        );

        // Initialize route from Wallet X
        const signature = await initializeRouteFromWalletX(
          walletXKeypair,
          new BN(route.id),
          new BN(session.totalAmount),
          hops,
          session.tokenType as "SOL" | "SPL",
          session.tokenMint || undefined,
        );

        console.log(
          `[ObfuscationScheduler] Route ${session.routeId} initialized: ${signature}`,
        );

        // Update route status to deployed
        await routesService.updateRouteStatus(
          route.id,
          route.creator,
          "deployed",
          { deploymentTxHash: signature },
        );

        // Update session status to executing
        await obfuscationService.updateSessionStatus(session.id, "executing");

        console.log(
          `[ObfuscationScheduler] Session ${session.id} marked as executing`,
        );

        // Clear failure tracking on success
        failedOperations.delete(operationId);
      } catch (error: any) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[ObfuscationScheduler] Failed to trigger route for session ${session.id}: ${errorMessage}`,
        );
        recordFailure(operationId, errorMessage);
      }
    }

    console.log("[ObfuscationScheduler] Route trigger scan completed");
  } catch (error) {
    console.error(
      "[ObfuscationScheduler] Critical error during route trigger scan:",
      error,
    );
  }
});

/**
 * Cleanup Job - Run every 30 seconds
 * Closes ATAs and returns dust after route completes
 */
export const cleanupJob = new CronJob("*/30 * * * * *", async () => {
  try {
    console.log("[ObfuscationScheduler] Starting cleanup scan...");

    // Find sessions where route is completed but cleanup is pending
    // We need to check if the route status is 'completed' or 'deployed' with all hops done
    const sessions = await db.query.obfuscationSessionsSchema.findMany({
      where: eq(obfuscationSessionsSchema.status, "executing"),
    });

    for (const session of sessions) {
      try {
        // Get the route to check if it's completed
        const route = await db.query.routesSchema.findFirst({
          where: eq(routesSchema.id, session.routeId),
          with: {
            hops: true,
          },
        });

        if (!route) continue;

        // Check if all hops are executed
        const allHopsExecuted =
          route.hops?.every((hop) => hop.executedAt !== null) ?? false;

        if (!allHopsExecuted) {
          continue;
        }

        console.log(
          `[ObfuscationScheduler] Route ${session.routeId} completed, starting cleanup for session ${session.id}`,
        );

        // Update session status
        await obfuscationService.updateSessionStatus(session.id, "cleaning");

        // Get source wallet (creator)
        const sourceWallet = new PublicKey(route.creator);

        // Get all intermediate wallets pending cleanup
        const walletsPendingCleanup =
          await intermediateWalletService.getWalletsPendingCleanup(session.id);

        for (const wallet of walletsPendingCleanup) {
          const operationId = `${session.id}_${wallet.walletIndex}_cleanup`;

          if (!shouldRetry(operationId)) {
            continue;
          }

          try {
            const txData = await obfuscationTxBuilder.buildCleanupTransaction(
              wallet.id,
              session.id,
              sourceWallet,
            );

            if (txData) {
              const signature = await obfuscationTxBuilder.executeTransaction(
                txData.transaction,
                txData.signer,
              );

              await intermediateWalletService.updateCleanupStatus(
                wallet.id,
                "completed",
                signature, // dustReturnTxHash
                signature, // ataCloseTxHash (same tx)
              );

              console.log(
                `[ObfuscationScheduler] Cleaned up wallet ${wallet.id}: ${signature}`,
              );
              failedOperations.delete(operationId);
            } else {
              // No cleanup needed
              await intermediateWalletService.updateCleanupStatus(
                wallet.id,
                "completed",
              );
            }
          } catch (error: any) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            console.error(
              `[ObfuscationScheduler] Failed to cleanup wallet ${wallet.id}: ${errorMessage}`,
            );
            await intermediateWalletService.updateCleanupStatus(
              wallet.id,
              "failed",
            );
            recordFailure(operationId, errorMessage);
          }
        }

        // Cleanup Wallet X
        const walletXCleanupId = `${session.id}_walletX_cleanup`;
        if (shouldRetry(walletXCleanupId)) {
          try {
            const txData =
              await obfuscationTxBuilder.buildWalletXCleanupTransaction(
                session.id,
                sourceWallet,
              );

            if (txData) {
              const signature = await obfuscationTxBuilder.executeTransaction(
                txData.transaction,
                txData.signer,
              );
              console.log(
                `[ObfuscationScheduler] Cleaned up Wallet X for session ${session.id}: ${signature}`,
              );
              failedOperations.delete(walletXCleanupId);
            }
          } catch (error: any) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            console.error(
              `[ObfuscationScheduler] Failed to cleanup Wallet X: ${errorMessage}`,
            );
            recordFailure(walletXCleanupId, errorMessage);
          }
        }

        // Check if all cleanup is complete
        const allCleanedUp =
          await intermediateWalletService.areAllWalletsCleanedUp(session.id);
        if (allCleanedUp) {
          await obfuscationService.completeSession(session.id, "0"); // TODO: Calculate actual fees
          console.log(
            `[ObfuscationScheduler] Session ${session.id} fully completed`,
          );
        }
      } catch (error: any) {
        console.error(
          `[ObfuscationScheduler] Error processing session ${session.id} cleanup:`,
          error,
        );
      }
    }

    console.log("[ObfuscationScheduler] Cleanup scan completed");
  } catch (error) {
    console.error(
      "[ObfuscationScheduler] Critical error during cleanup scan:",
      error,
    );
  }
});

/**
 * Start all scheduler jobs
 */
export function startObfuscationScheduler(): void {
  aggregationJob.start();
  routeTriggerJob.start();
  cleanupJob.start();
  console.log("[ObfuscationScheduler] All jobs started");
}

/**
 * Stop all scheduler jobs
 */
export function stopObfuscationScheduler(): void {
  aggregationJob.stop();
  routeTriggerJob.stop();
  cleanupJob.stop();
  console.log("[ObfuscationScheduler] All jobs stopped");
}

export const obfuscationSchedulerService = {
  aggregationJob,
  routeTriggerJob,
  cleanupJob,
  startObfuscationScheduler,
  stopObfuscationScheduler,
};
