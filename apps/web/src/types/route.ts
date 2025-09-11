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

// Input types for client-side usage
export interface IHopInput {
  recipient: string;
  delaySeconds: string;
}

// New human-readable interface for hop input
export interface HumanReadableHopInput {
  recipient: string;
  delayMinutes: string; // Minutes instead of seconds for better UX
}

// Human-readable interface for route creation
export interface HumanReadableRouteInput {
  routeId: number;
  hopAmountTokens: string; // Human readable amount (e.g., "0.5" tokens)
  splMint?: string; // For SPL routes
  hops: HumanReadableHopInput[];
}

export interface InitializeRouteInput {
  routeId: number;
  routes: IHopInput[];
  hopAmount: string;
  splMint?: string;
}

export interface InitializeRouteSOLInput {
  routeId: number;
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

// Utility functions for route conversion
export const convertHumanReadableToRouteInput = (
  humanInput: HumanReadableRouteInput,
  tokenDecimals: number = 6 // Default to 6 decimals, can be overridden for specific tokens
): InitializeRouteInput => {
  // Convert human readable hop amount to raw token units
  const hopAmountRaw = Math.floor(parseFloat(humanInput.hopAmountTokens) * Math.pow(10, tokenDecimals));
  
  // Convert minutes to seconds for delays
  const convertedHops: IHopInput[] = humanInput.hops.map(hop => ({
    recipient: hop.recipient,
    delaySeconds: (parseFloat(hop.delayMinutes) * 60).toString() // Convert minutes to seconds
  }));

  return {
    routeId: humanInput.routeId,
    routes: convertedHops,
    hopAmount: hopAmountRaw.toString(),
    splMint: humanInput.splMint,
  };
};

export const convertRouteInputToHumanReadable = (
  input: InitializeRouteInput,
  tokenDecimals: number = 6
): HumanReadableRouteInput => {
  // Convert raw token units to human readable amounts
  const hopAmountTokens = (parseFloat(input.hopAmount) / Math.pow(10, tokenDecimals)).toString();
  
  // Convert seconds to minutes for delays
  const convertedHops: HumanReadableHopInput[] = input.routes.map(hop => ({
    recipient: hop.recipient,
    delayMinutes: (parseFloat(hop.delaySeconds) / 60).toString() // Convert seconds to minutes
  }));

  return {
    routeId: input.routeId,
    hopAmountTokens,
    splMint: input.splMint,
    hops: convertedHops,
  };
}; 