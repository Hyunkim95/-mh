import {
  Transaction,
  PublicKey,
  SystemProgram,
  Keypair,
  Connection,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  createCloseAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import BN from "bn.js";
import { obfuscationService } from "./obfuscation.service";
import { intermediateWalletService } from "./intermediate-wallet.service";
import { walletXService } from "./wallet-x.service";
import {
  serialize,
  createDynamicPriorityInstructions,
  getRecommendedPriorityFee,
  createComputeUnitLimitInstruction,
  createPriorityFeeInstruction,
} from "../../solana/services/contract.service";
import { createLogger } from "@libs/logger";
import { db } from "../../db";
import { hopsSchema } from "../../hops/schema/hops.schema";
import { eq } from "drizzle-orm";

const log = createLogger("ObfuscationTxBuilder");

// Get connection from obfuscation service
const getConnection = () => obfuscationService.getConnection();

/**
 * Build common cleanup transaction logic
 * Used by both intermediate wallet and Wallet X cleanup
 *
 * Drains the account to exactly 0 lamports so Solana garbage collects it.
 * Since we set the priority fee ourselves, the tx fee is deterministic:
 *   exactFee = 5000 (base) + ceil(computeUnits * priorityFee / 1_000_000)
 * We transfer balance - exactFee, and after fee deduction the account hits 0.
 */
async function buildCleanupTxCore(
  connection: Connection,
  ownerPublicKey: PublicKey,
  destinationWallet: PublicKey,
  tokenMint: string | null,
): Promise<Transaction | null> {
  const { BASE_TX_FEE_LAMPORTS } = obfuscationService.constants;

  const balance = await connection.getBalance(ownerPublicKey);

  // Query the priority fee ONCE and reuse for both fee calculation and tx instructions.
  // This avoids a TOCTOU race: if gas spikes between two separate queries,
  // the fee baked into the tx would differ from exactTxFee, leaving the
  // account with non-zero dust (below rent-exempt) or causing insufficient funds.
  const CLEANUP_COMPUTE_UNITS = 50_000;
  const recommendedPriorityFee = await getRecommendedPriorityFee(connection);
  const priorityFeeLamports = Math.ceil(
    (CLEANUP_COMPUTE_UNITS * recommendedPriorityFee) / 1_000_000,
  );
  const exactTxFee = BASE_TX_FEE_LAMPORTS + priorityFeeLamports;

  // Skip cleanup if balance can't cover the tx fee.
  // The fee is deterministic (we set CU limit + priority fee ourselves),
  // so transfer = balance - exactTxFee leaves exactly 0 after fee deduction,
  // and Solana garbage-collects the account.
  if (balance <= exactTxFee) {
    log.info(
      `Skipping cleanup for ${ownerPublicKey.toBase58()} - balance ${balance} too low to cover tx fee ${exactTxFee}`,
    );
    return null;
  }

  const transaction = new Transaction();

  // Build priority instructions from the SAME fee value used to calculate exactTxFee
  transaction.add(createComputeUnitLimitInstruction(CLEANUP_COMPUTE_UNITS));
  transaction.add(createPriorityFeeInstruction(recommendedPriorityFee));

  // Close ATA if it's an SPL token
  if (tokenMint) {
    const mint = new PublicKey(tokenMint);
    const ata = await getAssociatedTokenAddress(mint, ownerPublicKey);

    try {
      const account = await getAccount(connection, ata);
      if (account.amount === BigInt(0)) {
        transaction.add(
          createCloseAccountInstruction(ata, destinationWallet, ownerPublicKey),
        );
      }
    } catch {
      // ATA doesn't exist
    }
  }

  // Transfer entire remaining balance minus the exact tx fee
  // Account ends at 0 lamports after fee deduction → garbage collected
  const transferAmount = balance - exactTxFee;

  log.info(
    `${ownerPublicKey.toBase58()} - draining ${transferAmount} lamports (balance=${balance}, fee=${exactTxFee}), account will be closed`,
  );
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: ownerPublicKey,
      toPubkey: destinationWallet,
      lamports: transferAmount,
    }),
  );

  return transaction;
}

/**
 * Build a funding transaction: Source -> Intermediate wallet
 * Includes ATA creation if needed for SPL tokens
 * Returns transaction to be signed by the source wallet (user)
 *
 * @param totalWalletCount - Total number of intermediate wallets in the session
 *   Used to calculate per-wallet share of deployment costs
 * @param hopCount - Number of hops in the route (for dynamic deployment cost)
 * @param amountLamports - Route amount in lamports (for dynamic deployment cost)
 */
async function buildFundingTransaction(
  sourceWallet: PublicKey,
  intermediateWalletAddress: PublicKey,
  amount: BN,
  tokenMint?: PublicKey, // null for SOL
  totalWalletCount: number = 2, // Default to 2 for backwards compatibility
  hopCount: number = 1,
  amountLamports: number = 100_000_000,
): Promise<{ transaction: Transaction; serialized: string }> {
  const transaction = new Transaction();
  const connection = getConnection();
  const minLamportsPerWallet = await obfuscationService.getMinLamportsPerWallet();

  // Add priority fee instructions with lower compute units for simple transfers
  // Default is 400k, but simple SPL transfers only need ~50k-100k
  const priorityInstructions = await createDynamicPriorityInstructions(
    connection,
    100_000, // Reduced from 400k to fit within tx size limit with Phantom Lighthouse
  );
  priorityInstructions.forEach((ix) => transaction.add(ix));

  if (tokenMint) {
    // SPL Token transfer
    const sourceAta = await getAssociatedTokenAddress(tokenMint, sourceWallet);
    const destinationAta = await getAssociatedTokenAddress(
      tokenMint,
      intermediateWalletAddress,
    );

    // Check if destination ATA exists, if not create it
    try {
      await getAccount(connection, destinationAta);
    } catch {
      // ATA doesn't exist, add creation instruction
      transaction.add(
        createAssociatedTokenAccountInstruction(
          sourceWallet, // payer
          destinationAta, // ata
          intermediateWalletAddress, // owner
          tokenMint, // mint
        ),
      );
    }

    // Add SPL token transfer instruction
    transaction.add(
      createTransferInstruction(
        sourceAta, // from
        destinationAta, // to
        sourceWallet, // owner
        BigInt(amount.toString()), // amount
      ),
    );

    // ALSO send SOL to intermediate wallet for:
    // 1. Aggregation transaction fees (per wallet)
    // 2. SOL to forward to Wallet X for route deployment (split among all wallets)
    // 3. Cleanup reservation (tx fee + rent exempt) that gets held back during aggregation
    // 4. Wallet X cleanup buffer — ensures Wallet X has SOL for its own cleanup tx after deployment
    const { AGGREGATION_FEE_PER_WALLET, BASE_TX_FEE_LAMPORTS, WALLET_X_CLEANUP_BUFFER_LAMPORTS } =
      obfuscationService.constants;
    const fees = await obfuscationService.getDynamicFees();
    const dynamicDeploymentCost = obfuscationService.getDeploymentCost(hopCount, amountLamports);
    const deploymentSharePerWallet = Math.ceil(
      dynamicDeploymentCost / totalWalletCount,
    );
    // Each wallet reserves SOL during aggregation for cleanup (tx fees + rent exempt).
    // Compute actual fees using dynamic priority fee, with 3x buffer for fee spikes.
    const CLEANUP_COMPUTE_UNITS = 50_000;
    const AGG_COMPUTE_UNITS = 100_000;
    const cleanupPriority = Math.ceil((CLEANUP_COMPUTE_UNITS * fees.priorityFeeLamports) / 1_000_000);
    const aggPriority = Math.ceil((AGG_COMPUTE_UNITS * fees.priorityFeeLamports) / 1_000_000);
    const dynamicFeeComponent = ((BASE_TX_FEE_LAMPORTS + cleanupPriority) + (BASE_TX_FEE_LAMPORTS + aggPriority)) * 3;
    const cleanupReservationPerWallet = dynamicFeeComponent + fees.rentExemptMinimumLamports;
    // Extra buffer split across wallets so Wallet X can always pay its own cleanup tx
    const walletXCleanupSharePerWallet = Math.ceil(WALLET_X_CLEANUP_BUFFER_LAMPORTS / totalWalletCount);
    const totalSolFunding =
      deploymentSharePerWallet + AGGREGATION_FEE_PER_WALLET + cleanupReservationPerWallet + walletXCleanupSharePerWallet;
    const safeTotalSolFunding = Math.max(totalSolFunding, minLamportsPerWallet);

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: sourceWallet,
        toPubkey: intermediateWalletAddress,
        lamports: safeTotalSolFunding,
      }),
    );
  } else {
    // SOL transfer: allocated amount + extra SOL for Wallet X deployment costs
    // Uses dynamic deployment cost based on actual hop count + 15% buffer
    // Plus per-wallet aggregation fees, cleanup reservation, and Wallet X cleanup buffer
    const { AGGREGATION_FEE_PER_WALLET, BASE_TX_FEE_LAMPORTS, WALLET_X_CLEANUP_BUFFER_LAMPORTS } =
      obfuscationService.constants;
    const fees = await obfuscationService.getDynamicFees();
    const dynamicDeploymentCost = obfuscationService.getDeploymentCost(hopCount, amountLamports);
    const deploymentSharePerWallet = Math.ceil(
      dynamicDeploymentCost / totalWalletCount,
    );
    // Each wallet reserves SOL during aggregation for cleanup (tx fees + rent exempt).
    // Compute actual fees using dynamic priority fee, with 3x buffer for fee spikes.
    const CLEANUP_COMPUTE_UNITS = 50_000;
    const AGG_COMPUTE_UNITS = 100_000;
    const cleanupPriority = Math.ceil((CLEANUP_COMPUTE_UNITS * fees.priorityFeeLamports) / 1_000_000);
    const aggPriority = Math.ceil((AGG_COMPUTE_UNITS * fees.priorityFeeLamports) / 1_000_000);
    const dynamicFeeComponent = ((BASE_TX_FEE_LAMPORTS + cleanupPriority) + (BASE_TX_FEE_LAMPORTS + aggPriority)) * 3;
    const cleanupReservationPerWallet = dynamicFeeComponent + fees.rentExemptMinimumLamports;
    // Extra buffer split across wallets so Wallet X can always pay its own cleanup tx
    const walletXCleanupSharePerWallet = Math.ceil(WALLET_X_CLEANUP_BUFFER_LAMPORTS / totalWalletCount);
    const extraSolForDeployment =
      deploymentSharePerWallet + AGGREGATION_FEE_PER_WALLET + cleanupReservationPerWallet + walletXCleanupSharePerWallet;
    const totalFunding = Math.max(
      amount.toNumber() + extraSolForDeployment,
      minLamportsPerWallet,
    );

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: sourceWallet,
        toPubkey: intermediateWalletAddress,
        lamports: totalFunding,
      }),
    );
  }

  // Serialize for user to sign
  const { transaction: serialized } = await serialize(
    transaction,
    sourceWallet,
    connection,
  );

  return { transaction, serialized };
}

/**
 * Build all funding transactions for a session
 * Returns array of serialized transactions for batch signing
 */
async function buildAllFundingTransactions(
  sessionId: number,
  sourceWallet: PublicKey,
): Promise<
  Array<{
    walletIndex: number;
    serialized: string;
    destinationAddress: string;
    amount: string;
  }>
> {
  const session = await obfuscationService.getSessionWithWallets(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const tokenMint = session.tokenMint
    ? new PublicKey(session.tokenMint)
    : undefined;
  const results: Array<{
    walletIndex: number;
    serialized: string;
    destinationAddress: string;
    amount: string;
  }> = [];

  const totalWalletCount = session.intermediateWallets.length;

  // Query hop count for dynamic deployment cost calculation
  const hops = await db
    .select()
    .from(hopsSchema)
    .where(eq(hopsSchema.routeId, session.routeId));
  const hopCount = hops.length || 1;
  const routeAmountLamports = parseInt(session.totalAmount, 10);

  for (const wallet of session.intermediateWallets) {
    // Skip already funded wallets (for idempotency)
    if (wallet.fundingStatus === "funded") {
      continue;
    }

    const amount = new BN(wallet.allocatedAmount);
    const destinationAddress = new PublicKey(wallet.address);

    const { serialized } = await buildFundingTransaction(
      sourceWallet,
      destinationAddress,
      amount,
      tokenMint,
      totalWalletCount,
      hopCount,
      routeAmountLamports,
    );

    results.push({
      walletIndex: wallet.walletIndex,
      serialized,
      destinationAddress: wallet.address,
      amount: wallet.allocatedAmount,
    });
  }

  return results;
}

/**
 * Build an aggregation transaction: Intermediate -> Wallet X
 * This is signed by the intermediate wallet (server has the key)
 */
async function buildAggregationTransaction(
  intermediateWalletId: number,
  sessionId: number,
): Promise<{ transaction: Transaction; signer: Keypair } | null> {
  const session = await obfuscationService.getSession(sessionId);
  if (!session) return null;

  const walletX = await walletXService.getWalletX(sessionId);
  if (!walletX) return null;

  const intermediateWallet =
    await intermediateWalletService.getIntermediateWalletWithCustodial(
      intermediateWalletId,
    );
  if (!intermediateWallet) return null;

  const signer =
    await intermediateWalletService.getKeypairForWallet(intermediateWalletId);
  if (!signer) return null;

  const connection = getConnection();
  const transaction = new Transaction();

  // Add priority fee instructions with lower compute units for simple transfers
  const priorityInstructions = await createDynamicPriorityInstructions(
    connection,
    100_000, // Reduced from 400k - simple transfers don't need high compute
  );
  priorityInstructions.forEach((ix) => transaction.add(ix));

  const intermediatePublicKey = signer.publicKey;
  const walletXPublicKey = new PublicKey(walletX.address);
  const amount = new BN(intermediateWallet.allocatedAmount);

  const { BASE_TX_FEE_LAMPORTS, RENT_EXEMPT_MINIMUM_LAMPORTS } =
    obfuscationService.constants;

  // Calculate actual transaction fee dynamically based on priority fee
  const computeUnits = 100_000; // Same as what we set in priority instructions
  const recommendedPriorityFee = await getRecommendedPriorityFee(connection);
  const priorityFeeLamports = Math.ceil(
    (computeUnits * recommendedPriorityFee) / 1_000_000,
  );
  // Reserve enough for this aggregation tx fee + cleanup tx fee
  // Cleanup uses 50k compute units and drains the account to 0
  const cleanupPriorityFee = Math.ceil(
    (50_000 * recommendedPriorityFee) / 1_000_000,
  );
  const cleanupTxFee = BASE_TX_FEE_LAMPORTS + cleanupPriorityFee;
  const actualTxFee = BASE_TX_FEE_LAMPORTS + priorityFeeLamports + cleanupTxFee;

  const solBalance = await connection.getBalance(intermediatePublicKey);

  log.info(
    `${intermediatePublicKey.toBase58()} - solBalance=${solBalance}, actualTxFee=${actualTxFee}, RENT_EXEMPT=${RENT_EXEMPT_MINIMUM_LAMPORTS}, cleanupTxFee=${cleanupTxFee}, priorityFee=${priorityFeeLamports}`,
  );

  let solTransferAmount: number;

  if (session.tokenMint) {
    // SPL Token transfer
    const tokenMint = new PublicKey(session.tokenMint);
    const sourceAta = await getAssociatedTokenAddress(
      tokenMint,
      intermediatePublicKey,
    );
    const destinationAta = await getAssociatedTokenAddress(
      tokenMint,
      walletXPublicKey,
    );

    // Check if Wallet X ATA exists, if not create it
    // Track ATA creation cost since it's paid from this wallet's SOL balance
    let ataCreationCost = 0;
    try {
      await getAccount(connection, destinationAta);
    } catch {
      // This wallet will pay ATA rent when creating Wallet X's ATA
      ataCreationCost = obfuscationService.constants.ATA_RENT_LAMPORTS;
      transaction.add(
        createAssociatedTokenAccountInstruction(
          intermediatePublicKey,
          destinationAta,
          walletXPublicKey,
          tokenMint,
        ),
      );
    }

    // Transfer SPL tokens
    transaction.add(
      createTransferInstruction(
        sourceAta,
        destinationAta,
        intermediatePublicKey,
        BigInt(amount.toString()),
      ),
    );

    // SPL route: Reserve cleanup tx fee + rent-exempt minimum
    // The account must stay rent-exempt between aggregation and cleanup.
    // Cleanup will then drain it to exactly 0 (garbage collected).
    const reserveForCleanup = actualTxFee + RENT_EXEMPT_MINIMUM_LAMPORTS;
    solTransferAmount = Math.max(
      0,
      solBalance - reserveForCleanup - ataCreationCost,
    );
    log.info(
      `SPL route - ataCreationCost=${ataCreationCost}, reserveForCleanup=${reserveForCleanup}, solTransferAmount=${solTransferAmount}, expectedRemaining=${solBalance - (BASE_TX_FEE_LAMPORTS + priorityFeeLamports) - ataCreationCost - solTransferAmount}`,
    );
  } else {
    // SOL route: Reserve cleanup tx fee + rent-exempt minimum
    // The account must stay rent-exempt between aggregation and cleanup.
    // Cleanup will then drain it to exactly 0 (garbage collected).
    const reserveForCleanup = actualTxFee + RENT_EXEMPT_MINIMUM_LAMPORTS;
    solTransferAmount = Math.max(0, solBalance - reserveForCleanup);
  }

  // Transfer SOL to Wallet X
  if (solTransferAmount > 0) {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: intermediatePublicKey,
        toPubkey: walletXPublicKey,
        lamports: solTransferAmount,
      }),
    );
  }

  // Set blockhash and fee payer
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("finalized");
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = intermediatePublicKey;

  return { transaction, signer };
}

/**
 * Build a cleanup transaction for an intermediate wallet:
 * - Close ATA (returns rent to source)
 * - Transfer any remaining SOL dust to source
 */
async function buildCleanupTransaction(
  intermediateWalletId: number,
  sessionId: number,
  sourceWallet: PublicKey,
): Promise<{ transaction: Transaction; signer: Keypair } | null> {
  const session = await obfuscationService.getSession(sessionId);
  if (!session) return null;

  const signer =
    await intermediateWalletService.getKeypairForWallet(intermediateWalletId);
  if (!signer) return null;

  const connection = getConnection();

  // Use shared cleanup logic
  const transaction = await buildCleanupTxCore(
    connection,
    signer.publicKey,
    sourceWallet,
    session.tokenMint,
  );

  // buildCleanupTxCore returns null if insufficient balance
  if (!transaction) {
    return null;
  }

  // Only proceed if there are instructions (priority fees don't count)
  if (transaction.instructions.length <= 2) {
    return null;
  }

  // Set blockhash and fee payer
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("finalized");
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = signer.publicKey;

  return { transaction, signer };
}

/**
 * Build a cleanup transaction for Wallet X
 * - Close ATA (to recover rent if SPL route)
 * - Drain all SOL to user (account will be garbage collected)
 */
async function buildWalletXCleanupTransaction(
  sessionId: number,
  sourceWallet: PublicKey,
): Promise<{ transaction: Transaction; signer: Keypair } | null> {
  const session = await obfuscationService.getSession(sessionId);
  if (!session) return null;

  const signer = await walletXService.getKeypair(sessionId);
  if (!signer) return null;

  const connection = getConnection();

  // Use shared cleanup logic
  const transaction = await buildCleanupTxCore(
    connection,
    signer.publicKey,
    sourceWallet,
    session.tokenMint,
  );

  // buildCleanupTxCore returns null if insufficient balance
  if (!transaction) {
    return null;
  }

  // Only proceed if there are instructions (priority fees don't count)
  if (transaction.instructions.length <= 2) {
    return null;
  }

  // Set blockhash and fee payer
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("finalized");
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = signer.publicKey;

  return { transaction, signer };
}

/**
 * Execute a signed transaction
 */
async function executeTransaction(
  transaction: Transaction,
  signer: Keypair,
): Promise<string> {
  const connection = getConnection();

  // Sign the transaction
  transaction.sign(signer);

  // Send and confirm
  const signature = await connection.sendRawTransaction(
    transaction.serialize(),
    {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    },
  );

  // Wait for confirmation with blockhash-based expiry.
  // This automatically times out when the blockhash expires (~60-90 blocks),
  // preventing the scheduler from hanging indefinitely on a stuck RPC.
  await connection.confirmTransaction(
    {
      signature,
      blockhash: transaction.recentBlockhash!,
      lastValidBlockHeight: transaction.lastValidBlockHeight!,
    },
    "confirmed",
  );

  return signature;
}

const obfuscationTxBuilder = {
  // Funding (user signs)
  buildFundingTransaction,
  buildAllFundingTransactions,

  // Aggregation (server signs)
  buildAggregationTransaction,

  // Cleanup (server signs)
  buildCleanupTransaction,
  buildWalletXCleanupTransaction,

  // Execution
  executeTransaction,
};

export { obfuscationTxBuilder };
