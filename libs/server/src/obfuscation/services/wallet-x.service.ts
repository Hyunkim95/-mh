import { eq } from "drizzle-orm";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import BN from "bn.js";
import { db } from "../../db";
import {
  obfuscationSessionsSchema,
  ObfuscationSession,
} from "../schema/obfuscation.schema";
import { CustodialWallet } from "@libs/crypto-utils";
import { obfuscationService } from "./obfuscation.service";
import { intermediateWalletService } from "./intermediate-wallet.service";

/**
 * Get Wallet X data for a session
 */
async function getWalletX(sessionId: number): Promise<CustodialWallet | null> {
  const session = await db.query.obfuscationSessionsSchema.findFirst({
    where: eq(obfuscationSessionsSchema.id, sessionId),
    with: {
      walletX: true,
    },
  });

  return session?.walletX || null;
}

/**
 * Get Wallet X data by route ID
 */
async function getWalletXByRouteId(
  routeId: number,
): Promise<CustodialWallet | null> {
  const session = await obfuscationService.getSessionByRouteId(routeId);
  if (!session) return null;

  return getWalletX(session.id);
}

/**
 * Get the Keypair for Wallet X (for signing transactions)
 */
async function getKeypair(sessionId: number): Promise<Keypair | null> {
  const walletX = await getWalletX(sessionId);
  if (!walletX) return null;

  const walletManager = obfuscationService.getWalletManager();
  return walletManager.getKeypairFromWallet(walletX);
}

/**
 * Get the Keypair for Wallet X by route ID
 */
async function getKeypairByRouteId(routeId: number): Promise<Keypair | null> {
  const session = await obfuscationService.getSessionByRouteId(routeId);
  if (!session) return null;

  return getKeypair(session.id);
}

/**
 * Get the public key (address) for Wallet X
 */
async function getPublicKey(sessionId: number): Promise<PublicKey | null> {
  const walletX = await getWalletX(sessionId);
  if (!walletX) return null;

  return new PublicKey(walletX.address);
}

/**
 * Get SOL balance of Wallet X
 */
async function getSOLBalance(sessionId: number): Promise<BN> {
  const walletX = await getWalletX(sessionId);
  if (!walletX) return new BN(0);

  const connection = obfuscationService.getConnection();
  const publicKey = new PublicKey(walletX.address);
  const balance = await connection.getBalance(publicKey);

  return new BN(balance);
}

/**
 * Get SPL token balance of Wallet X
 */
async function getTokenBalance(
  sessionId: number,
  tokenMint: string,
): Promise<BN> {
  const walletX = await getWalletX(sessionId);
  if (!walletX) return new BN(0);

  const connection = obfuscationService.getConnection();
  const publicKey = new PublicKey(walletX.address);
  const mintPublicKey = new PublicKey(tokenMint);

  try {
    const ata = await getAssociatedTokenAddress(mintPublicKey, publicKey);
    const account = await getAccount(connection, ata);
    return new BN(account.amount.toString());
  } catch (error) {
    // Account doesn't exist or other error
    return new BN(0);
  }
}

/**
 * Check if Wallet X has received all expected funds from intermediates
 */
async function hasReceivedAllFunds(sessionId: number): Promise<boolean> {
  const session = await obfuscationService.getSession(sessionId);
  if (!session) return false;

  // Check if all intermediates have aggregated
  const allAggregated =
    await intermediateWalletService.areAllWalletsAggregated(sessionId);
  if (!allAggregated) return false;

  // Optionally verify on-chain balance matches expected
  const expectedAmount = new BN(session.totalAmount);
  let actualBalance: BN;

  if (session.tokenType === "SOL") {
    actualBalance = await getSOLBalance(sessionId);
    // For SOL, some will be used for fees, so we just check it's not zero
    return actualBalance.gt(new BN(0));
  } else if (session.tokenMint) {
    actualBalance = await getTokenBalance(sessionId, session.tokenMint);
    // For SPL tokens, the full amount should be there
    return actualBalance.gte(expectedAmount);
  }

  return false;
}

/**
 * Check if aggregation is complete (all intermediates have sent to Wallet X)
 */
async function isAggregationComplete(sessionId: number): Promise<boolean> {
  return intermediateWalletService.areAllWalletsAggregated(sessionId);
}

/**
 * Get the session for Wallet X operations
 */
async function getSessionForWalletX(
  sessionId: number,
): Promise<ObfuscationSession | null> {
  return obfuscationService.getSession(sessionId);
}

const walletXService = {
  // Get wallet data
  getWalletX,
  getWalletXByRouteId,
  getKeypair,
  getKeypairByRouteId,
  getPublicKey,

  // Balance queries
  getSOLBalance,
  getTokenBalance,

  // Aggregation checks
  hasReceivedAllFunds,
  isAggregationComplete,

  // Session access
  getSessionForWalletX,
};

export { walletXService };
