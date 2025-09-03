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
