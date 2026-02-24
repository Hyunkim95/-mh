import { CronJob } from "cron";
import { hopsService } from "./hops.service";
import routesService from "../../routes/services/routes.service";
import contractService, {
  getRouteStateAccount,
} from "../../solana/services/contract.service";
import { utcNow } from "../../utils/timezone";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { getRouteConfiguration } from "../../solana/services/contract-utils";
import { obfuscationService } from "../../obfuscation";

interface HopExecutionAttempt {
  routeId: number;
  failureCount: number;
  lastAttempt: Date;
  lastError?: string;
}

// Track failed hop execution attempts
const failedRoutes = new Map<number, HopExecutionAttempt>();
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_COOLDOWN_MINUTES = 5; // Wait 5 minutes before retrying

// Main cron job to scan and trigger ready hops
// run every 10 seconds
export const triggerHopJob = new CronJob("*/10 * * * * *", async () => {
  // Run every 10 seconds
  try {
    console.log("[HopScheduler] Starting hop scan...");

    // Get overdue hops that should have been executed by now
    const currentTime = utcNow();
    const readyHops = await hopsService.getOverdueHops(currentTime);
    console.log(
      `[HopScheduler] Found ${
        readyHops.length
      } overdue hops at ${currentTime.toISOString()}`
    );
    const uniqueRoutes = new Set(readyHops.map((hop) => hop.routeId));


    for (const routeId of uniqueRoutes) {
      let currentHop;
      try {
        // First, get the route from DB to check obfuscation status
        // This MUST happen before fetching on-chain accounts, as obfuscation routes
        // don't have on-chain accounts until the route trigger job deploys them
        const routeDB = await routesService.getRouteById(routeId);

        if (!routeDB) {
          console.warn(
            `[HopScheduler] Route ${routeId} not found in database`
          );
          continue;
        }

        // Check if route has obfuscation enabled BEFORE fetching on-chain accounts
        if (routeDB.hasObfuscation) {
          const session = await obfuscationService.getSessionByRouteId(routeId);
          if (!session) {
            console.warn(
              `[HopScheduler] Route ${routeId} has obfuscation but no session found`
            );
            continue;
          }

          // Only proceed if obfuscation is in 'executing' status
          // On-chain accounts don't exist until route trigger job deploys them
          if (session.status !== 'executing') {
            console.log(
              `[HopScheduler] Route ${routeId} waiting for obfuscation (status: ${session.status})`
            );
            continue;
          }
        }

        const routeState = await getRouteStateAccount(routeId);

        currentHop = routeState?.currentHopIndex || 0;
        const lastHopIndex = (routeState?.hopsCount || 1) - 1;

        // Check if all hops are done FIRST (before fetching config)
        // This prevents completed routes from getting stuck if getRouteConfiguration fails
        if (currentHop > lastHopIndex) {
          console.log(`[HopScheduler] Route ${routeId} completed all hops (${currentHop}/${lastHopIndex + 1})`);
          await hopsService.markAllHopsCompleted(routeId);
          continue;
        }

        const routeConfiguration = await getRouteConfiguration(routeId);
        const hops = routeConfiguration?.hops || [];

        if (hops.length === 0) {
          console.warn(
            `[HopScheduler] Route ${routeId} has no configured hops`
          );
          continue;
        }

        const currentHopState = hops[currentHop];

        const hasEnoughTimeElapsed =
          utcNow().getTime() / 1000 >= Number(currentHopState.executeAt);


        if (!hasEnoughTimeElapsed) {
          console.log(
            `[HopScheduler] Route ${routeId} - Not enough time elapsed for hop ${currentHop}`
            ,
            new Date(
              Number(currentHopState.executeAt) * 1000
            )
          );
          await hopsService.updateHopScheduleByIndex(
            routeId,
            currentHop,
            new Date(
              Number(currentHopState.executeAt) * 1000
            )
          );
        }

        // Attempt to trigger the hop
        const txSignature = await contractService.executeHop(
          new PublicKey(routeDB?.creator),
          new BN(routeDB?.id)
        );

        // If route already ended, mark hops as completed
        if (txSignature === null) {
          console.log(`[HopScheduler] Route ${routeId} already ended on-chain, marking as completed`);
          await hopsService.markAllHopsCompleted(routeId);
          continue;
        }

        // If successful, remove from failed hops map
        if (failedRoutes.has(routeDB.id)) {
          failedRoutes.delete(routeDB.id);
          console.log(
            `[HopScheduler] Successfully executed previously failed hop ${routeDB.id}`
          );
        }

        // Update hop execution status with txHash
        await hopsService.updateHopExecutionByIndex(
          routeId,
          currentHop,
          {
            executedAt: currentTime,
            txHash: txSignature,
          }
        );

        console.log(`[HopScheduler] Hop ${currentHop} for route ${routeId} executed: ${txSignature}`);
      } catch (error: any) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        const errorLogs = error?.logs || error?.transactionError?.logs;
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error(
          `[HopScheduler] Failed to trigger hop ${routeId}: ${errorMessage}`
        );
        if (errorLogs) {
          console.error(`[HopScheduler] Transaction logs for route ${routeId}:`, JSON.stringify(errorLogs));
        }
        if (errorStack) {
          console.error(`[HopScheduler] Stack for route ${routeId}:`, errorStack);
        }

        const fullError = errorLogs
          ? `${errorMessage} | Logs: ${JSON.stringify(errorLogs)}`
          : errorMessage;

        // Record the failure
        recordHopFailure(routeId, fullError);
        if (currentHop !== undefined && currentHop !== null) {
          // Update hop with error
          await hopsService.updateHopExecutionByIndex(
            routeId,
            currentHop,
            {
              error: fullError,
            }
          );
        }
      }
    }

    console.log("[HopScheduler] Hop scan completed");
  } catch (error) {
    console.error("[HopScheduler] Critical error during hop scan:", error);
  }
});

/**
 * Records a hop execution failure
 */
function recordHopFailure(routeId: number, error: string) {
  const existing = failedRoutes.get(routeId);
  const now = utcNow();

  if (existing) {
    existing.failureCount++;
    existing.lastAttempt = now;
    existing.lastError = error;
  } else {
    failedRoutes.set(routeId, {
      routeId,
      failureCount: 1,
      lastAttempt: now,
      lastError: error,
    });
  }

  const failureInfo = failedRoutes.get(routeId)!;
  console.log(
    `[HopScheduler] Recorded failure ${failureInfo.failureCount}/${MAX_RETRY_ATTEMPTS} for hop ${routeId}: ${error}`
  );

  if (failureInfo.failureCount >= MAX_RETRY_ATTEMPTS) {
    console.warn(
      `[HopScheduler] Hop ${routeId} has reached maximum retry attempts. Will retry after ${RETRY_COOLDOWN_MINUTES} minutes.`
    );
  }
}

export const hopsSchedulerService = {
  triggerHopJob,
};
