import { PublicKey } from '@solana/web3.js';

/**
 * Common Solana program IDs
 */
export const PROGRAM_IDS = {
  SYSTEM: new PublicKey('11111111111111111111111111111112'),
  TOKEN: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  ASSOCIATED_TOKEN: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
  RENT: new PublicKey('SysvarRent111111111111111111111111111111111'),
} as const;

/**
 * Common token mint addresses (examples)
 */
export const TOKEN_MINTS = {
  // These are examples - replace with actual mint addresses for your use case
  USDC_DEVNET: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
  USDT_DEVNET: new PublicKey('3wyAj7Rt1TWVPZVteFJPLa26JmLvdb1CAKEFZm3NY75E'),
} as const;
