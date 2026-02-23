import {
  Transaction,
  PublicKey,
  SystemProgram,
  Keypair,
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
} from "../../solana/services/contract.service";

// Get connection from obfuscation service
const getConnection = () => obfuscationService.getConnection();

/**
 * Build a funding transaction: Source -> Intermediate wallet
 * Includes ATA creation if needed for SPL tokens
 * Returns transaction to be signed by the source wallet (user)
 */
async function buildFundingTransaction(
  sourceWallet: PublicKey,
  intermediateWalletAddress: PublicKey,
  amount: BN,
  tokenMint?: PublicKey, // null for SOL
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

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        sourceAta, // from
        destinationAta, // to
        sourceWallet, // owner
        BigInt(amount.toString()), // amount
      ),
    );
  } else {
    // SOL transfer
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: sourceWallet,
        toPubkey: intermediateWalletAddress,
        lamports: amount.toNumber(),
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
    try {
      await getAccount(connection, destinationAta);
    } catch {
      // ATA doesn't exist, add creation instruction (intermediate pays)
      transaction.add(
        createAssociatedTokenAccountInstruction(
          intermediatePublicKey, // payer
          destinationAta, // ata
          walletXPublicKey, // owner
          tokenMint, // mint
        ),
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        sourceAta, // from
        destinationAta, // to
        intermediatePublicKey, // owner
        BigInt(amount.toString()), // amount
      ),
    );
  } else {
    // SOL transfer - leave enough for fees
    const balance = await connection.getBalance(intermediatePublicKey);
    const transferAmount = Math.max(0, balance - 5000); // Keep 5000 lamports for fees

    if (transferAmount > 0) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: intermediatePublicKey,
          toPubkey: walletXPublicKey,
          lamports: transferAmount,
        }),
      );
    }
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

  const intermediatePublicKey = signer.publicKey;

  // Close ATA if it's an SPL token
  if (session.tokenMint) {
    const tokenMint = new PublicKey(session.tokenMint);
    const ata = await getAssociatedTokenAddress(
      tokenMint,
      intermediatePublicKey,
    );

    try {
      const account = await getAccount(connection, ata);
      // Only close if account exists and has zero balance
      if (account.amount === BigInt(0)) {
        transaction.add(
          createCloseAccountInstruction(
            ata, // account to close
            sourceWallet, // destination for rent
            intermediatePublicKey, // owner
          ),
        );
      }
    } catch {
      // ATA doesn't exist, nothing to close
    }
  }

  // Transfer remaining SOL dust to source
  const balance = await connection.getBalance(intermediatePublicKey);
  const rentExempt = 5000; // Minimum for transaction fee
  const dustAmount = balance - rentExempt;

  if (dustAmount > 0) {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: intermediatePublicKey,
        toPubkey: sourceWallet,
        lamports: dustAmount,
      }),
    );
  }

  // Only proceed if there are instructions
  if (transaction.instructions.length === 0) {
    return null;
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
 * Build a cleanup transaction for Wallet X
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
  const transaction = new Transaction();

  const walletXPublicKey = signer.publicKey;

  // Close ATA if it's an SPL token
  if (session.tokenMint) {
    const tokenMint = new PublicKey(session.tokenMint);
    const ata = await getAssociatedTokenAddress(tokenMint, walletXPublicKey);

    try {
      const account = await getAccount(connection, ata);
      // Only close if account exists and has zero balance
      if (account.amount === BigInt(0)) {
        transaction.add(
          createCloseAccountInstruction(
            ata, // account to close
            sourceWallet, // destination for rent
            walletXPublicKey, // owner
          ),
        );
      }
    } catch {
      // ATA doesn't exist, nothing to close
    }
  }

  // Transfer remaining SOL dust to source
  const balance = await connection.getBalance(walletXPublicKey);
  const rentExempt = 5000;
  const dustAmount = balance - rentExempt;

  if (dustAmount > 0) {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: walletXPublicKey,
        toPubkey: sourceWallet,
        lamports: dustAmount,
      }),
    );
  }

  // Only proceed if there are instructions
  if (transaction.instructions.length === 0) {
    return null;
  }

  // Set blockhash and fee payer
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("finalized");
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = walletXPublicKey;

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
