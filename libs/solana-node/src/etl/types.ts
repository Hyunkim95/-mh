import {
  ParsedTransactionWithMeta,
  ParsedAccountData
} from '@solana/web3.js';

export interface SolanaETLConfig {
  rpcUrl: string;
  programId?: string;
  accountAddress?: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
  maxSignatures?: number; // Maximum signatures to fetch per batch (default: 1000)
  delayMs?: number; // Delay between RPC calls to avoid rate limiting (default: 100ms)
}

// Direction for indexing
export type IndexingDirection = 'forward' | 'backward';

// Signature-based cursor for transactions
export interface SignatureCursor {
  signature: string;
  blockTime?: number;
  slot?: number;
  direction: IndexingDirection;
  metadata?: {
    programId?: string;
    accountAddress?: string;
    totalSignatures?: number;
    lastIndexedSlot?: number;
  };
}

// Raw transaction data
export interface SolanaTransactionData {
  signature: string;
  blockTime?: number | null;
  slot: number;
  err?: any;
  memo?: string | null;
  fee: number;
  
  // Parsed transaction details
  transaction: ParsedTransactionWithMeta | null;
  
  // Additional metadata
  confirmationStatus?: 'processed' | 'confirmed' | 'finalized';
  programIds?: string[];
  accountKeys?: string[];
}

// Raw account data
export interface SolanaAccountData {
  address: string;
  lamports: number;
  owner: string;
  executable: boolean;
  rentEpoch?: number;
  space?: number;
  
  // Parsed account data (if available)
  parsedData?: ParsedAccountData;
  
  // Raw data
  data?: Buffer | string;
  
  // Metadata
  slot?: number;
  lastUpdated: Date;
}

// Processed transaction for database storage
export interface ProcessedTransaction {
  signature: string;
  blockTime?: Date;
  slot: number;
  fee: number;
  success: boolean;
  programIds: string[];
  accountKeys: string[];
  logMessages?: string[];
  
  // Instruction details
  instructions: Array<{
    programId: string;
    accounts: string[];
    data?: string;
    innerInstructions?: any[];
  }>;
  
  // Token transfers (if any)
  tokenTransfers?: Array<{
    fromTokenAccount?: string;
    toTokenAccount?: string;
    fromOwner?: string;
    toOwner?: string;
    mint: string;
    amount: string;
    decimals?: number;
  }>;
  
  // Balance changes
  preBalances: number[];
  postBalances: number[];
  
  processedAt: Date;
  metadata?: Record<string, any>;
}

// Processed account for database storage
export interface ProcessedAccount {
  address: string;
  lamports: number;
  owner: string;
  executable: boolean;
  rentEpoch: number;
  space: number;
  
  // Token account specific data
  isTokenAccount?: boolean;
  mint?: string;
  tokenAmount?: string;
  tokenDecimals?: number;
  tokenOwner?: string;
  
  // Program account specific data
  programData?: Record<string, any>;
  
  slot?: number;
  lastUpdated: Date;
  processedAt: Date;
  metadata?: Record<string, any>;
}

// Schema mapper interface
export interface SolanaSchemaMapper<T = any> {
  mapTransactionToSchema?(transactionData: SolanaTransactionData): T;
  mapAccountToSchema?(accountData: SolanaAccountData): T;
  validateMappedData(data: T): boolean;
}

// ETL job configuration for different types
export interface SolanaTransactionETLConfig extends SolanaETLConfig {
  type: 'transactions';
  direction: IndexingDirection;
  beforeSignature?: string; // For backward indexing
  untilSignature?: string; // For forward indexing
}

export interface SolanaAccountETLConfig extends SolanaETLConfig {
  type: 'accounts';
  // For accounts, we typically just fetch current state
  trackHistory?: boolean; // Whether to track account changes over time
}