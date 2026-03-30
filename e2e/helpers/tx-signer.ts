/**
 * Transaction signing helper for E2E tests.
 * The API returns base64-encoded unsigned transactions.
 * This helper deserializes, signs with test keypairs, and sends them.
 *
 * Uses sendRawTransaction + manual confirmation polling to handle
 * slow containerized validators in CI (avoids sendAndConfirmTransaction
 * which relies on WebSocket subscriptions that may not be available).
 */

import { Transaction, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { connection } from "../setup/test-context";

const CONFIRM_TIMEOUT_MS = 60_000;
const CONFIRM_POLL_MS = 1_000;

/**
 * Send a signed transaction and poll for confirmation.
 * More tolerant of slow validators than sendAndConfirmTransaction.
 */
async function sendAndConfirm(tx: Transaction, signers: Keypair[]): Promise<string> {
  tx.sign(...signers);
  const raw = tx.serialize();

  const signature = await connection.sendRawTransaction(raw, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  // Poll getSignatureStatuses until confirmed or timeout
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, CONFIRM_POLL_MS));
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value?.[0];
    if (status) {
      if (status.err) {
        throw new Error(
          `Transaction ${signature} failed: ${JSON.stringify(status.err)}`
        );
      }
      if (
        status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized"
      ) {
        return signature;
      }
    }
  }
  throw new Error(
    `Transaction ${signature} not confirmed within ${CONFIRM_TIMEOUT_MS}ms`
  );
}

/**
 * Deserialize a base64 transaction from the API, sign it, and send it.
 * Rebuilds the transaction with a fresh blockhash on each attempt.
 * Retries up to 3 times on transient errors.
 */
export async function signAndSendTransaction(
  txBase64: string,
  payer: Keypair,
  additionalSignerSecret?: string
): Promise<string> {
  const signers: Keypair[] = [payer];
  if (additionalSignerSecret) {
    const secretKey = bs58.decode(additionalSignerSecret);
    signers.push(Keypair.fromSecretKey(secretKey));
  }

  // Extract instructions and fee payer from the API transaction
  const original = Transaction.from(Buffer.from(txBase64, "base64"));
  const { instructions, feePayer } = original;

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const tx = new Transaction();
      tx.feePayer = feePayer;
      tx.add(...instructions);
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;

      return await sendAndConfirm(tx, signers);
    } catch (err: any) {
      const isRetryable =
        err?.message?.includes("block height exceeded") ||
        err?.message?.includes("Blockhash not found") ||
        err?.message?.includes("not confirmed within");

      if (isRetryable && attempt < maxRetries) {
        console.log(
          `Transaction failed (attempt ${attempt}/${maxRetries}), retrying with fresh blockhash...`
        );
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

/**
 * Sign and send multiple transactions sequentially.
 */
export async function signAndSendTransactions(
  txsBase64: string[],
  payer: Keypair
): Promise<string[]> {
  const signatures: string[] = [];
  for (const txBase64 of txsBase64) {
    const sig = await signAndSendTransaction(txBase64, payer);
    signatures.push(sig);
  }
  return signatures;
}
