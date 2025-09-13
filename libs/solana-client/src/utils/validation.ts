import { PublicKey } from '@solana/web3.js';

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

/**
 * Validate if a string is a valid Solana signature
 */
export function isValidSignature(signature: string): boolean {
  // Solana signatures are base58 encoded and typically 87-88 characters long
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/;
  return base58Regex.test(signature);
}
