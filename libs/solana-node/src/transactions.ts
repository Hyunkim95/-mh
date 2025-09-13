import { 
  Connection, 
  Transaction, 
  Keypair, 
  sendAndConfirmTransaction,
  TransactionSignature 
} from '@solana/web3.js';

/**
 * Send and confirm a transaction
 */
export async function sendTransaction(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[]
): Promise<TransactionSignature> {
  return await sendAndConfirmTransaction(connection, transaction, signers);
}

/**
 * Get transaction status
 */
export async function getTransactionStatus(
  connection: Connection,
  signature: TransactionSignature
) {
  return await connection.getSignatureStatus(signature);
}
