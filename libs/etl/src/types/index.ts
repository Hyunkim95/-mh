// ETL Job Configuration
export interface EtlJobConfig {
  jobName: string;
  batchSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  concurrency?: number;
  metadata?: Record<string, any>;
}

// ETL Cursor Management
export interface CursorData {
  value: string;
  metadata?: Record<string, any>;
  lastProcessedAt: Date;
}

export interface CursorManager {
  getCursor(jobName: string): Promise<CursorData | null>;
  updateCursor(jobName: string, cursorValue: string, metadata?: Record<string, any>): Promise<void>;
  deleteCursor(jobName: string): Promise<void>;
}

// ETL Processing Results
export interface ExtractResult<T = any> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
  metadata?: Record<string, any>;
}

export interface TransformResult<T = any> {
  data: T[];
  errors?: Array<{
    originalData: any;
    error: Error;
    index: number;
  }>;
  metadata?: Record<string, any>;
}

export interface LoadResult {
  success: boolean;
  processedCount: number;
  errors?: Array<{
    data: any;
    error: Error;
    index: number;
  }>;
  metadata?: Record<string, any>;
}

// ETL Job Execution Results
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

// ETL Job Status
export type EtlJobStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled';

export interface EtlJobState {
  status: EtlJobStatus;
  currentBatch?: number;
  totalBatches?: number;
  progress?: number;
  lastError?: Error;
  lastRunTime?: Date;
  nextRunTime?: Date;
}