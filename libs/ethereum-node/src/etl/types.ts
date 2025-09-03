// Types for Ethereum contract event ETL

export interface ContractEventConfig {
  contractAddress: string;
  contractAbi: any[];
  eventName: string;
  fromBlock: number;
  toBlock?: number; // If not provided, will sync to latest block
  maxBlockRange?: number; // Maximum blocks to process in one batch (default: 10000)
  confirmations?: number; // Number of confirmations required (default: 12)
  rpcUrl: string;
}

export interface EventLogData {
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  address: string;
  eventName: string;
  args: Record<string, any>;
  timestamp?: number;
}

export interface ProcessedEventLog extends EventLogData {
  id?: number;
  processedAt: Date;
  metadata?: Record<string, any>;
}

// Generic interface for database schema mapping
export interface EventSchemaMapper<T = any> {
  mapEventToSchema(eventLog: EventLogData): T;
  validateMappedData(data: T): boolean;
}

// Block cursor for tracking progress
export interface BlockCursor {
  lastProcessedBlock: number;
  metadata?: {
    totalEvents?: number;
    lastBlockTimestamp?: number;
    contractAddress?: string;
    eventName?: string;
  };
}