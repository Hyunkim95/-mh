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
} from "../../solana/services/contract.service";

// Get connection from obfuscation service
const getConnection = () => obfuscationService.getConnection();

/**
 * Build common cleanup transaction logic
 * Used by both intermediate wallet and Wallet X cleanup
 */
async function buildCleanupTxCore(
  connection: Connection,
  ownerPublicKey: PublicKey,
  destinationWallet: PublicKey,
  tokenMint: string | null,
): Promise<Transaction> {
  const transaction = new Transaction();

  // Add priority fee instructions for faster confirmation
  const priorityInstructions = await createDynamicPriorityInstructions(
    connection,
    100_000,
  );
  priorityInstructions.forEach((ix) => transaction.add(ix));

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

  // Transfer remaining SOL dust (keeping rent-exempt minimum to avoid rent error)
  const { BASE_TX_FEE_LAMPORTS, ESTIMATED_PRIORITY_FEE_LAMPORTS, RENT_EXEMPT_MINIMUM_LAMPORTS } =
    obfuscationService.constants;
  const balance = await connection.getBalance(ownerPublicKey);
  const txFee = BASE_TX_FEE_LAMPORTS + ESTIMATED_PRIORITY_FEE_LAMPORTS;

  // Must keep rent-exempt minimum + tx fee in the account
  // Otherwise we get "insufficient funds for rent" error
  const reserveAmount = RENT_EXEMPT_MINIMUM_LAMPORTS + txFee;
  const dustAmount = Math.max(0, balance - reserveAmount);

  if (dustAmount > 0) {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: ownerPublicKey,
        toPubkey: destinationWallet,
        lamports: dustAmount,
      }),
    );
  }

  return transaction;
}

/**
 * Build a funding transaction: Source -> Intermediate wallet
 * Includes ATA creation if needed for SPL tokens
 * Returns transaction to be signed by the source wallet (user)
 *
 * @param totalWalletCount - Total number of intermediate wallets in the session
 *   Used to calculate per-wallet share of deployment costs
 */
async function buildFundingTransaction(
  sourceWallet: PublicKey,
  intermediateWalletAddress: PublicKey,
  amount: BN,
  tokenMint?: PublicKey, // null for SOL
  totalWalletCount: number = 2, // Default to 2 for backwards compatibility
): Promise<{ transaction: Transaction; serialized: string }> {
  const transaction = new Transaction();
  const connection = getConnection();

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
    // The deployment cost is FIXED (~80M total), so we divide by wallet count
    const { TOTAL_DEPLOYMENT_COST_LAMPORTS, AGGREGATION_FEE_PER_WALLET } =
      obfuscationService.constants;
    const deploymentSharePerWallet = Math.ceil(TOTAL_DEPLOYMENT_COST_LAMPORTS / totalWalletCount);
    const totalSolFunding = deploymentSharePerWallet + AGGREGATION_FEE_PER_WALLET;

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: sourceWallet,
        toPubkey: intermediateWalletAddress,
        lamports: totalSolFunding,
      }),
    );
  } else {
    // SOL transfer: allocated amount + extra SOL for Wallet X deployment costs
    // The deployment cost is FIXED (~80M total), so we divide by wallet count
    // Plus per-wallet aggregation fees
    const { TOTAL_DEPLOYMENT_COST_LAMPORTS, AGGREGATION_FEE_PER_WALLET } =
      obfuscationService.constants;
    const deploymentSharePerWallet = Math.ceil(TOTAL_DEPLOYMENT_COST_LAMPORTS / totalWalletCount);
    const extraSolForDeployment = deploymentSharePerWallet + AGGREGATION_FEE_PER_WALLET;
    const totalFunding = amount.toNumber() + extraSolForDeployment;

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
      totalWalletCount, // Pass wallet count for deployment cost calculation
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
  const actualTxFee = BASE_TX_FEE_LAMPORTS + priorityFeeLamports + 5000; // +5000 buffer

  const solBalance = await connection.getBalance(intermediatePublicKey);

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

    // SPL route: Keep rent-exempt + cleanup tx fee in intermediate wallet
    // Also subtract ATA creation cost since it's deducted before SOL transfer executes
    const reserveForCleanup = RENT_EXEMPT_MINIMUM_LAMPORTS + actualTxFee;
    solTransferAmount = Math.max(0, solBalance - reserveForCleanup - ataCreationCost);
  } else {
    // SOL route: Keep rent-exempt + cleanup tx fee in intermediate wallet
    // The cleanup phase will return this dust to the user
    const reserveForCleanup = RENT_EXEMPT_MINIMUM_LAMPORTS + actualTxFee;
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
 * - Return SOL dust to user
 * - Do NOT fully close the account (just empty it)
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

  // Wait for confirmation
  await connection.confirmTransaction(signature, "confirmed");

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
