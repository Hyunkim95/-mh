import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseCursorManager } from '../cursors/database-cursor-manager';
import {
  EtlJobConfig,
  ExtractResult,
  TransformResult,
  LoadResult,
  EtlJobResult,
  EtlJobState,
  CursorManager,
  CursorData,
} from '../types';

export abstract class BaseEtlJob<TExtracted = any, TTransformed = any> {
  protected config: Required<EtlJobConfig>;
  protected cursorManager: CursorManager;
  protected state: EtlJobState;
  protected db: NodePgDatabase<any>;

  constructor(
    config: EtlJobConfig,
    db: NodePgDatabase<any>,
    cursorManager?: CursorManager
  ) {
    this.config = {
      batchSize: 1000,
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 300000, // 5 minutes
      concurrency: 1,
      metadata: {},
      ...config,
    };

    this.db = db;
    this.cursorManager = cursorManager || new DatabaseCursorManager(db);
    this.state = {
      status: 'idle',
    };
  }

  // Abstract methods to be implemented by subclasses
  protected abstract extract(cursor?: string, batchSize?: number): Promise<ExtractResult<TExtracted>>;
  protected abstract transform(data: TExtracted[]): Promise<TransformResult<TTransformed>>;
  protected abstract load(data: TTransformed[]): Promise<LoadResult>;

  // Optional lifecycle hooks
  protected async beforeJob(): Promise<void> {
    // Override in subclass if needed
  }

  protected async afterJob(_result: EtlJobResult): Promise<void> {
    // Override in subclass if needed
  }

  protected async onError(error: Error, stage: 'extract' | 'transform' | 'load', _data?: any): Promise<void> {
    // Override in subclass if needed
    console.error(`ETL Job ${this.config.jobName} error in ${stage}:`, error);
  }

  // Main execution method
  async run(): Promise<EtlJobResult> {
    const startTime = new Date();
    const result: EtlJobResult = {
      jobName: this.config.jobName,
      success: false,
      startTime,
      endTime: startTime,
      duration: 0,
      totalExtracted: 0,
      totalTransformed: 0,
      totalLoaded: 0,
      errors: [],
      metadata: { ...this.config.metadata },
    };

    try {
      this.state.status = 'running';
      this.state.lastRunTime = startTime;

      await this.beforeJob();

      // Get initial cursor
      const cursorData = await this.cursorManager.getCursor(this.config.jobName);
      let currentCursor = cursorData?.value;

      let batchNumber = 0;
      let hasMore = true;

      while (hasMore) {
        batchNumber++;
        this.state.currentBatch = batchNumber;

        try {
          // Extract
          const extractResult = await this.executeWithRetry(
            () => this.extract(currentCursor, this.config.batchSize),
            'extract'
          );

          if (extractResult.data.length === 0) {
            hasMore = false;
            break;
          }

          result.totalExtracted += extractResult.data.length;

          // Transform
          const transformResult = await this.executeWithRetry(
            () => this.transform(extractResult.data),
            'transform',
            extractResult.data
          );

          result.totalTransformed += transformResult.data.length;

          // Collect transform errors
          if (transformResult.errors) {
            result.errors.push(...transformResult.errors.map(err => ({
              stage: 'transform' as const,
              error: err.error,
              data: err.originalData,
            })));
          }

          // Load
          if (transformResult.data.length > 0) {
            const loadResult = await this.executeWithRetry(
              () => this.load(transformResult.data),
              'load',
              transformResult.data
            );

            result.totalLoaded += loadResult.processedCount;

            // Collect load errors
            if (loadResult.errors) {
              result.errors.push(...loadResult.errors.map(err => ({
                stage: 'load' as const,
                error: err.error,
                data: err.data,
              })));
            }
          }

          // Update cursor if we have a next cursor or if this was successful
          if (extractResult.nextCursor) {
            await this.cursorManager.updateCursor(
              this.config.jobName,
              extractResult.nextCursor,
              {
                ...this.config.metadata,
                batchNumber,
                lastBatchSize: extractResult.data.length,
              }
            );
            currentCursor = extractResult.nextCursor;
          }

          hasMore = extractResult.hasMore;

        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          result.errors.push({
            stage: 'extract',
            error: err,
          });

          await this.onError(err, 'extract');
          hasMore = false; // Stop processing on batch error
        }
      }

      result.success = result.errors.length === 0;
      this.state.status = result.success ? 'success' : 'error';

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      result.errors.push({
        stage: 'extract',
        error: err,
      });
      this.state.status = 'error';
      this.state.lastError = err;
    }

    const endTime = new Date();
    result.endTime = endTime;
    result.duration = endTime.getTime() - startTime.getTime();

    await this.afterJob(result);

    return result;
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    stage: 'extract' | 'transform' | 'load',
    data?: any
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this.config.maxRetries) {
          await this.onError(lastError, stage, data);
          throw lastError;
        }

        // Wait before retry
        await this.sleep(this.config.retryDelay * attempt);
      }
    }

    throw lastError!;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility methods
  async reset(): Promise<void> {
    await this.cursorManager.deleteCursor(this.config.jobName);
    this.state = {
      status: 'idle',
    };
  }

  async getCursor(): Promise<CursorData | null> {
    return this.cursorManager.getCursor(this.config.jobName);
  }

  getState(): EtlJobState {
    return { ...this.state };
  }

  getConfig(): Required<EtlJobConfig> {
    return { ...this.config };
  }
}