import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ContractEventsEtlJob } from './contract-events-etl';
import { ContractEventProcessor } from './contract-event-processor';
import { createLogger } from '../../utils/logger';

const log = createLogger('ETLScheduler');

export interface ContractEventsSchedulerConfig {
  rpcUrl: string;
  programId: string;
  etlIntervalMs: number; // How often to run ETL (e.g., 30000 for 30 seconds)
  processingIntervalMs: number; // How often to process events (e.g., 10000 for 10 seconds)
  direction: 'forward' | 'backward';
  enabled: boolean;
}

export class ContractEventsScheduler {
  private eventProcessor: ContractEventProcessor;
  private etlInterval?: NodeJS.Timeout;
  private processingInterval?: NodeJS.Timeout;
  private isRunning = false;
  private isEtlJobRunning = false;
  private isProcessingRunning = false;
  private consecutiveEmptyRuns = 0; // Track consecutive runs with no data
  private maxEmptyRuns = 3; // Stop ETL after this many empty runs
  private cooldownPeriod = 5 * 60 * 1000; // 5 minutes cooldown after max empty runs
  private lastEmptyRunTime?: Date;

  constructor(
    private db: NodePgDatabase<any>,
    public config: ContractEventsSchedulerConfig
  ) {
    this.eventProcessor = new ContractEventProcessor(db);
  }

  /**
   * Start the contract events monitoring system
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.info('Contract events scheduler is already running');
      return;
    }

    if (!this.config.enabled) {
      log.info('Contract events scheduler is disabled');
      return;
    }

    log.info(`Starting: interval=${this.config.etlIntervalMs}ms, processing=${this.config.processingIntervalMs}ms, direction=${this.config.direction}`);

    this.isRunning = true;

    // Start the ETL job interval
    this.startEtlLoop();

    // Start the event processing loop
    this.startEventProcessing();

    log.info('Started successfully');
  }

  /**
   * Stop the contract events monitoring system
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.etlInterval) {
      clearInterval(this.etlInterval);
      this.etlInterval = undefined;
    }

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    log.info('Stopped');
  }

  /**
   * Start the ETL loop
   */
  private startEtlLoop(): void {
    this.etlInterval = setInterval(async () => {
      if (!this.isRunning) return;

      // Overlap guard: skip if previous ETL run is still in progress
      if (this.isEtlJobRunning) {
        log.debug(`ETL job still running (${this.config.direction}), skipping tick`);
        return;
      }

      // Apply cooldown for both forward and backward directions
      if (this.consecutiveEmptyRuns >= this.maxEmptyRuns && this.lastEmptyRunTime) {
        const cooldown = this.config.direction === 'backward'
          ? this.cooldownPeriod * 2
          : this.cooldownPeriod;
        const timeSinceLastEmpty = Date.now() - this.lastEmptyRunTime.getTime();
        if (timeSinceLastEmpty < cooldown) {
          return;
        } else {
          this.consecutiveEmptyRuns = 0;
          this.lastEmptyRunTime = undefined;
        }
      }

      this.isEtlJobRunning = true;
      try {
        const result = await this.runEtlJob();

        if (result && result.totalExtracted === 0) {
          this.consecutiveEmptyRuns++;
          this.lastEmptyRunTime = new Date();
        } else if (result && result.totalExtracted > 0) {
          this.consecutiveEmptyRuns = 0;
          this.lastEmptyRunTime = undefined;
          log.info(`ETL processed ${result.totalExtracted} transactions (${this.config.direction})`);
        }
      } catch (error) {
        log.error('ETL job failed:', error);
      } finally {
        this.isEtlJobRunning = false;
      }
    }, this.config.etlIntervalMs);

    // Run immediately on start
    this.runEtlJob().catch(error => {
      log.error('Initial ETL job failed:', error);
    });
  }

  /**
   * Start the event processing loop
   */
  private startEventProcessing(): void {
    this.processingInterval = setInterval(async () => {
      if (!this.isRunning) return;

      if (this.isProcessingRunning) return;

      this.isProcessingRunning = true;
      try {
        const result = await this.eventProcessor.processUnprocessedEvents();

        if (result.processed > 0) {
          log.info(`Event processing completed: ${result.processed} events processed`);

          if (result.errors.length > 0) {
            log.warn(`Event processing errors: ${result.errors.length} events failed`);
          }
        }
      } catch (error) {
        log.error('Event processing failed:', error);
      } finally {
        this.isProcessingRunning = false;
      }
    }, this.config.processingIntervalMs);
  }

  /**
   * Run ETL job once
   */
  private async runEtlJob(): Promise<any> {
    // Use different job names for forward and backward to maintain separate cursors
    const jobName = `contract-events-etl-${this.config.direction}`;
    
    const etlJob = new ContractEventsEtlJob(
      {
        jobName,
        batchSize: 50, // Reduced from 100 to be more conservative
        maxRetries: 3,
        retryDelay: 5000, // Increased from 2000ms to 5000ms for better backoff
        timeout: 300000, // 5 minutes
        metadata: {
          programId: this.config.programId,
          direction: this.config.direction,
        },
      },
      this.db,
      this.config.rpcUrl,
      this.config.programId,
      this.config.direction
    );

    // Run the ETL job
    const result = await etlJob.run();
    return result;
  }

  /**
   * Get current status and statistics
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    config: ContractEventsSchedulerConfig;
    eventStats: any;
    cooldownInfo: {
      consecutiveEmptyRuns: number;
      maxEmptyRuns: number;
      inCooldown: boolean;
      cooldownTimeRemaining?: number;
    };
  }> {
    const eventStats = await this.eventProcessor.getProcessingStats();
    
    let inCooldown = false;
    let cooldownTimeRemaining: number | undefined;
    
    if (this.consecutiveEmptyRuns >= this.maxEmptyRuns && this.lastEmptyRunTime) {
      const timeSinceLastEmpty = Date.now() - this.lastEmptyRunTime.getTime();
      if (timeSinceLastEmpty < this.cooldownPeriod) {
        inCooldown = true;
        cooldownTimeRemaining = Math.ceil((this.cooldownPeriod - timeSinceLastEmpty) / 1000);
      }
    }

    return {
      isRunning: this.isRunning,
      config: this.config,
      eventStats,
      cooldownInfo: {
        consecutiveEmptyRuns: this.consecutiveEmptyRuns,
        maxEmptyRuns: this.maxEmptyRuns,
        inCooldown,
        cooldownTimeRemaining,
      },
    };
  }

  /**
   * Force run ETL job immediately
   */
  async runEtlNow(): Promise<any> {
    log.info('Running ETL job manually...');
    const result = await this.runEtlJob();
    log.info('Manual ETL job completed');
    
    return result;
  }

  /**
   * Force process events immediately
   */
  async processEventsNow(): Promise<any> {
    log.info('Processing events manually...');
    const result = await this.eventProcessor.processUnprocessedEvents();
    log.info('Manual event processing completed');
    
    return result;
  }

  /**
   * Reprocess failed events
   */
  async reprocessFailedEvents(eventIds?: number[]): Promise<void> {
    log.info('Reprocessing failed events...');
    await this.eventProcessor.reprocessFailedEvents(eventIds);
    log.info('Failed events reprocessing completed');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ContractEventsSchedulerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    log.info('Configuration updated');
  }

  /**
   * Get the event processor instance for direct access
   */
  getEventProcessor(): ContractEventProcessor {
    return this.eventProcessor;
  }
} 