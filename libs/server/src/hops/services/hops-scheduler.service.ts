import { CronJob } from 'cron';
import { hopsService } from "./hops.service";
import routesService from "../../routes/services/routes.service";
import contractService, {  getRouteStateAccount } from "../../solana/contract.service";
import { utcNow } from '../../utils/timezone';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

interface HopExecutionAttempt {
    hopId: number;
    routeId: number;
    failureCount: number;
    lastAttempt: Date;
    lastError?: string;
}

// Track failed hop execution attempts
const failedHops = new Map<number, HopExecutionAttempt>();
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_COOLDOWN_MINUTES = 5; // Wait 5 minutes before retrying

// Main cron job to scan and trigger ready hops
// run every 10 seconds
const triggerHopJob = new CronJob('*/10 * * * * *', async () => { // Run every 10 seconds
    try {
        console.log('[HopScheduler] Starting hop scan...');
        
        // Get overdue hops that should have been executed by now
        const currentTime = utcNow();
        const readyHops = await hopsService.getOverdueHops(currentTime);
        console.log(`[HopScheduler] Found ${readyHops.length} overdue hops at ${currentTime.toISOString()}`);
        
        for (const hop of readyHops) {
            try {
                // Check if this hop has failed too many times
                const failureInfo = failedHops.get(hop.id);
                if (failureInfo && failureInfo.failureCount >= MAX_RETRY_ATTEMPTS) {
                    // Check if enough time has passed since last attempt
                    const timeSinceLastAttempt = currentTime.getTime() - failureInfo.lastAttempt.getTime();
                    const cooldownMs = RETRY_COOLDOWN_MINUTES * 60 * 1000;
                    
                    if (timeSinceLastAttempt < cooldownMs) {
                        console.log(`[HopScheduler] Skipping hop ${hop.id} - still in cooldown period`);
                        continue;
                    } else {
                        // Reset failure count after cooldown
                        failedHops.delete(hop.id);
                        console.log(`[HopScheduler] Resetting failure count for hop ${hop.id} after cooldown`);
                    }
                }

                // Verify hop index synchronization with contract
                const isSynchronized = await verifyHopIndexSync(hop.routeId, hop.hopIndex);
                if (!isSynchronized) {
                    console.log(`[HopScheduler] Hop ${hop.id} (route ${hop.routeId}, index ${hop.hopIndex}) is out of sync with contract`);
                    
                    // Record as failed sync check
                    recordHopFailure(hop.id, hop.routeId, 'Contract hopIndex out of sync');
                    continue;
                }
                
                console.log(`[HopScheduler] Triggering hop ${hop.id} for route ${hop.routeId}`);
                const route = await routesService.getRouteById(hop.routeId);
                if (!route) {
                    console.error(`[HopScheduler] Route ${hop.routeId} not found`);
                    continue;
                }
                // Attempt to trigger the hop
                await contractService.executeHop(
                    new PublicKey(route?.creator),
                    new BN(route?.id),
                    route.tokenMint ? new PublicKey(route.tokenMint) : new PublicKey('So11111111111111111111111111111111111111112')
                );
                
                // If successful, remove from failed hops map
                if (failedHops.has(hop.id)) {
                    failedHops.delete(hop.id);
                    console.log(`[HopScheduler] Successfully executed previously failed hop ${hop.id}`);
                }
                
                // Update hop execution status
                await hopsService.updateHopExecution(hop.id, {
                    executedAt: currentTime
                });
                
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[HopScheduler] Failed to trigger hop ${hop.id}:`, errorMessage);
                
                // Record the failure
                recordHopFailure(hop.id, hop.routeId, errorMessage);
                
                // Update hop with error
                await hopsService.updateHopExecution(hop.id, {
                    error: errorMessage
                });
            }
        }
        
        console.log('[HopScheduler] Hop scan completed');
        
    } catch (error) {
        console.error('[HopScheduler] Critical error during hop scan:', error);
    }
});

/**
 * Verifies that the hop index in the database matches the contract's current hop index
 */
async function verifyHopIndexSync(routeId: number, expectedHopIndex: number): Promise<boolean> {
    try {
        // Get the current hop index from the contract
        const routeState = await getRouteStateAccount(routeId);
        if (!routeState) {
            console.warn(`[HopScheduler] Could not fetch route state for route ${routeId}`);
            return false;
        }
        
        // Check if the expected hop index matches the contract's current hop index
        const contractHopIndex = routeState.currentHopIndex;
        
        console.log(`[HopScheduler] Route ${routeId} - Contract hop index: ${contractHopIndex}, Expected: ${expectedHopIndex}`);
        
        return contractHopIndex === expectedHopIndex;
        
    } catch (error) {
        console.error(`[HopScheduler] Error verifying hop index sync for route ${routeId}:`, error);
        return false; // Fail safe - don't execute if we can't verify
    }
}



/**
 * Records a hop execution failure
 */
function recordHopFailure(hopId: number, routeId: number, error: string) {
    const existing = failedHops.get(hopId);
    const now = utcNow();
    
    if (existing) {
        existing.failureCount++;
        existing.lastAttempt = now;
        existing.lastError = error;
    } else {
        failedHops.set(hopId, {
            hopId,
            routeId,
            failureCount: 1,
            lastAttempt: now,
            lastError: error
        });
    }
    
    const failureInfo = failedHops.get(hopId)!;
    console.log(`[HopScheduler] Recorded failure ${failureInfo.failureCount}/${MAX_RETRY_ATTEMPTS} for hop ${hopId}: ${error}`);
    
    if (failureInfo.failureCount >= MAX_RETRY_ATTEMPTS) {
        console.warn(`[HopScheduler] Hop ${hopId} has reached maximum retry attempts. Will retry after ${RETRY_COOLDOWN_MINUTES} minutes.`);
    }
}

/**
 * Gets information about failed hops (for monitoring/debugging)
 */
function getFailedHopsInfo(): HopExecutionAttempt[] {
    return Array.from(failedHops.values());
}

/**
 * Manually retry a failed hop (for administrative purposes)
 */
async function retryFailedHop(hopId: number): Promise<boolean> {
    const failureInfo = failedHops.get(hopId);
    if (!failureInfo) {
        console.log(`[HopScheduler] Hop ${hopId} is not in failed hops list`);
        return false;
    }
    
    try {
        console.log(`[HopScheduler] Manually retrying hop ${hopId}`);
        
        // Reset failure count
        failedHops.delete(hopId);
        
        // Trigger the hop
        await routesService.triggerNextHop(failureInfo.routeId);
        
        // Update hop execution status
        await hopsService.updateHopExecution(hopId, {
            executedAt: utcNow(),
            error: undefined // Clear previous error
        });
        
        console.log(`[HopScheduler] Successfully retried hop ${hopId}`);
        return true;
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[HopScheduler] Manual retry failed for hop ${hopId}:`, errorMessage);
        
        // Record the failure again
        recordHopFailure(hopId, failureInfo.routeId, errorMessage);
        
        return false;
    }
}

export const hopsSchedulerService = {
    triggerHopJob,
    getFailedHopsInfo,
    retryFailedHop,
    verifyHopIndexSync,
}