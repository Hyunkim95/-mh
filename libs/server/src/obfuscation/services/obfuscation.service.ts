import { Connection, clusterApiUrl } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import BN from "bn.js";
import { db } from "../../db";
import {
  obfuscationSessionsSchema,
  intermediateWalletsSchema,
  ObfuscationSession,
  IntermediateWallet,
  ObfuscationSessionStatus,
  CreateObfuscationSessionInput,
  ObfuscationSessionWithWallets,
} from "../schema/obfuscation.schema";
// custodialWalletsSchema is used implicitly through SolanaWalletManager
import { SolanaWalletManager } from "@libs/solana-node";

// Configuration constants
const MIN_INTERMEDIATE_WALLETS = 5;
const MAX_INTERMEDIATE_WALLETS = 8;
const MIN_AGGREGATION_DELAY_MS = 1 * 1000; // 1 second min delay (fast for user experience)
const MAX_AGGREGATION_DELAY_MS = 3 * 1000; // 3 seconds max delay (must complete before first hop)

// ATA rent in lamports (approximately 0.00203 SOL)
const ATA_RENT_LAMPORTS = 2039280;
// Base transaction fee
const BASE_TX_FEE_LAMPORTS = 5000;
// Estimated priority fee
const ESTIMATED_PRIORITY_FEE_LAMPORTS = 200000;

// Initialize Solana connection
const connection = new Connection(
  process.env.SOLANA_RPC_URL || clusterApiUrl("mainnet-beta"),
  "confirmed",
);

// Initialize wallet manager
const walletManager = new SolanaWalletManager({
  encryptionKey: process.env.WALLET_ENCRYPTION_KEY || "",
  database: db,
  connection,
});

/**
 * Generate a random number of intermediate wallets (between 5 and 8)
 */
function getRandomIntermediateCount(): number {
  return (
    MIN_INTERMEDIATE_WALLETS +
    Math.floor(
      crypto.randomInt(MAX_INTERMEDIATE_WALLETS - MIN_INTERMEDIATE_WALLETS + 1),
    )
  );
}

/**
 * Generate a cryptographically secure random split of a total amount
 * into N portions that sum exactly to the total.
 *
 * Uses random breakpoints to create a natural-looking distribution.
 */
function generateRandomSplit(total: BN, count: number): BN[] {
  if (count <= 0) {
    throw new Error("Count must be positive");
  }
  if (total.isZero() || total.isNeg()) {
    throw new Error("Total must be positive");
  }
  if (count === 1) {
    return [total];
  }

  // Generate n-1 random breakpoints in the range [1, total-1]
  // Then sort them to create segments
  const breakpoints: BN[] = [];
  const totalNum = total.toNumber(); // Safe for reasonable token amounts

  for (let i = 0; i < count - 1; i++) {
    // Generate random value between 1 and totalNum - 1
    const bp = crypto.randomInt(1, totalNum);
    breakpoints.push(new BN(bp));
  }

  // Sort breakpoints
  breakpoints.sort((a, b) => a.cmp(b));

  // Calculate segments
  const splits: BN[] = [];
  let prev = new BN(0);

  for (const bp of breakpoints) {
    const segment = bp.sub(prev);
    splits.push(segment);
    prev = bp;
  }

  // Last segment
  splits.push(total.sub(prev));

  // Ensure no zero segments by redistributing
  const nonZeroSplits = splits.filter((s) => !s.isZero());
  if (nonZeroSplits.length < count) {
    // If we got zeros, redistribute from largest segments
    // This is a simple approach - take 1 from largest and give to zeros
    while (nonZeroSplits.length < count) {
      // Find largest
      let maxIdx = 0;
      for (let i = 1; i < nonZeroSplits.length; i++) {
        if (nonZeroSplits[i].gt(nonZeroSplits[maxIdx])) {
          maxIdx = i;
        }
      }
      // Take 1 from largest
      if (nonZeroSplits[maxIdx].gt(new BN(1))) {
        nonZeroSplits[maxIdx] = nonZeroSplits[maxIdx].sub(new BN(1));
        nonZeroSplits.push(new BN(1));
      } else {
        // Can't split further, this shouldn't happen with reasonable amounts
        break;
      }
    }
  }

  return nonZeroSplits;
}

/**
 * Generate random aggregation schedule times
 * Each wallet gets a random delay before it transfers to Wallet X
 */
function generateAggregationSchedule(
  count: number,
  baseTime: Date = new Date(),
): Date[] {
  const schedules: Date[] = [];
  const baseMs = baseTime.getTime();

  for (let i = 0; i < count; i++) {
    const delayMs = crypto.randomInt(
      MIN_AGGREGATION_DELAY_MS,
      MAX_AGGREGATION_DELAY_MS + 1,
    );
    schedules.push(new Date(baseMs + delayMs));
  }

  return schedules;
}

/**
 * Estimate the total fees required for obfuscation
 */
export interface ObfuscationFeeEstimate {
  intermediateAtaCreation: number;
  walletXAtaCreation: number;
  fundingTxFees: number;
  aggregationTxFees: number;
  cleanupTxFees: number;
  rentRecovery: number;
  netObfuscationCost: number;
  totalFeesLamports: number;
}

function estimateObfuscationFees(
  intermediateCount: number,
  tokenType: "SOL" | "SPL",
): ObfuscationFeeEstimate {
  const txFee = BASE_TX_FEE_LAMPORTS + ESTIMATED_PRIORITY_FEE_LAMPORTS;

  // ATA creation is only needed for SPL tokens
  const ataCreationCost = tokenType === "SPL" ? ATA_RENT_LAMPORTS : 0;

  const intermediateAtaCreation = intermediateCount * ataCreationCost;
  const walletXAtaCreation = ataCreationCost;
  const fundingTxFees = intermediateCount * txFee;
  const aggregationTxFees = intermediateCount * txFee;
  const cleanupTxFees = (intermediateCount + 1) * BASE_TX_FEE_LAMPORTS; // Cheaper, no priority needed

  // Rent recovery when closing ATAs (only for SPL)
  const rentRecovery =
    tokenType === "SPL"
      ? (intermediateCount + 1) * (ATA_RENT_LAMPORTS - BASE_TX_FEE_LAMPORTS)
      : 0;

  const netObfuscationCost =
    intermediateAtaCreation +
    walletXAtaCreation +
    fundingTxFees +
    aggregationTxFees +
    cleanupTxFees -
    rentRecovery;

  return {
    intermediateAtaCreation,
    walletXAtaCreation,
    fundingTxFees,
    aggregationTxFees,
    cleanupTxFees,
    rentRecovery,
    netObfuscationCost,
    totalFeesLamports: Math.max(0, netObfuscationCost),
  };
}

/**
 * Create a new obfuscation session for a route
 */
async function createSession(
  input: CreateObfuscationSessionInput,
): Promise<ObfuscationSession> {
  const intermediateCount = getRandomIntermediateCount();

  // Generate Wallet X first
  const walletXIdentifier = `obfuscation_wallet_x_route_${input.routeId}_${Date.now()}`;
  const walletX = await walletManager.getOrCreateWallet(walletXIdentifier);

  // Calculate fee estimate
  const feeEstimate = estimateObfuscationFees(
    intermediateCount,
    input.tokenType,
  );

  // Create the session
  const [session] = await db
    .insert(obfuscationSessionsSchema)
    .values({
      routeId: input.routeId,
      status: "pending",
      walletXId: walletX.id,
      intermediateCount,
      tokenMint: input.tokenMint,
      tokenType: input.tokenType,
      totalAmount: input.totalAmount,
      estimatedFeesLamports: feeEstimate.totalFeesLamports.toString(),
    })
    .returning();

  // Generate intermediate wallets
  const totalAmount = new BN(input.totalAmount);
  const splitAmounts = generateRandomSplit(totalAmount, intermediateCount);

  for (let i = 0; i < intermediateCount; i++) {
    const walletIdentifier = `obfuscation_intermediate_${session.id}_${i}_${Date.now()}`;
    const wallet = await walletManager.getOrCreateWallet(walletIdentifier);

    await db.insert(intermediateWalletsSchema).values({
      sessionId: session.id,
      custodialWalletId: wallet.id,
      walletIndex: i,
      allocatedAmount: splitAmounts[i].toString(),
      fundingStatus: "pending",
      aggregationStatus: "pending",
      cleanupStatus: "pending",
    });
  }

  return session;
}

/**
 * Get session by route ID
 */
async function getSessionByRouteId(
  routeId: number,
): Promise<ObfuscationSession | null> {
  const session = await db.query.obfuscationSessionsSchema.findFirst({
    where: eq(obfuscationSessionsSchema.routeId, routeId),
  });
  return session || null;
}

/**
 * Get session with wallet addresses joined
 */
async function getSessionWithWallets(
  sessionId: number,
): Promise<ObfuscationSessionWithWallets | null> {
  const session = await db.query.obfuscationSessionsSchema.findFirst({
    where: eq(obfuscationSessionsSchema.id, sessionId),
    with: {
      walletX: true,
      intermediateWallets: {
        with: {
          custodialWallet: true,
        },
        orderBy: (iw, { asc }) => [asc(iw.walletIndex)],
      },
    },
  });

  if (!session) return null;

  return {
    ...session,
    walletXAddress: session.walletX?.address,
    intermediateWallets: session.intermediateWallets.map((iw) => ({
      ...iw,
      address: iw.custodialWallet.address,
    })),
  };
}

/**
 * Update session status
 */
async function updateSessionStatus(
  sessionId: number,
  status: ObfuscationSessionStatus,
  error?: string,
): Promise<void> {
  const updates: Partial<ObfuscationSession> = {
    status,
  };

  if (error) {
    updates.lastError = error;
    updates.retryCount = (await getSession(sessionId))?.retryCount || 0 + 1;
  }

  if (status === "funding") {
    updates.startedAt = new Date();
  }

  if (status === "completed") {
    updates.completedAt = new Date();
  }

  await db
    .update(obfuscationSessionsSchema)
    .set(updates)
    .where(eq(obfuscationSessionsSchema.id, sessionId));
}

/**
 * Get session by ID
 */
async function getSession(
  sessionId: number,
): Promise<ObfuscationSession | null> {
  const session = await db.query.obfuscationSessionsSchema.findFirst({
    where: eq(obfuscationSessionsSchema.id, sessionId),
  });
  return session || null;
}

/**
 * Get all intermediate wallets for a session
 */
async function getIntermediateWallets(
  sessionId: number,
): Promise<IntermediateWallet[]> {
  const wallets = await db.query.intermediateWalletsSchema.findMany({
    where: eq(intermediateWalletsSchema.sessionId, sessionId),
    orderBy: (iw, { asc }) => [asc(iw.walletIndex)],
  });
  return wallets;
}

/**
 * Schedule aggregation times for intermediate wallets
 * Called after all funding is confirmed
 */
async function scheduleAggregations(sessionId: number): Promise<void> {
  const wallets = await getIntermediateWallets(sessionId);
  const schedules = generateAggregationSchedule(wallets.length);

  for (let i = 0; i < wallets.length; i++) {
    await db
      .update(intermediateWalletsSchema)
      .set({
        aggregationScheduledAt: schedules[i],
        aggregationStatus: "scheduled",
        updatedAt: new Date(),
      })
      .where(eq(intermediateWalletsSchema.id, wallets[i].id));
  }

  // Update session status
  await updateSessionStatus(sessionId, "aggregating");
}

/**
 * Mark session as completed with actual fees
 */
async function completeSession(
  sessionId: number,
  actualFeesLamports: string,
): Promise<void> {
  await db
    .update(obfuscationSessionsSchema)
    .set({
      status: "completed",
      actualFeesLamports,
      completedAt: new Date(),
    })
    .where(eq(obfuscationSessionsSchema.id, sessionId));
}

/**
 * Get the wallet manager instance (for use by other services)
 */
function getWalletManager(): SolanaWalletManager {
  return walletManager;
}

/**
 * Get the Solana connection (for use by other services)
 */
function getConnection(): Connection {
  return connection;
}

export const obfuscationService = {
  // Session management
  createSession,
  getSession,
  getSessionByRouteId,
  getSessionWithWallets,
  updateSessionStatus,
  completeSession,

  // Intermediate wallet management
  getIntermediateWallets,
  scheduleAggregations,

  // Utilities
  generateRandomSplit,
  estimateObfuscationFees,
  getWalletManager,
  getConnection,

  // Constants (exported for use by other services)
  constants: {
    MIN_INTERMEDIATE_WALLETS,
    MAX_INTERMEDIATE_WALLETS,
    MIN_AGGREGATION_DELAY_MS,
    MAX_AGGREGATION_DELAY_MS,
    ATA_RENT_LAMPORTS,
    BASE_TX_FEE_LAMPORTS,
    ESTIMATED_PRIORITY_FEE_LAMPORTS,
  },
};
