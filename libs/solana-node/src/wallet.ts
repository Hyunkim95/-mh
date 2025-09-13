import { Keypair, PublicKey } from '@solana/web3.js';

/**
 * Generate a new wallet keypair
 */
export function generateWallet(): Keypair {
  return Keypair.generate();
}

/**
 * Create a keypair from a secret key
 */
export function walletFromSecretKey(secretKey: Uint8Array): Keypair {
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Validate if a string is a valid Solana public key
 */
export function isValidPublicKey(publicKey: string): boolean {
  try {
    new PublicKey(publicKey);
    return true;
  } catch {
    return false;
  }
}
