import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { eq, sql } from "drizzle-orm";
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
import { hopsSchema } from "../../hops/schema/hops.schema";
import { tokenConfigsService } from "../../token-configs/services/token-configs.service";
import { createLogger } from "@libs/logger";

const log = createLogger("ObfuscationService");

// Configuration constants (configurable via env vars for e2e testing with shorter values)
const MIN_INTERMEDIATE_WALLETS = Number(process.env.OBFUSCATION_MIN_WALLETS) || 5;
const MAX_INTERMEDIATE_WALLETS = Number(process.env.OBFUSCATION_MAX_WALLETS) || 8;
const MIN_AGGREGATION_DELAY_MS = Number(process.env.OBFUSCATION_MIN_AGG_DELAY_MS) || 5 * 1000; // default 5 seconds
const MAX_AGGREGATION_DELAY_MS = Number(process.env.OBFUSCATION_MAX_AGG_DELAY_MS) || 30 * 1000; // default 30 seconds

// Base transaction fee
const BASE_TX_FEE_LAMPORTS = 5000;
// Fallback values used when RPC calls fail
const FALLBACK_ATA_RENT_LAMPORTS = 2039280;
const FALLBACK_RENT_EXEMPT_MINIMUM_LAMPORTS = 890880;
const FALLBACK_PRIORITY_FEE_LAMPORTS = 200000;

// Per-wallet aggregation fee
const AGGREGATION_FEE_PER_WALLET = 2_500_000; // 0.0025 SOL per wallet
// Total buffer added to funding so Wallet X can always pay its own cleanup tx after deployment.
// Split evenly across intermediate wallets — flows through aggregation to Wallet X.
const WALLET_X_CLEANUP_BUFFER_LAMPORTS = 3_000_000; // 0.003 SOL

// Compute units used by each tx type — kept here so the funding-tx builder
// and the up-front estimate stay in sync.
const FUNDING_TX_COMPUTE_UNITS = 100_000;
const AGG_TX_COMPUTE_UNITS = 100_000;
const CLEANUP_TX_COMPUTE_UNITS = 50_000;

// Cache for dynamic values (refreshed periodically)
interface DynamicFeeCache {
  ataRentLamports: number;
  rentExemptMinimumLamports: number;
  priorityFeeLamports: number;
  lastUpdated: Date;
}

let feeCache: DynamicFeeCache | null = null;
const FEE_CACHE_TTL_MS = 10 * 1000; // 10 second cache TTL (short to limit staleness across concurrent sessions)

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

const formatLamportsAsSol = (lamports: BN | number) => {
  const lamportsAsNumber = typeof lamports === "number" ? lamports : Number(lamports.toString());
  return (lamportsAsNumber / 1_000_000_000).toFixed(6);
};

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
    // Return stale cached values if available (better than a discontinuous
    // jump to hardcoded fallbacks). Cache the result either way to avoid
    // hammering the failing RPC on every subsequent call.
    const fallback: DynamicFeeCache = feeCache
      ? { ...feeCache, lastUpdated: now }
      : {
          ataRentLamports: FALLBACK_ATA_RENT_LAMPORTS,
          rentExemptMinimumLamports: FALLBACK_RENT_EXEMPT_MINIMUM_LAMPORTS,
          priorityFeeLamports: FALLBACK_PRIORITY_FEE_LAMPORTS,
          lastUpdated: now,
        };
    feeCache = fallback;
    return feeCache;
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
 * Per-wallet SOL components transferred during funding.
 *
 * This is the SINGLE SOURCE OF TRUTH for the per-wallet funding formula.
 * Both `buildFundingTransaction` (the actual on-chain transfer) and
 * `estimateObfuscationFees` (the up-front estimate the user sees) MUST use
 * this helper. Any divergence causes the deploy modal to lie to users about
 * required funds.
 */
export interface PerWalletFundingComponents {
  /** Per-wallet share of Wallet X's deployment cost */
  deploymentShare: number;
  /** Static aggregation reserve per wallet */
  aggregationFee: number;
  /** Reservation each wallet holds back during aggregation for its own cleanup tx */
  cleanupReservation: number;
  /** Per-wallet share of Wallet X's cleanup buffer (flows through aggregation) */
  walletXCleanupShare: number;
  /** Sum of the above — extra SOL added on top of the route allocation */
  extraSolForDeployment: number;
}

async function getPerWalletFundingComponents(
  totalWalletCount: number,
  hopCount: number,
  amountBaseUnits: number,
  tokenType: "SOL" | "SPL" = "SOL",
): Promise<PerWalletFundingComponents> {
  const fees = await getDynamicFees();
  const dynamicDeploymentCost = getDeploymentCost(
    hopCount,
    amountBaseUnits,
    tokenType,
  );
  const deploymentShare = Math.ceil(dynamicDeploymentCost / totalWalletCount);

  // Each wallet reserves SOL during aggregation for cleanup (tx fees + rent exempt).
  // Compute actual fees using dynamic priority fee, with 3x buffer for fee spikes.
  const cleanupPriority = Math.ceil(
    (CLEANUP_TX_COMPUTE_UNITS * fees.priorityFeeLamports) / 1_000_000,
  );
  const aggPriority = Math.ceil(
    (AGG_TX_COMPUTE_UNITS * fees.priorityFeeLamports) / 1_000_000,
  );
  const dynamicFeeComponent =
    (BASE_TX_FEE_LAMPORTS +
      cleanupPriority +
      (BASE_TX_FEE_LAMPORTS + aggPriority)) *
    3;
  const cleanupReservation =
    dynamicFeeComponent + fees.rentExemptMinimumLamports;

  const walletXCleanupShare = Math.ceil(
    WALLET_X_CLEANUP_BUFFER_LAMPORTS / totalWalletCount,
  );

  const extraSolForDeployment =
    deploymentShare +
    AGGREGATION_FEE_PER_WALLET +
    cleanupReservation +
    walletXCleanupShare;

  return {
    deploymentShare,
    aggregationFee: AGGREGATION_FEE_PER_WALLET,
    cleanupReservation,
    walletXCleanupShare,
    extraSolForDeployment,
  };
}

/**
 * Tight upper bound on the total SOL transferred to intermediate wallets
 * during SOL-route funding, across any allocation split.
 *
 * The on-chain per-wallet transfer (see `buildFundingTransaction`) is
 *     max(alloc_i + extra, min)
 * where alloc_i are the per-wallet route allocations produced by
 * `generateRandomSplit` (summing to routeAmount, each ≥ 0). The funded total
 * is therefore
 *     sum_i max(alloc_i + extra, min)
 * which is a convex function of the allocation vector over the simplex
 * { alloc : sum_i alloc_i = R, alloc_i ≥ 0 }. The maximum of a convex
 * function over a simplex is attained at a vertex — concentrate the entire
 * route amount on a single wallet — so the tight upper bound is
 *     max(R + extra, min) + (N - 1) * max(extra, min)
 *
 * In the happy path (extra ≥ min AND R + extra ≥ min) this simplifies to
 * R + N*extra, matching the actual sum when no wallet is floor-bound. In the
 * all-floor path (R + N*extra ≤ N*min) it simplifies to N*min. The formula
 * only strictly exceeds the happy-path number in the mixed regime where
 * extra < min — i.e. exactly the case the naive
 * `max(R + N*extra, N*min)` formula under-reports.
 */
function computeWorstCaseSolTransferLamports(
  routeAmountLamports: number,
  intermediateCount: number,
  extraSolPerWallet: number,
  minLamportsPerWallet: number,
): number {
  const concentratedWallet = Math.max(
    routeAmountLamports + extraSolPerWallet,
    minLamportsPerWallet,
  );
  const otherWallets =
    (intermediateCount - 1) *
    Math.max(extraSolPerWallet, minLamportsPerWallet);
  return concentratedWallet + otherWallets;
}

/**
 * Calculate the gross SOL the user must hold in their wallet at funding time.
 *
 * This is intentionally pre-refund — dust refund and rent recovery happen
 * during cleanup, AFTER deployment. The wallet must momentarily hold the full
 * amount to make the funding transactions succeed on-chain.
 *
 * For SOL routes: includes the route deposit itself.
 * For SPL routes: only the SOL overhead (the SPL deposit lives in a different account).
 */
async function getRequiredSolUpFrontLamports(
  intermediateCount: number,
  tokenType: "SOL" | "SPL",
  hopCount: number,
  amountBaseUnits: number,
  routeAmountLamports: number,
): Promise<number> {
  const fees = await getDynamicFees();
  const components = await getPerWalletFundingComponents(
    intermediateCount,
    hopCount,
    amountBaseUnits,
    tokenType,
  );

  const minLamportsPerWallet =
    fees.rentExemptMinimumLamports +
    BASE_TX_FEE_LAMPORTS +
    fees.priorityFeeLamports;

  // Funding tx fee paid by the user (fee payer of each funding tx).
  // Funding txs use FUNDING_TX_COMPUTE_UNITS for the priority fee instruction.
  const fundingTxPriorityFee = Math.ceil(
    (FUNDING_TX_COMPUTE_UNITS * fees.priorityFeeLamports) / 1_000_000,
  );
  const fundingTxFeePerWallet = BASE_TX_FEE_LAMPORTS + fundingTxPriorityFee;
  const totalFundingTxFees = intermediateCount * fundingTxFeePerWallet;

  // Per-wallet SOL transfer.
  // For SOL routes the route allocation is bundled into the same transfer as
  // extraSolForDeployment, with a floor of minLamportsPerWallet.
  // For SPL routes the SOL transfer is just the extra (with the same floor).
  let totalSolTransferred: number;
  if (tokenType === "SOL") {
    // The actual per-wallet transfer is `max(allocation + extra, minLamportsPerWallet)`
    // and allocations come from `generateRandomSplit`, which can produce
    // skewed splits where some wallets hit the floor and others do not. The
    // tight upper bound across any allocation split is computed by
    // `computeWorstCaseSolTransferLamports` (concentrate the whole route
    // amount on a single wallet); anything looser — e.g. the naive
    // `max(R + N*extra, N*min)` — under-reports in the mixed-floor regime.
    totalSolTransferred = computeWorstCaseSolTransferLamports(
      routeAmountLamports,
      intermediateCount,
      components.extraSolForDeployment,
      minLamportsPerWallet,
    );
  } else {
    // SPL route: SOL transfer per wallet is `max(extra, minLamportsPerWallet)`.
    // The route amount is paid in SPL via a separate transfer instruction.
    const perWalletSol = Math.max(
      components.extraSolForDeployment,
      minLamportsPerWallet,
    );
    totalSolTransferred = intermediateCount * perWalletSol;
  }

  // ATA creation cost paid by the user during funding (SPL only, when the
  // intermediate wallet's ATA does not yet exist). We assume worst-case (none
  // exist) so the estimate stays safe across reused intermediate wallets.
  const ataCreationCost =
    tokenType === "SPL" ? intermediateCount * fees.ataRentLamports : 0;

  return totalSolTransferred + totalFundingTxFees + ataCreationCost;
}

/**
 * Get deployment cost for a route using dynamic calculation.
 *
 * estimateDeploymentCost now returns pure lamport-denominated infrastructure
 * as `totalCostLamports` for both SOL and SPL, so no token-type branch is
 * needed here. Route fees (flatFee/percentageFee) are deducted from the
 * user's deposit by the contract during `initializeRoute`, not funded by
 * Wallet X.
 */
function getDeploymentCost(
  hopCount: number,
  amountBaseUnits: number,
  tokenType: "SOL" | "SPL" = "SOL",
): number {
  const costEstimate = estimateDeploymentCost(
    hopCount,
    amountBaseUnits,
    tokenType,
  );
  // 3x multiplier — estimateDeploymentCost underestimates on-chain rent;
  // excess is refunded to user during Wallet X cleanup
  return Math.ceil(costEstimate.totalCostLamports * 3);
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

  // Generate random weights using exponential distribution for natural variation
  // This produces varied splits instead of near-identical amounts obvious on chain explorers
  const MAX_SHARE_PCT = 0.5; // Cap: no wallet gets more than 50% of remainder
  const weights: number[] = Array.from({ length: count }, () => {
    const rand = crypto.randomInt(0, 1_000_000) / 1_000_000;
    return Math.max(0.1, -Math.log(1 - rand * 0.9));
  });
  const weightSum = weights.reduce((acc, w) => acc + w, 0);

  // Clamp normalized weights so no single wallet exceeds MAX_SHARE_PCT.
  // After clamping, re-normalize so they still sum to 1.
  // Converges in ≤ count iterations (each pass clamps at least one new wallet).
  let normalized = weights.map((w) => w / weightSum);
  let clamped = true;
  let maxIter = count;
  while (clamped && maxIter-- > 0) {
    clamped = false;
    let excess = 0;
    let unclamped = 0;
    for (let i = 0; i < normalized.length; i++) {
      if (normalized[i] > MAX_SHARE_PCT) {
        excess += normalized[i] - MAX_SHARE_PCT;
        normalized[i] = MAX_SHARE_PCT;
        clamped = true;
      } else {
        unclamped += normalized[i];
      }
    }
    if (clamped && unclamped > 0) {
      // Redistribute excess proportionally to unclamped wallets
      for (let i = 0; i < normalized.length; i++) {
        if (normalized[i] < MAX_SHARE_PCT) {
          normalized[i] += excess * (normalized[i] / unclamped);
        }
      }
    }
  }

  // Allocate weight-proportional share for ALL wallets.
  // The last wallet is computed from its weight like everyone else;
  // any BN rounding dust (a few lamports) is added to wallet 0.
  const splits: BN[] = [];
  let distributed = new BN(0);
  const SCALE = 1_000_000_000;

  for (let i = 0; i < count; i++) {
    const weightScaled = Math.floor(normalized[i] * SCALE);
    const split = total.mul(new BN(weightScaled)).div(new BN(SCALE));
    splits.push(split);
    distributed = distributed.add(split);
  }

  // Fix rounding dust: add any undistributed lamports to the first wallet
  const dust = total.sub(distributed);
  if (!dust.isZero()) {
    splits[0] = splits[0].add(dust);
  }

  return splits;
}

/**
 * Generate random aggregation schedule times.
 * Each wallet gets an evenly-spaced slot within [MIN, MAX] with small jitter,
 * guaranteeing at least BLOCK_TIME_MS separation between any two wallets
 * so no two transactions land in the same Solana block.
 */
const BLOCK_TIME_MS = 400;

function generateAggregationSchedule(
  count: number,
  baseTime: Date = new Date(),
): Date[] {
  const baseMs = baseTime.getTime();
  const window = MAX_AGGREGATION_DELAY_MS - MIN_AGGREGATION_DELAY_MS;
  // Slot spacing: divide the window evenly, but at least one block time apart
  const slotSpacing = Math.max(BLOCK_TIME_MS, Math.floor(window / count));
  // Max jitter per slot: half the gap minus block time, floored at 0
  const maxJitter = Math.max(0, Math.floor((slotSpacing - BLOCK_TIME_MS) / 2));

  const schedules: Date[] = [];
  for (let i = 0; i < count; i++) {
    const slotBase = MIN_AGGREGATION_DELAY_MS + i * slotSpacing;
    const jitter = maxJitter > 0 ? crypto.randomInt(0, maxJitter + 1) : 0;
    schedules.push(new Date(baseMs + slotBase + jitter));
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
  /**
   * Gross SOL the user's wallet must hold at funding time (pre-refund).
   * For SOL routes this includes the route deposit; for SPL routes this is
   * the SOL overhead only. Use this for pre-flight balance checks — NOT
   * `totalFeesLamports`, which is the post-refund net cost.
   */
  requiredSolUpFrontLamports: number;
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
  const deploymentCost = getDeploymentCost(hopCount, amountLamports, tokenType);

  // Cleanup reservation: each intermediate wallet holds back agg fee + 2x cleanup fee + rent-exempt
  // during aggregation. This reduces what reaches Wallet X and must be accounted for.
  // Matches the dynamic formula in buildFundingTransaction.
  const cleanupReservationPerWallet = txFee + 2 * cleanupTxFeePerWallet + fees.rentExemptMinimumLamports;
  const totalCleanupReservation = intermediateCount * cleanupReservationPerWallet;

  // Wallet X cleanup buffer: extra SOL so Wallet X can always pay its own cleanup tx after deployment
  const walletXCleanupBuffer = 3_000_000; // matches WALLET_X_CLEANUP_BUFFER_LAMPORTS

  const netObfuscationCost =
    intermediateAtaCreation +
    walletXAtaCreation +
    fundingTxFees +
    aggregationTxFees +
    cleanupTxFees +
    deploymentCost +
    totalCleanupReservation +
    walletXCleanupBuffer -
    rentRecovery -
    dustRefund;

  // Up-front SOL the user must hold at funding time. This uses the same
  // per-wallet formula as `buildFundingTransaction`, so the modal estimate
  // and the actual on-chain transfer cannot drift.
  // For SOL routes the route deposit is included; for SPL it is excluded.
  const routeAmountForUpFront = tokenType === "SOL" ? amountLamports : 0;
  const requiredSolUpFrontLamports = await getRequiredSolUpFrontLamports(
    intermediateCount,
    tokenType,
    hopCount,
    amountLamports,
    routeAmountForUpFront,
  );

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
    requiredSolUpFrontLamports,
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
    // Failed session — reset it so the scheduler retries from where it left off.
    // Wallets & splits are preserved; only the error state is cleared.
    log.info(`[Recovery] Session ${existingSession.id} for route ${input.routeId} is failed — resetting to pending`);
    await db
      .update(obfuscationSessionsSchema)
      .set({
        status: "pending" as ObfuscationSessionStatus,
        lastError: null,
        failureCount: 0,
        lastFailureAt: null,
        nextRetryAt: null,
      })
      .where(eq(obfuscationSessionsSchema.id, existingSession.id));
    return { ...existingSession, status: "pending" as ObfuscationSessionStatus };
  }

  const intermediateCount = getRandomIntermediateCount();
  // Query actual hop count from DB instead of trusting input (which may be 0 for draft routes)
  const hops = await db.select().from(hopsSchema).where(eq(hopsSchema.routeId, input.routeId));
  const hopCount = hops.length || input.hopCount || 1;
  // Inflate total by protocol fee so route receives user's intended amount after on-chain deduction.
  // Look up feeBps from token config; fall back to 50 bps (0.5%) if not found.
  let protocolFeeBps = 50;
  if (input.tokenMint) {
    const configs = await tokenConfigsService.findIn([input.tokenMint]);
    if (configs.length > 0 && configs[0].feeBps != null) {
      protocolFeeBps = configs[0].feeBps;
    }
  }
  const userAmountBN = new BN(input.totalAmount);
  const feeInflation = userAmountBN.mul(new BN(protocolFeeBps)).div(new BN(10000));
  const totalAmountBN = userAmountBN.add(feeInflation);
  const amountLamports = totalAmountBN.bitLength() <= 53
    ? totalAmountBN.toNumber()
    : Number.MAX_SAFE_INTEGER;

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

  // Use the gross up-front amount, not the post-refund net cost. The wallet
  // has to actually hold this SOL when funding txs land — dust refunds and
  // rent recovery happen later, during cleanup.
  const requiredSolLamports = new BN(feeEstimate.requiredSolUpFrontLamports);
  const creatorBalanceLamports = await connection.getBalance(
    new PublicKey(input.creator),
  );

  const creatorBalanceBN = new BN(creatorBalanceLamports);
  if (creatorBalanceBN.lt(requiredSolLamports)) {
    const requiredLabel =
      input.tokenType === "SOL"
        ? "route amount plus obfuscation overhead"
        : "obfuscation overhead";
    throw new Error(
      `Insufficient funds for obfuscation: need at least ${formatLamportsAsSol(
        requiredSolLamports,
      )} SOL for ${requiredLabel} (${requiredSolLamports.toString()} lamports), but wallet only has ${formatLamportsAsSol(
        creatorBalanceLamports,
      )} SOL (${creatorBalanceLamports} lamports)`,
    );
  }

  // Generate intermediate wallets in parallel
  const walletPromises = Array.from({ length: intermediateCount }, (_, i) => {
    const walletIdentifier = `obfuscation_intermediate_route_${input.routeId}_${i}`;
    return walletManager.getOrCreateWallet(walletIdentifier);
  });
  const intermediateWallets = await Promise.all(walletPromises);

  // Generate split amounts (totalAmountBN already created above)
  const splitAmounts = await generateRandomSplit(
    totalAmountBN,
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
          totalAmount: totalAmountBN.toString(),
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
    // Atomic increment — avoids read-then-write race under concurrency.
    // Matches the pattern used by recordFailureToDb in the scheduler.
    (updates as any).retryCount = sql`COALESCE(${obfuscationSessionsSchema.retryCount}, 0) + 1`;
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
  const session = await getSession(sessionId);
  if (!session) {
    return;
  }

  const wallets = await getIntermediateWallets(sessionId);
  const walletsToSchedule = wallets.filter(
    (wallet) => wallet.aggregationStatus === "pending",
  );

  if (walletsToSchedule.length === 0) {
    // Another request or retry already scheduled (or progressed) these wallets.
    // Keep the existing schedule/status instead of reshuffling aggregation times.
    if (session.status !== "aggregating") {
      await updateSessionStatus(sessionId, "aggregating");
    }
    return;
  }

  const schedules = generateAggregationSchedule(walletsToSchedule.length);

  for (let i = 0; i < walletsToSchedule.length; i++) {
    await db
      .update(intermediateWalletsSchema)
      .set({
        aggregationScheduledAt: schedules[i],
        aggregationStatus: "scheduled",
        updatedAt: new Date(),
      })
      .where(eq(intermediateWalletsSchema.id, walletsToSchedule[i].id));
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
  generateAggregationSchedule,
  estimateObfuscationFees,
  getRequiredSolUpFrontLamports,
  computeWorstCaseSolTransferLamports,
  getPerWalletFundingComponents,
  getWalletManager,
  getConnection,
  getDynamicFees,
  getMinLamportsPerWallet,
  getDeploymentCost,
  _resetFeeCache: () => {
    feeCache = null;
  },

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
    // Per-wallet aggregation fee
    AGGREGATION_FEE_PER_WALLET,
    // Total buffer added to funding so Wallet X can always pay its own cleanup tx after deployment.
    // Split evenly across intermediate wallets — flows through aggregation to Wallet X.
    WALLET_X_CLEANUP_BUFFER_LAMPORTS,
  },
};
