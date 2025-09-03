// Temporary minimal ETL base types until dependencies are resolved
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface ExtractResult<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
  metadata?: Record<string, any>;
}

export interface TransformResult<T> {
  data: T[];
  errors?: Array<{ originalData: any; error: Error; index: number }>;
  metadata?: Record<string, any>;
}

export interface LoadResult {
  success: boolean;
  processedCount: number;
  errors?: Array<{ data: any; error: Error; index: number }>;
  metadata?: Record<string, any>;
}

export interface EtlJobConfig {
  jobName: string;
  batchSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  concurrency?: number;
  metadata?: Record<string, any>;
}

export interface EtlJobResult {
  jobName: string;
  success: boolean;
  startTime: Date;
  endTime: Date;
  duration: number;
  totalExtracted: number;
  totalTransformed: number;
  totalLoaded: number;
  errors: Array<{
    stage: 'extract' | 'transform' | 'load';
    error: Error;
    data?: any;
  }>;
  metadata?: Record<string, any>;
}

// Simplified base class for TypeScript checking
export abstract class BaseEtlJob<TExtracted = any, TTransformed = any> {
  protected db: NodePgDatabase<any>;
  protected config: Required<EtlJobConfig>;

  constructor(config: EtlJobConfig, db: NodePgDatabase<any>) {
    this.config = {
      batchSize: 1000,
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 300000,
      concurrency: 1,
      metadata: {},
      ...config,
    };
    this.db = db;
  }

  protected abstract extract(cursor?: string, batchSize?: number): Promise<ExtractResult<TExtracted>>;
  protected abstract transform(data: TExtracted[]): Promise<TransformResult<TTransformed>>;
  protected abstract load(data: TTransformed[]): Promise<LoadResult>;

  async run(): Promise<EtlJobResult> {
    // Minimal implementation for type checking
    throw new Error('Not implemented - use actual @libs/etl implementation');
  }

  getConfig(): Required<EtlJobConfig> {
    return { ...this.config };
  }

  async getCursor(): Promise<{ value: string } | null> {
    // Minimal implementation for type checking
    return null;
  }

  async reset(): Promise<void> {
    // Minimal implementation for type checking
  }
}