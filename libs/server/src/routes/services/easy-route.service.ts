import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createBusyWalletsService } from '../../busy-wallets/services/busy-wallets.service';
import routesService from './routes.service';
import { type CreateRouteInput, type RouteHopData } from '../schema/route.schema';

export interface EasyRouteInput {
  // User-provided fields
  arrivalTime: Date;
  hopCount: number;
  destinationWallet: string;
  tokenType: 'SPL' | 'SOL';
  tokenMint?: string;
  tokenSymbol?: string;
  tokenDecimals: number;
  hopAmountTokens: string;
  hopAmountRaw: string;
  creator: string;
}

export class EasyRouteService {
  private busyWalletsService: any;

  constructor(db: NodePgDatabase<any>) {
    this.busyWalletsService = createBusyWalletsService(db);
  }

  /**
   * Generate random weights that sum to 1.0 for distributing time across hops
   * Uses exponential distribution for more realistic timing variation
   */
  private generateRandomWeights(count: number): number[] {
    if (count <= 0) return [];
    if (count === 1) return [1.0];

    // Generate random numbers using exponential distribution for more natural variation
    const randomValues = Array.from({ length: count }, () => {
      // Use exponential distribution: -ln(1-random) gives exponential curve
      // Add small base to prevent extreme values
      return Math.max(0.1, -Math.log(1 - Math.random() * 0.9));
    });

    // Normalize to sum to 1.0
    const sum = randomValues.reduce((acc, val) => acc + val, 0);
    return randomValues.map(val => val / sum);
  }

  /**
   * Create an Easy Route by auto-generating intermediate wallets and hop timings
   */
  async createEasyRoute(input: EasyRouteInput) {
    const {
      arrivalTime,
      hopCount,
      destinationWallet,
      tokenType,
      tokenMint,
      tokenSymbol,
      tokenDecimals,
      hopAmountTokens,
      hopAmountRaw,
      creator,
    } = input;

    // 1. Validate arrival time before doing expensive operations
    const now = new Date();
    const totalDurationMs = arrivalTime.getTime() - now.getTime();

    if (totalDurationMs <= 0) {
      throw new Error('Arrival time must be in the future');
    }

    // 2. Get N-1 random busy wallets for intermediate hops
    const intermediateWalletCount = hopCount - 1;
    let intermediateWallets: any[] = [];

    if (intermediateWalletCount > 0) {
      intermediateWallets = await this.busyWalletsService.getRandomWallets(intermediateWalletCount);

      if (intermediateWallets.length < intermediateWalletCount) {
        throw new Error(`Not enough active wallets available. Need ${intermediateWalletCount}, found ${intermediateWallets.length}`);
      }
    }

    // Generate random weights for time distribution
    const weights = this.generateRandomWeights(hopCount);

    // Calculate randomized intervals - distribute total time across hops using weights
    let cumulativeTime = now.getTime();
    const hops: RouteHopData[] = [];

    for (let i = 0; i < hopCount; i++) {
      let hopDurationMs: number;

      if (i === hopCount - 1) {
        // Last hop: use remaining time to hit exact arrival time
        hopDurationMs = arrivalTime.getTime() - cumulativeTime;
      } else {
        // Intermediate hops: use weighted random duration
        hopDurationMs = totalDurationMs * weights[i];
      }

      cumulativeTime += hopDurationMs;
      const recipient = i === hopCount - 1
        ? destinationWallet
        : intermediateWallets[i].address;

      // Calculate delay for metadata storage (can be fractional minutes for short durations)
      const delayMinutes = Math.max(0, Math.round(hopDurationMs / (60 * 1000)));

      hops.push({
        recipient,
        scheduledAt: new Date(cumulativeTime).toISOString(),
        delayMinutes: delayMinutes,  // Store delay metadata for recalculation
        isCustomTime: false          // Mark as delay-based, not custom time
      });
    }

    // 3. Create route input for standard route creation
    const routeInput: CreateRouteInput = {
      name: `Easy Route - ${hopCount} hops to ${destinationWallet.slice(0, 4)}...${destinationWallet.slice(-4)}`,
      description: `Auto-generated Easy Route with ${hopCount} hops, arriving at ${arrivalTime.toISOString()}`,
      tokenType,
      tokenMint,
      tokenSymbol,
      tokenDecimals,
      hopAmountTokens,
      hopAmountRaw,
      hops,
      creator,
    };

    // 4. Call standard routes service with isEasyRoute flag
    const route = await routesService.createRoute({
      ...routeInput,
      isEasyRoute: true, // Mark this as an Easy Route
    });

    // 5. Mark the intermediate wallets as used
    if (intermediateWallets.length > 0) {
      const walletIds = intermediateWallets.map(w => w.id);
      await this.busyWalletsService.markWalletsUsed(walletIds);
    }

    // 6. Return the route with hop details for debugging/display
    const routeWithHops = await routesService.getRoute(route.id, route.creator);
    return {
      ...(routeWithHops || route),
      hops
    };
  }

  /**
   * Validate if an Easy Route can be created with given parameters
   */
  async validateEasyRouteInput(input: Omit<EasyRouteInput, 'creator'>): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Check if we have enough wallets
    const intermediateWalletCount = input.hopCount - 1;
    if (intermediateWalletCount > 0) {
      const activeWalletCount = await this.busyWalletsService.getActiveCount();
      if (activeWalletCount < intermediateWalletCount) {
        errors.push(`Not enough active wallets available. Need ${intermediateWalletCount}, found ${activeWalletCount}`);
      }
    }

    // Check arrival time is in the future
    const now = new Date();
    if (input.arrivalTime <= now) {
      errors.push('Arrival time must be in the future');
    }


    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
let easyRouteService: EasyRouteService | null = null;

export const createEasyRouteService = (db: NodePgDatabase<any>): EasyRouteService => {
  if (!easyRouteService) {
    easyRouteService = new EasyRouteService(db);
  }
  return easyRouteService;
};

export default easyRouteService;