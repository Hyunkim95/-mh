import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';

// Re-export metadata functions for convenience
export {
  fetchTokenMetadata,
  fetchTokenInfo,
  fetchOnChainMetadata,
  hasTokenMetadata,
  batchFetchTokenMetadata,
  batchFetchTokenInfo,
  type TokenMetadata,
  type TokenInfo
} from './token-metadata';

/**
 * Get token account balance
 */
export async function getTokenBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<bigint> {
  const account = await getAccount(connection, tokenAccount);
  return account.amount;
}

/**
 * Get associated token account address
 */
export async function getAssociatedTokenAccount(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false
): Promise<PublicKey> {
  return await getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve);
}
