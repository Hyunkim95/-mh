import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import crypto from "crypto";
import { createLogger } from "../utils/logger";

const log = createLogger("ExecutorService");

// Connection for Solana operations
const connection = new Connection(
  process.env.SOLANA_RPC_URL ||
    "https://mainnet.helius-rpc.com/?api-key=f6d0c03a-562f-4784-8b78-ebb084b72514",
  { commitment: "confirmed" }
);

/**
 * Generates a deterministic keypair from routeId and environment seed
 * @param routeId - The route ID to generate keypair for
 * @returns Solana Keypair
 */
const getWalletByRouteId = (routeId: number): Keypair => {
  const executorSeed = process.env.EXECUTOR_SEED || "executor_seed";
  if (!executorSeed) {
    throw new Error("EXECUTOR_SEED environment variable is required");
  }

  // Create deterministic seed from routeId and env seed
  const seedString = `${executorSeed}_route_${routeId}`;
  const hash = crypto.createHash("sha256").update(seedString).digest();

  // Create keypair from the first 32 bytes of the hash
  const seed = hash.slice(0, 32);
  return Keypair.fromSeed(seed);
};

const getSigner = (): Keypair => {
  const executorSeed = process.env.EXECUTOR_SEED || "executor_seed";
  if (!executorSeed) {
    throw new Error("EXECUTOR_SEED environment variable is required");
  }

  // Create deterministic seed from routeId and env seed
  const seedString = `${executorSeed}_signer`;
  const hash = crypto.createHash("sha256").update(seedString).digest();

  // Create keypair from the first 32 bytes of the hash
  const seed = hash.slice(0, 32);
  return Keypair.fromSeed(seed);
}

/**
 * Gets the balance of an executor wallet for a given routeId
 * @param routeId - The route ID to get balance for
 * @returns Balance in lamports as BN
 */
const balance = async (routeId: number): Promise<BN> => {
  try {
    const wallet = getWalletByRouteId(routeId);
    const balanceInLamports = await connection.getBalance(wallet.publicKey);
    return new BN(balanceInLamports);
  } catch (error) {
    log.error(
      "Error getting balance for route ID",
      routeId,
      "error",
      error
    );
    throw error;
  }
};

/**
 * Withdraws funds from executor wallet to a destination address
 * @param routeId - The route ID to withdraw from
 * @param to - Destination public key string
 * @param amount - Amount to withdraw in lamports as BN
 * @returns Transaction signature
 */
const withdrawOnBehalf = async (
  routeId: number,
  to: string,
  amount: BN
): Promise<string> => {
  try {
    const executorWallet = getWalletByRouteId(routeId);
    const destinationPubkey = new PublicKey(to);

    // Check if executor has enough balance
    const currentBalance = await balance(routeId);
    if (currentBalance.lt(amount)) {
      throw new Error(
        `Insufficient balance. Current: ${currentBalance.toString()}, Required: ${amount.toString()}`
      );
    }

    // Create transfer instruction
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: executorWallet.publicKey,
      toPubkey: destinationPubkey,
      lamports: amount.toNumber(),
    });

    // Create and send transaction
    const transaction = new Transaction().add(transferInstruction);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [executorWallet],
      { commitment: "confirmed" }
    );

    log.info("Withdrawal successful:", {
      routeId,
      from: executorWallet.publicKey.toBase58(),
      to,
      amount: amount.toString(),
      signature,
    });

    return signature;
  } catch (error) {
    log.error(
      "Error withdrawing on behalf for route ID",
      routeId,
      "error",
      error
    );
    throw error;
  }
};

/**
 * Gets the public key of an executor wallet for a given routeId
 * @param routeId - The route ID to get public key for
 * @returns Public key as string
 */
const getExecutorPublicKey = (routeId: number): string => {
  const wallet = getWalletByRouteId(routeId);
  return wallet.publicKey.toBase58();
};

/**
 * Gets the keypair for backward compatibility with existing code
 * @deprecated Use getWalletByRouteId instead
 */
const getKeypair = async (routeId: number): Promise<Keypair> => {
  log.warn("getKeypair is deprecated, use getWalletByRouteId instead");
  return getWalletByRouteId(routeId);
};

const executorService = {
  getWalletByRouteId,
  withdrawOnBehalf,
  balance,
  getExecutorPublicKey,
  // Backward compatibility
  getKeypair,
  getSigner
};

export default executorService;
