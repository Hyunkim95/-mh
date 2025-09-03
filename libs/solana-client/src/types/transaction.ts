import { TransactionSignature, PublicKey } from '@solana/web3.js';

export interface TransactionResult {
  signature: TransactionSignature;
  success: boolean;
  error?: string;
}

export interface TokenTransfer {
  from: PublicKey;
  to: PublicKey;
  amount: bigint;
  mint: PublicKey;
}

export interface SolTransfer {
  from: PublicKey;
  to: PublicKey;
  amount: number; // in SOL
}
