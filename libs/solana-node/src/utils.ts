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
