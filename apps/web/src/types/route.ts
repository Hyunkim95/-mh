import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export interface IHop {
  recipient: PublicKey;
  delaySeconds: BN;
}

export interface RouteConfig {
  creator: PublicKey;
  routeId: BN;
  tokenConfig: PublicKey;
  sourceOwner: PublicKey;
  executor: PublicKey;
  hops: IHop[];
  hopAmount: BN;
  isFinalized: boolean;
  createdAt: BN;
}

export interface RouteStateAccount {
  currentHopIndex: number;
}

// Database types for relational timestamp-based hops
export interface DatabaseHop {
  id: number;
  routeId: number;
  hopIndex: number;
  recipient: string;
  scheduledAt: string; // ISO timestamp
  executedAt?: string | null;
  txHash?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseRoute {
  id: number;
  routeId: number;
  name?: string | null;
  description?: string | null;
  tokenType: string;
  tokenMint?: string | null;
  tokenDecimals: number;
  hopAmountTokens: string;
  hopAmountRaw: string;
  creator: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deployedAt?: string | null;
  deploymentTxHash?: string | null;
  routeConfigPda?: string | null;
  deploymentError?: string | null;
  hops?: DatabaseHop[];
}

// Input types for client-side usage
export interface IHopInput {
  recipient: string;
  delaySeconds: string;
}

// New timestamp-based interface for hop input
export interface TimestampHopInput {
  recipient: string;
  scheduledAt: string; // UTC ISO string - when this hop should execute
}

// Legacy delay-based interface (for backwards compatibility)
export interface HumanReadableHopInput {
  recipient: string;
  delayMinutes: string; // Minutes instead of seconds for better UX
}

// Timestamp-based interface for route creation
export interface TimestampRouteInput {
  hopAmountTokens: string; // Human readable amount (e.g., "0.5" tokens)
  splMint?: string; // For SPL routes
  hops: TimestampHopInput[];
}

// Legacy human-readable interface for route creation
export interface HumanReadableRouteInput {
  hopAmountTokens: string; // Human readable amount (e.g., "0.5" tokens)
  splMint?: string; // For SPL routes
  hops: HumanReadableHopInput[];
}

export interface InitializeRouteInput {
  routes: IHopInput[];
  hopAmount: string;
  splMint?: string;
}

export interface InitializeRouteSOLInput {
  routes: IHopInput[];
  hopAmount: string;
}

export interface GetRouteConfigInput {
  routeId: number;
  creator: string;
  tokenConfig: string;
}

export interface InitializeRouteResponse {
  transaction: string;
  routeConfigPda: string;
}

export interface RouteConfigResponse {
  routeConfig: RouteConfig | null;
  initialized: boolean;
  routeConfigPda?: string;
}

export interface RouteStateResponse {
  routeState: RouteStateAccount | null;
  routeStatePda?: string;
}

// Utility functions for timestamp-based route conversion
export const convertTimestampToRouteInput = (
  timestampInput: TimestampRouteInput,
  tokenDecimals: number = 6
): InitializeRouteInput => {
  // Convert human readable hop amount to raw token units
  const hopAmountRaw = Math.floor(parseFloat(timestampInput.hopAmountTokens) * Math.pow(10, tokenDecimals));
  
  // Calculate delays from timestamps
  const convertedHops: IHopInput[] = timestampInput.hops.map((hop, index, hops) => {
    let delaySeconds: number;
    
    if (index === 0) {
      // First hop executes immediately
      delaySeconds = 0;
    } else {
      // Calculate delay from previous hop
      const prevHopTime = new Date(hops[index - 1].scheduledAt).getTime();
      const currentHopTime = new Date(hop.scheduledAt).getTime();
      delaySeconds = Math.max(0, Math.floor((currentHopTime - prevHopTime) / 1000));
    }
    
    return {
      recipient: hop.recipient,
      delaySeconds: delaySeconds.toString(),
    };
  });

  return {
    routes: convertedHops,
    hopAmount: hopAmountRaw.toString(),
    splMint: timestampInput.splMint,
  };
};

// Legacy utility functions for backwards compatibility
export const convertHumanReadableToRouteInput = (
  humanInput: HumanReadableRouteInput,
  tokenDecimals: number = 6
): InitializeRouteInput => {
  const hopAmountRaw = Math.floor(parseFloat(humanInput.hopAmountTokens) * Math.pow(10, tokenDecimals));
  
  const convertedHops: IHopInput[] = humanInput.hops.map(hop => ({
    recipient: hop.recipient,
    delaySeconds: (parseFloat(hop.delayMinutes) * 60).toString()
  }));

  return {
    routes: convertedHops,
    hopAmount: hopAmountRaw.toString(),
    splMint: humanInput.splMint,
  };
};

export const convertRouteInputToHumanReadable = (
  input: InitializeRouteInput,
  tokenDecimals: number = 6
): HumanReadableRouteInput => {
  const hopAmountTokens = (parseFloat(input.hopAmount) / Math.pow(10, tokenDecimals)).toString();
  
  const convertedHops: HumanReadableHopInput[] = input.routes.map(hop => ({
    recipient: hop.recipient,
    delayMinutes: (parseFloat(hop.delaySeconds) / 60).toString()
  }));

  return {
    hopAmountTokens,
    splMint: input.splMint,
    hops: convertedHops,
  };
};

// Convert database hops to timestamp format
export const convertDatabaseHopsToTimestamp = (hops: DatabaseHop[]): TimestampHopInput[] => {
  return hops.map(hop => ({
    recipient: hop.recipient,
    scheduledAt: hop.scheduledAt, // Already a UTC ISO string
  }));
};

// Convert timestamp hops to IHopInput format with calculated delays
export const convertTimestampHopsToIHopInput = (hops: TimestampHopInput[]): IHopInput[] => {
  return hops.map((hop, index, hops) => {
    let delaySeconds: number;
    
    if (index === 0) {
      delaySeconds = 0;
    } else {
      const prevHopTime = new Date(hops[index - 1].scheduledAt).getTime();
      const currentHopTime = new Date(hop.scheduledAt).getTime();
      delaySeconds = Math.max(0, Math.floor((currentHopTime - prevHopTime) / 1000));
    }
    
    return {
      recipient: hop.recipient,
      delaySeconds: delaySeconds.toString(),
    };
  });
};

// Legacy conversion functions (for backwards compatibility)
export const convertDatabaseHopsToHumanReadable = (hops: DatabaseHop[]): HumanReadableHopInput[] => {
  return hops.map((hop, index, hops) => {
    let delayMinutes: number = 0;
    
    if (index > 0) {
      const prevHopTime = new Date(hops[index - 1].scheduledAt).getTime();
      const currentHopTime = new Date(hop.scheduledAt).getTime();
      delayMinutes = Math.max(0, Math.floor((currentHopTime - prevHopTime) / (1000 * 60)));
    }
    
    return {
      recipient: hop.recipient,
      delayMinutes: delayMinutes.toString(),
    };
  });
};

export const convertHumanReadableHopsToIHopInput = (hops: HumanReadableHopInput[]): IHopInput[] => {
  return hops.map(hop => ({
    recipient: hop.recipient,
    delaySeconds: (parseFloat(hop.delayMinutes) * 60).toString(),
  }));
}; 