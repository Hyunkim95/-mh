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
import {
  estimateDeploymentCost,
  getRecommendedPriorityFee,
} from "../../solana/services/contract.service";
import { createLogger } from "../../utils/logger";

const log = createLogger("ObfuscationService");

// Configuration constants
const MIN_INTERMEDIATE_WALLETS = 5;
const MAX_INTERMEDIATE_WALLETS = 8;
const MIN_AGGREGATION_DELAY_MS = 1 * 1000; // 1 second min delay (fast for user experience)
const MAX_AGGREGATION_DELAY_MS = 3 * 1000; // 3 seconds max delay (must complete before first hop)

// Base transaction fee
const BASE_TX_FEE_LAMPORTS = 5000;
// Fallback values used when RPC calls fail
const FALLBACK_ATA_RENT_LAMPORTS = 2039280;
const FALLBACK_RENT_EXEMPT_MINIMUM_LAMPORTS = 890880;
const FALLBACK_PRIORITY_FEE_LAMPORTS = 200000;

// Cache for dynamic values (refreshed periodically)
interface DynamicFeeCache {
  ataRentLamports: number;
  rentExemptMinimumLamports: number;
  priorityFeeLamports: number;
  lastUpdated: Date;
}

let feeCache: DynamicFeeCache | null = null;
const FEE_CACHE_TTL_MS = 60 * 1000; // 1 minute cache TTL

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
 * Get dynamic fee values from RPC, with caching to reduce RPC calls.
 * Falls back to hardcoded values if RPC fails.
 */
async function getDynamicFees(): Promise<DynamicFeeCache> {
  const now = new Date();

  // Return cached values if still valid
  if (
    feeCache &&
    now.getTime() - feeCache.lastUpdated.getTime() < FEE_CACHE_TTL_MS
  ) {
    return feeCache;
  }

  try {
    // Fetch all dynamic values in parallel
    const [ataRentLamports, rentExemptMinimumLamports, priorityFeeLamports] =
      await Promise.all([
        // ATA size is 165 bytes for Token accounts
        connection.getMinimumBalanceForRentExemption(165),
        // System account (0 bytes of data)
        connection.getMinimumBalanceForRentExemption(0),
        // Get recommended priority fee with 1.2x buffer for safety
        getRecommendedPriorityFee(connection).then((fee) =>
          Math.ceil(fee * 1.2),
        ),
      ]);

    feeCache = {
      ataRentLamports,
      rentExemptMinimumLamports,
      priorityFeeLamports,
      lastUpdated: now,
    };

    return feeCache;
  } catch (error) {
    log.warn(
      "Failed to fetch dynamic fees, using fallbacks:",
      error,
    );
    // Return fallback values
    return {
      ataRentLamports: FALLBACK_ATA_RENT_LAMPORTS,
      rentExemptMinimumLamports: FALLBACK_RENT_EXEMPT_MINIMUM_LAMPORTS,
      priorityFeeLamports: FALLBACK_PRIORITY_FEE_LAMPORTS,
      lastUpdated: now,
    };
  }
}

/**
 * Get minimum lamports per wallet (rent-exempt + fees buffer)
 */
async function getMinLamportsPerWallet(): Promise<number> {
  const fees = await getDynamicFees();
  return (
    fees.rentExemptMinimumLamports +
    BASE_TX_FEE_LAMPORTS +
    fees.priorityFeeLamports
  );
}

/**
 * Get deployment cost for a route using dynamic calculation
 */
function getDeploymentCost(hopCount: number, amountLamports: number): number {
  const costEstimate = estimateDeploymentCost(hopCount, amountLamports);
  // Add 10% buffer for safety
  return Math.ceil(costEstimate.totalCost * 1.1);
}

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
 * Each portion is guaranteed to be at least minPerWallet to ensure
 * rent-exemption and cover aggregation fees.
 *
 * Uses BN arithmetic throughout to avoid JavaScript Number overflow.
 */
async function generateRandomSplit(total: BN, count: number): Promise<BN[]> {
  if (count <= 0) {
    throw new Error("Count must be positive");
  }
  if (total.isZero() || total.isNeg()) {
    throw new Error("Total must be positive");
  }
  if (count === 1) {
    return [total];
  }

  const minLamportsPerWallet = await getMinLamportsPerWallet();
  const minPerWallet = new BN(minLamportsPerWallet);
  const minTotal = minPerWallet.mul(new BN(count));

  // Check if we have enough funds for the minimum per wallet
  if (total.lt(minTotal)) {
    throw new Error(
      `Insufficient funds for obfuscation: need at least ${minTotal.toString()} lamports for ${count} wallets, but only have ${total.toString()}`,
    );
  }

  // Allocate minimum to each wallet first
  const splits: BN[] = Array(count)
    .fill(null)
    .map(() => minPerWallet.clone());

  // Calculate remainder to distribute randomly
  const remainder = total.sub(minTotal);

  if (remainder.gt(new BN(0))) {
    // Generate random weights using exponential distribution for natural variation
    // This produces splits like [0.032, 0.008, 0.025, 0.011, 0.024] instead of
    // near-identical amounts that are obvious on chain explorers
    const weights: number[] = Array.from({ length: count }, () => {
      // Use crypto.randomInt for secure randomness, scaled to [0, 1)
      const rand = crypto.randomInt(0, 1_000_000) / 1_000_000;
      // Exponential distribution: -ln(1 - rand * 0.9), floored at 0.1 to prevent extremes
      return Math.max(0.1, -Math.log(1 - rand * 0.9));
    });

    // Normalize weights to sum to 1.0
    const weightSum = weights.reduce((acc, w) => acc + w, 0);
    const normalizedWeights = weights.map((w) => w / weightSum);

    // Multiply each weight by remainder to get extra share per wallet
    // Use high-precision integer math: multiply first, then divide
    const SCALE = 1_000_000_000;
    let distributed = new BN(0);

    for (let i = 0; i < count; i++) {
      const weightScaled = Math.floor(normalizedWeights[i] * SCALE);
      const extra = remainder.mul(new BN(weightScaled)).div(new BN(SCALE));
      splits[i] = splits[i].add(extra);
      distributed = distributed.add(extra);
    }

    // Distribute leftover lamports from rounding to random wallets
    const leftover = remainder.sub(distributed).toNumber(); // at most count-1, safe
    if (leftover > 0) {
      const indices = new Set<number>();
      while (indices.size < leftover) {
        indices.add(crypto.randomInt(0, count));
      }
      for (const idx of indices) {
        splits[idx] = splits[idx].add(new BN(1));
      }
    }
  }

  return splits;
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
  dustRefund: number; // SOL dust returned from intermediate wallets after cleanup
  netObfuscationCost: number;
  totalFeesLamports: number;
  deploymentCost: number; // Cost for route deployment from Wallet X
}

async function estimateObfuscationFees(
  intermediateCount: number,
  tokenType: "SOL" | "SPL",
  hopCount: number,
  amountLamports: number,
): Promise<ObfuscationFeeEstimate> {
  const fees = await getDynamicFees();
  const txFee = BASE_TX_FEE_LAMPORTS + fees.priorityFeeLamports;

  // ATA creation is only needed for SPL tokens
  const ataCreationCost = tokenType === "SPL" ? fees.ataRentLamports : 0;

  const intermediateAtaCreation = intermediateCount * ataCreationCost;
  const walletXAtaCreation = ataCreationCost;
  const fundingTxFees = intermediateCount * txFee;
  const aggregationTxFees = intermediateCount * txFee;
  const cleanupTxFeePerWallet = BASE_TX_FEE_LAMPORTS + fees.priorityFeeLamports;
  const cleanupTxFees = (intermediateCount + 1) * cleanupTxFeePerWallet;

  // Rent recovery when closing ATAs (only for SPL)
  const rentRecovery =
    tokenType === "SPL"
      ? (intermediateCount + 1) * (fees.ataRentLamports - BASE_TX_FEE_LAMPORTS)
      : 0;

  // Dust refund: cleanup drains each wallet to 0 (garbage collected)
  // Each wallet's full balance (minus its cleanup tx fee) is returned to the user
  const dustRefund =
    (intermediateCount + 1) *
    (fees.rentExemptMinimumLamports - cleanupTxFeePerWallet);

  // Get dynamic deployment cost based on hop count
  const deploymentCost = getDeploymentCost(hopCount, amountLamports);

  const netObfuscationCost =
    intermediateAtaCreation +
    walletXAtaCreation +
    fundingTxFees +
    aggregationTxFees +
    cleanupTxFees +
    deploymentCost -
    rentRecovery -
    dustRefund;

  return {
    intermediateAtaCreation,
    walletXAtaCreation,
    fundingTxFees,
    aggregationTxFees,
    cleanupTxFees,
    rentRecovery,
    dustRefund,
    netObfuscationCost,
    deploymentCost,
    totalFeesLamports: Math.max(0, netObfuscationCost),
  };
}

/**
 * Create a new obfuscation session for a route.
 *
 * This function is idempotent - if a session already exists for the route,
 * it returns the existing session instead of creating a duplicate.
 *
 * Uses database transactions to ensure atomicity of session and wallet creation.
 */
async function createSession(
  input: CreateObfuscationSessionInput & { hopCount?: number },
): Promise<ObfuscationSession> {
  // Check for existing session first (idempotency)
  const existingSession = await getSessionByRouteId(input.routeId);
  if (existingSession) {
    // If session exists and is not failed, return it
    if (existingSession.status !== "failed") {
      return existingSession;
    }
    // For failed sessions, we could reset or create new - for now, return existing
    // The caller can decide to handle failed sessions differently
    return existingSession;
  }

  const intermediateCount = getRandomIntermediateCount();
  const hopCount = input.hopCount || 1; // Default to 1 hop if not provided
  const amountLamports = parseInt(input.totalAmount, 10);

  // Generate Wallet X first (outside transaction since it involves external wallet creation)
  const walletXIdentifier = `obfuscation_wallet_x_route_${input.routeId}`;
  const walletX = await walletManager.getOrCreateWallet(walletXIdentifier);

  // Calculate fee estimate with dynamic values
  const feeEstimate = await estimateObfuscationFees(
    intermediateCount,
    input.tokenType,
    hopCount,
    amountLamports,
  );

  // Generate intermediate wallets in parallel
  const walletPromises = Array.from({ length: intermediateCount }, (_, i) => {
    const walletIdentifier = `obfuscation_intermediate_route_${input.routeId}_${i}`;
    return walletManager.getOrCreateWallet(walletIdentifier);
  });
  const intermediateWallets = await Promise.all(walletPromises);

  // Generate split amounts
  const totalAmount = new BN(input.totalAmount);
  const splitAmounts = await generateRandomSplit(
    totalAmount,
    intermediateCount,
  );

  // Use database transaction for atomicity
  try {
    const session = await db.transaction(async (tx) => {
      // Create the session
      const [newSession] = await tx
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

      // Create all intermediate wallet records in a batch
      const walletRecords = intermediateWallets.map((wallet, i) => ({
        sessionId: newSession.id,
        custodialWalletId: wallet.id,
        walletIndex: i,
        allocatedAmount: splitAmounts[i].toString(),
        fundingStatus: "pending" as const,
        aggregationStatus: "pending" as const,
        cleanupStatus: "pending" as const,
      }));

      await tx.insert(intermediateWalletsSchema).values(walletRecords);

      return newSession;
    });

    return session;
  } catch (error: any) {
    // Handle unique constraint violation (race condition)
    if (
      error.code === "23505" ||
      error.message?.includes("unique constraint")
    ) {
      // Another request created the session, fetch and return it
      const racedSession = await getSessionByRouteId(input.routeId);
      if (racedSession) {
        return racedSession;
      }
    }
    throw error;
  }
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
    // Fix operator precedence: wrap in parentheses to ensure correct addition
    updates.retryCount = ((await getSession(sessionId))?.retryCount || 0) + 1;
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
  getDynamicFees,
  getMinLamportsPerWallet,
  getDeploymentCost,

  // Constants (exported for use by other services)
  constants: {
    MIN_INTERMEDIATE_WALLETS,
    MAX_INTERMEDIATE_WALLETS,
    MIN_AGGREGATION_DELAY_MS,
    MAX_AGGREGATION_DELAY_MS,
    BASE_TX_FEE_LAMPORTS,
    // Fallback values (prefer using getDynamicFees() for accurate values)
    FALLBACK_ATA_RENT_LAMPORTS,
    FALLBACK_RENT_EXEMPT_MINIMUM_LAMPORTS,
    FALLBACK_PRIORITY_FEE_LAMPORTS,
    // Legacy aliases for backward compatibility
    ATA_RENT_LAMPORTS: FALLBACK_ATA_RENT_LAMPORTS,
    RENT_EXEMPT_MINIMUM_LAMPORTS: FALLBACK_RENT_EXEMPT_MINIMUM_LAMPORTS,
    ESTIMATED_PRIORITY_FEE_LAMPORTS: FALLBACK_PRIORITY_FEE_LAMPORTS,
    // Deployment cost - use getDeploymentCost() for dynamic calculation
    TOTAL_DEPLOYMENT_COST_LAMPORTS: 80_000_000, // 0.08 SOL fallback
    // Per-wallet aggregation fee
    AGGREGATION_FEE_PER_WALLET: 2_500_000, // 0.0025 SOL per wallet (covers tx fees + rent-exempt reserve)
  },
};
