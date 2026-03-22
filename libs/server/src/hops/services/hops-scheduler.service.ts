import { CronJob } from "cron";
import { hopsService } from "./hops.service";
import routesService from "../../routes/services/routes.service";
import contractService, {
  getRouteStateAccount,
} from "../../solana/services/contract.service";
import { utcNow } from "../../utils/timezone";
import BN from "bn.js";
import { getRouteConfiguration } from "../../solana/services/contract-utils";
import { obfuscationService } from "../../obfuscation";
import { createLogger } from "../../utils/logger";

const log = createLogger("HopScheduler");

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
const MAX_PERMANENT_FAILURES = 10; // After this many total failures, mark route as failed in DB

const _triggerHop = async () => {
  // Run every 10 seconds
  try {
    const currentTime = utcNow();
    const readyHops = await hopsService.getOverdueHops(currentTime);
    const uniqueRoutes = new Set(readyHops.map((hop) => hop.routeId));

    // Skip routes that are in cooldown (reached max retries)
    let skippedCount = 0;
    for (const routeId of uniqueRoutes) {
      const failure = failedRoutes.get(routeId);
      if (failure && failure.failureCount >= MAX_RETRY_ATTEMPTS) {
        const minutesSinceLastAttempt = (currentTime.getTime() - failure.lastAttempt.getTime()) / 60000;
        if (minutesSinceLastAttempt < RETRY_COOLDOWN_MINUTES) {
          skippedCount++;
          uniqueRoutes.delete(routeId);
        } else {
          // Cooldown expired, reset failure count and retry
          failure.failureCount = 0;
        }
      }
    }

    if (readyHops.length > 0) {
      log.info(
        `${readyHops.length} overdue hops, ${uniqueRoutes.size} routes to process, ${skippedCount} in cooldown`
      );
    }

    for (const routeId of uniqueRoutes) {
      let currentHop;
      try {
        // First, get the route from DB to check obfuscation status
        // This MUST happen before fetching on-chain accounts, as obfuscation routes
        // don't have on-chain accounts until the route trigger job deploys them
        const routeDB = await routesService.getRouteById(routeId);

        if (!routeDB) {
          log.warn(`Route ${routeId} not found in database`);
          continue;
        }

        // Check if route has obfuscation enabled BEFORE fetching on-chain accounts
        if (routeDB.hasObfuscation) {
          const session = await obfuscationService.getSessionByRouteId(routeId);
          if (!session) {
            log.warn(`Route ${routeId} has obfuscation but no session found`);
            continue;
          }

          // Only proceed if obfuscation is in 'completed' status
          // On-chain accounts don't exist until route trigger job deploys them
          if (session.status !== 'completed') {
            log.debug(`Route ${routeId} waiting for obfuscation (status: ${session.status})`);
            continue;
          }
        }
        const onChainRouteId = routeDB.routeId;
        const routeState = await getRouteStateAccount(onChainRouteId);

        currentHop = routeState?.currentHopIndex || 0;
        const lastHopIndex = (routeState?.hopsCount || 1) - 1;

        // Check if all hops are done FIRST (before fetching config)
        // This prevents completed routes from getting stuck if getRouteConfiguration fails
        if (currentHop > lastHopIndex) {
          log.info(`Route ${routeId} completed all hops (${currentHop}/${lastHopIndex + 1})`);
          await hopsService.markAllHopsCompleted(routeId);
          // Also update route status to completed
          await routesService.updateRouteStatus(routeId, routeDB.creator, 'completed');
          continue;
        }

        const routeConfiguration = await getRouteConfiguration(onChainRouteId);
        const hops = routeConfiguration?.hops || [];

        if (hops.length === 0) {
          log.warn(`Route ${routeId} has no configured hops`);
          // Record failure so this route enters cooldown instead of retrying every 10s
          recordHopFailure(routeId, "No on-chain route configuration found");
          const failure = failedRoutes.get(routeId);
          if (failure && failure.failureCount >= MAX_PERMANENT_FAILURES) {
            log.warn(`Route ${routeId} permanently failed after ${failure.failureCount} attempts — marking as failed`);
            await hopsService.markAllHopsCompleted(routeId);
            await routesService.updateRouteStatus(routeId, routeDB.creator, 'failed');
            failedRoutes.delete(routeId);
          }
          continue;
        }

        const currentHopState = hops[currentHop];

        const hasEnoughTimeElapsed =
          utcNow().getTime() / 1000 >= Number(currentHopState.executeAt);


        if (!hasEnoughTimeElapsed) {
          log.debug(`Route ${routeId} - Not enough time elapsed for hop ${currentHop}, scheduled at ${new Date(Number(currentHopState.executeAt) * 1000).toISOString()}`);
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
          new BN(onChainRouteId)
        );

        // If route already ended, mark hops as completed
        if (txSignature === null) {
          log.info(`Route ${routeId} already ended on-chain, marking as completed`);
          await hopsService.markAllHopsCompleted(routeId);
          // Also update route status to completed
          await routesService.updateRouteStatus(routeId, routeDB.creator, 'completed');
          continue;
        }

        // If successful, remove from failed hops map
        if (failedRoutes.has(routeDB.id)) {
          failedRoutes.delete(routeDB.id);
          log.info(`Successfully executed previously failed hop ${routeDB.id}`);
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

        log.info(`Hop ${currentHop} for route ${routeId} executed: ${txSignature}`);
      } catch (error: any) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        log.error(`Failed to trigger hop ${routeId}: ${errorMessage}`);

        // Record the failure
        recordHopFailure(routeId, errorMessage);
        if (currentHop !== undefined && currentHop !== null) {
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

    log.debug("Hop scan completed");
  } catch (error) {
    log.error("Critical error during hop scan:", error);
  }
};

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
  if (failureInfo.failureCount >= MAX_RETRY_ATTEMPTS && failureInfo.failureCount === MAX_RETRY_ATTEMPTS) {
    log.warn(`Route ${routeId} reached ${MAX_RETRY_ATTEMPTS} failures, cooling down ${RETRY_COOLDOWN_MINUTES}m`);
  }
}

// Main cron job to scan and trigger ready hops
// run every 10 seconds
export const triggerHopJob = new CronJob("*/10 * * * * *", _triggerHop); 

export const hopsSchedulerService = {
  triggerHopJob,
};