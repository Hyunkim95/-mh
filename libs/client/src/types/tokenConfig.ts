import { BN } from '@coral-xyz/anchor';

export interface TokenConfig {
  minTransfer: BN;
  feeBps: BN;
  feeTreasury: BN;
  maxHops: BN;
  maxDelaySeconds: BN;
  timelockSeconds: BN;
  flatFeeLamports: BN;
}

export interface TokenConfigInput {
  minTransfer: string;
  feeBps: string;
  feeTreasury: string;
  maxHops: string;
  maxDelaySeconds: string;
  timelockSeconds: string;
  flatFeeLamports: string;
}

// New human-readable interface for user input
export interface HumanReadableTokenConfigInput {
  minTransferAmount: string; // Human readable amount (e.g., "0.001")
  feeBps: string; // Percentage format (e.g., "5" for 5%)
  feeTreasury: string;
  maxHops: string;
  maxDelayHours: string; // Hours instead of seconds
  timelockHours: string; // Hours instead of seconds  
  flatFeeLamport: string; // SOL amount (e.g., "0.001")
}

export interface TokenConfigResponse {
  tokenConfig: TokenConfig | null;
  initialized: boolean;
  tokenConfigPda?: string;
}

export interface InitializeTokenConfigResponse {
  transaction: string;
  tokenConfigPda: string;
}

// Utility functions for conversion
export const convertHumanReadableToTokenConfigInput = (
  humanInput: HumanReadableTokenConfigInput,
): TokenConfigInput => {  
  // Convert percentage to basis points (multiply by 100)
  const feeBpsRaw = Math.floor(parseFloat(humanInput.feeBps) * 10_000);
  
  // Convert hours to seconds
  const maxDelaySecondsRaw = Math.floor(parseFloat(humanInput.maxDelayHours) * 3600);
  const timelockSecondsRaw = Math.floor(parseFloat(humanInput.timelockHours) * 3600);
  
  // Convert SOL to lamports (multiply by 10^9)
  const flatFeeLamportsRaw = Math.floor(parseFloat(humanInput.flatFeeLamport) * 1_000_000_000);

  return {
    minTransfer: "0",
    feeBps: feeBpsRaw.toString(),
    feeTreasury: humanInput.feeTreasury,
    maxHops: humanInput.maxHops,
    maxDelaySeconds: maxDelaySecondsRaw.toString(),
    timelockSeconds: timelockSecondsRaw.toString(),
    flatFeeLamports: flatFeeLamportsRaw.toString(),
  };
};

export const convertTokenConfigInputToHumanReadable = (
  input: TokenConfigInput,
  tokenDecimals: number = 6
): HumanReadableTokenConfigInput => {
  // Convert raw token units to human readable amounts
  const minTransferAmount = (parseFloat(input.minTransfer) / Math.pow(10, tokenDecimals)).toString();
  
  // Convert basis points to percentage (divide by 100)
  const feeBps = (parseFloat(input.feeBps) / 10_000).toString();
  // Convert seconds to hours
  const maxDelayHours = (parseFloat(input.maxDelaySeconds) / 3600).toString();
  const timelockHours = (parseFloat(input.timelockSeconds) / 3600).toString();
  
  // Convert lamports to SOL (divide by 10^9)
  const flatFeeLamport = (parseFloat(input.flatFeeLamports) / 1_000_000_000).toString();

  return {
    minTransferAmount,
    feeBps,
    feeTreasury: input.feeTreasury,
    maxHops: input.maxHops,
    maxDelayHours,
    timelockHours,
    flatFeeLamport,
  };
};