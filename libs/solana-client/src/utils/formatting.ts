import { LAMPORTS_PER_SOL } from '@solana/web3.js';

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: number | bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

/**
 * Format SOL amount for display
 */
export function formatSol(lamports: number | bigint, decimals = 4): string {
  const sol = lamportsToSol(lamports);
  return sol.toFixed(decimals);
}

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(amount: bigint, decimals: number, displayDecimals = 2): string {
  const divisor = BigInt(10 ** decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  const fractionalString = fractionalPart.toString().padStart(decimals, '0');
  const truncatedFractional = fractionalString.slice(0, displayDecimals);
  
  return `${wholePart}.${truncatedFractional}`;
}

/**
 * Truncate a public key for display
 */
export function truncateAddress(address: string, startChars = 4, endChars = 4): string {
  if (address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}
