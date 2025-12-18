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
        const routeState = await getRouteStateAccount(routeId);
        currentHop = routeState?.currentHopIndex || 0;
        const lastHopIndex = (routeState?.hopsCount || 1) - 1;

        if (currentHop >= lastHopIndex) {
          hopsService.markAllHopsCompleted(routeId);
          continue;
        }

        const routeConfiguration = await getRouteConfiguration(routeId);
        const hops = routeConfiguration?.hops || [];
        const currentHopState = hops[currentHop];
        const delaysSeconds = currentHopState.delaySeconds;
        const lastHopAtArray = routeState?.lastHopAt || [];
        const lastHopExecutedAt =
          currentHop > 0
            ? parseInt(lastHopAtArray[currentHop - 1] || "0")
            : parseInt(routeState?.startedAt || "0");

        const hasEnoughTimeElapsed =
          Math.floor(Date.now() / 1000) >=
          lastHopExecutedAt + parseInt(delaysSeconds);

        if (!hasEnoughTimeElapsed) {
          console.log(
            `[HopScheduler] Route ${routeId} - Not enough time elapsed for hop ${currentHop}`
          );
          await hopsService.updateHopScheduleByIndex(
            routeId,
            currentHop,
            new Date((lastHopExecutedAt + parseInt(delaysSeconds)) * 1000)
          );
        }

        const routeDB = await routesService.getRouteById(routeId);

        if (!routeDB) {
          console.warn(
            `[HopScheduler] Route ${routeId} not found in database`
          );
          continue;
        }

        // Attempt to trigger the hop
        await contractService.executeHop(
          new PublicKey(routeDB?.creator),
          new BN(routeDB?.id),
          routeDB.tokenMint
            ? new PublicKey(routeDB.tokenMint)
            : new PublicKey("So11111111111111111111111111111111111111112")
        );

        // If successful, remove from failed hops map
        if (failedRoutes.has(routeDB.id)) {
          failedRoutes.delete(routeDB.id);
          console.log(
            `[HopScheduler] Successfully executed previously failed hop ${routeDB.id}`
          );
        }

        // Update hop execution status
        await hopsService.updateHopExecutionByIndex(
          routeId,
          currentHop,
          {
            executedAt: currentTime,
          }
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[HopScheduler] Failed to trigger hop ${routeId}:`,
          errorMessage
        );

        // Record the failure
        recordHopFailure(routeId, errorMessage);
        if (currentHop) {
          // Update hop with error
          await hopsService.updateHopExecutionByIndex(
            routeId,
            currentHop,
            {
              error: errorMessage,
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
