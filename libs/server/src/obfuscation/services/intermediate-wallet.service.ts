import { eq, and, lte, or } from "drizzle-orm";
import { Keypair, PublicKey } from "@solana/web3.js";
import { db } from "../../db";
import {
  intermediateWalletsSchema,
  IntermediateWallet,
  FundingStatus,
  AggregationStatus,
  CleanupStatus,
} from "../schema/obfuscation.schema";
import { CustodialWallet } from "@libs/crypto-utils";
import { obfuscationService } from "./obfuscation.service";

/**
 * Get intermediate wallet with its custodial wallet data
 */
async function getIntermediateWalletWithCustodial(
  walletId: number,
): Promise<(IntermediateWallet & { custodialWallet: CustodialWallet }) | null> {
  const wallet = await db.query.intermediateWalletsSchema.findFirst({
    where: eq(intermediateWalletsSchema.id, walletId),
    with: {
      custodialWallet: true,
    },
  });
  return wallet || null;
}

/**
 * Get all intermediate wallets for a session with custodial wallet data
 */
async function getIntermediateWalletsWithCustodial(
  sessionId: number,
): Promise<(IntermediateWallet & { custodialWallet: CustodialWallet })[]> {
  const wallets = await db.query.intermediateWalletsSchema.findMany({
    where: eq(intermediateWalletsSchema.sessionId, sessionId),
    with: {
      custodialWallet: true,
    },
    orderBy: (iw, { asc }) => [asc(iw.walletIndex)],
  });
  return wallets;
}

/**
 * Get the Keypair for an intermediate wallet (for signing transactions)
 */
async function getKeypairForWallet(walletId: number): Promise<Keypair | null> {
  const wallet = await getIntermediateWalletWithCustodial(walletId);
  if (!wallet) return null;

  const walletManager = obfuscationService.getWalletManager();
  return walletManager.getKeypairFromWallet(wallet.custodialWallet);
}

/**
 * Get the public key (address) for an intermediate wallet
 */
async function getPublicKeyForWallet(
  walletId: number,
): Promise<PublicKey | null> {
  const wallet = await getIntermediateWalletWithCustodial(walletId);
  if (!wallet) return null;

  return new PublicKey(wallet.custodialWallet.address);
}

/**
 * Update funding status for an intermediate wallet
 */
async function updateFundingStatus(
  walletId: number,
  status: FundingStatus,
  txHash?: string,
): Promise<void> {
  const updates: Partial<IntermediateWallet> = {
    fundingStatus: status,
    updatedAt: new Date(),
  };

  if (txHash) {
    updates.fundingTxHash = txHash;
  }

  if (status === "funded") {
    updates.fundedAt = new Date();
  }

  await db
    .update(intermediateWalletsSchema)
    .set(updates)
    .where(eq(intermediateWalletsSchema.id, walletId));
}

/**
 * Update funding status by session ID and wallet index
 */
async function updateFundingStatusByIndex(
  sessionId: number,
  walletIndex: number,
  status: FundingStatus,
  txHash?: string,
): Promise<void> {
  const updates: Partial<IntermediateWallet> = {
    fundingStatus: status,
    updatedAt: new Date(),
  };

  if (txHash) {
    updates.fundingTxHash = txHash;
  }

  if (status === "funded") {
    updates.fundedAt = new Date();
  }

  await db
    .update(intermediateWalletsSchema)
    .set(updates)
    .where(
      and(
        eq(intermediateWalletsSchema.sessionId, sessionId),
        eq(intermediateWalletsSchema.walletIndex, walletIndex),
      ),
    );
}

/**
 * Update aggregation status for an intermediate wallet
 * @param walletId - The wallet ID
 * @param status - New aggregation status
 * @param txHash - Optional transaction hash (for confirmed status)
 * @param error - Optional error message (for failed status)
 */
async function updateAggregationStatus(
  walletId: number,
  status: AggregationStatus,
  txHash?: string,
  error?: string,
): Promise<void> {
  const updates: Partial<IntermediateWallet> = {
    aggregationStatus: status,
    updatedAt: new Date(),
  };

  if (txHash) {
    updates.aggregationTxHash = txHash;
  }

  if (status === "confirmed") {
    updates.aggregatedAt = new Date();
  }

  if (error) {
    updates.lastError = error;
  }

  await db
    .update(intermediateWalletsSchema)
    .set(updates)
    .where(eq(intermediateWalletsSchema.id, walletId));
}

/**
 * Update cleanup status for an intermediate wallet
 * @param walletId - The wallet ID
 * @param status - New cleanup status
 * @param dustReturnTxHash - Optional dust return transaction hash
 * @param ataCloseTxHash - Optional ATA close transaction hash
 * @param error - Optional error message (for failed status)
 */
async function updateCleanupStatus(
  walletId: number,
  status: CleanupStatus,
  dustReturnTxHash?: string,
  ataCloseTxHash?: string,
  error?: string,
): Promise<void> {
  const updates: Partial<IntermediateWallet> = {
    cleanupStatus: status,
    updatedAt: new Date(),
  };

  if (dustReturnTxHash) {
    updates.dustReturnTxHash = dustReturnTxHash;
  }

  if (ataCloseTxHash) {
    updates.ataCloseTxHash = ataCloseTxHash;
  }

  if (status === "completed") {
    updates.cleanedUpAt = new Date();
  }

  if (error) {
    updates.lastError = error;
  }

  await db
    .update(intermediateWalletsSchema)
    .set(updates)
    .where(eq(intermediateWalletsSchema.id, walletId));
}

/**
 * Set error on an intermediate wallet
 */
async function setError(walletId: number, error: string): Promise<void> {
  await db
    .update(intermediateWalletsSchema)
    .set({
      lastError: error,
      updatedAt: new Date(),
    })
    .where(eq(intermediateWalletsSchema.id, walletId));
}

/**
 * Get wallets ready for aggregation (funded and scheduled time has passed)
 */
async function getWalletsReadyForAggregation(
  currentTime: Date = new Date(),
): Promise<(IntermediateWallet & { custodialWallet: CustodialWallet })[]> {
  const wallets = await db.query.intermediateWalletsSchema.findMany({
    where: and(
      eq(intermediateWalletsSchema.fundingStatus, "funded"),
      eq(intermediateWalletsSchema.aggregationStatus, "scheduled"),
      lte(intermediateWalletsSchema.aggregationScheduledAt, currentTime),
    ),
    with: {
      custodialWallet: true,
    },
    orderBy: (iw, { asc }) => [asc(iw.aggregationScheduledAt)],
  });
  return wallets;
}

/**
 * Get wallets pending cleanup (for a specific session)
 * Includes both pending wallets AND failed wallets that are ready for retry
 */
async function getWalletsPendingCleanup(
  sessionId: number,
): Promise<(IntermediateWallet & { custodialWallet: CustodialWallet })[]> {
  const wallets = await db.query.intermediateWalletsSchema.findMany({
    where: and(
      eq(intermediateWalletsSchema.sessionId, sessionId),
      or(
        // Pending wallets
        eq(intermediateWalletsSchema.cleanupStatus, "pending"),
        // Failed wallets ready for retry (nextRetryAt has passed or not set)
        eq(intermediateWalletsSchema.cleanupStatus, "failed"),      ),
    ),
    with: {
      custodialWallet: true,
    },
    orderBy: (iw, { asc }) => [asc(iw.walletIndex)],
  });
  return wallets;
}

/**
 * Check if all wallets in a session are funded
 */
async function areAllWalletsFunded(sessionId: number): Promise<boolean> {
  const wallets = await db.query.intermediateWalletsSchema.findMany({
    where: eq(intermediateWalletsSchema.sessionId, sessionId),
  });

  return wallets.every((w) => w.fundingStatus === "funded");
}

/**
 * Check if all wallets in a session have aggregated
 */
async function areAllWalletsAggregated(sessionId: number): Promise<boolean> {
  const wallets = await db.query.intermediateWalletsSchema.findMany({
    where: eq(intermediateWalletsSchema.sessionId, sessionId),
  });

  return wallets.every((w) => w.aggregationStatus === "confirmed");
}

/**
 * Check if all wallets in a session are cleaned up
 */
async function areAllWalletsCleanedUp(sessionId: number): Promise<boolean> {
  const wallets = await db.query.intermediateWalletsSchema.findMany({
    where: eq(intermediateWalletsSchema.sessionId, sessionId),
  });

  return wallets.every((w) => w.cleanupStatus === "completed");
}

/**
 * Get intermediate wallet by session and index
 */
async function getWalletBySessionAndIndex(
  sessionId: number,
  walletIndex: number,
): Promise<(IntermediateWallet & { custodialWallet: CustodialWallet }) | null> {
  const wallet = await db.query.intermediateWalletsSchema.findFirst({
    where: and(
      eq(intermediateWalletsSchema.sessionId, sessionId),
      eq(intermediateWalletsSchema.walletIndex, walletIndex),
    ),
    with: {
      custodialWallet: true,
    },
  });
  return wallet || null;
}

const intermediateWalletService = {
  // Get operations
  getIntermediateWalletWithCustodial,
  getIntermediateWalletsWithCustodial,
  getWalletBySessionAndIndex,
  getKeypairForWallet,
  getPublicKeyForWallet,

  // Status updates
  updateFundingStatus,
  updateFundingStatusByIndex,
  updateAggregationStatus,
  updateCleanupStatus,
  setError,

  // Query operations
  getWalletsReadyForAggregation,
  getWalletsPendingCleanup,
  areAllWalletsFunded,
  areAllWalletsAggregated,
  areAllWalletsCleanedUp,
};

export { intermediateWalletService };
