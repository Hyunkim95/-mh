import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ContractEventsEtlJob } from './contract-events-etl';
import { ContractEventProcessor } from './contract-event-processor';

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
      console.log('Contract events scheduler is already running');
      return;
    }

    if (!this.config.enabled) {
      console.log('Contract events scheduler is disabled');
      return;
    }

    console.log('Starting contract events scheduler...');
    console.log(`ETL interval: ${this.config.etlIntervalMs}ms`);
    console.log(`Processing interval: ${this.config.processingIntervalMs}ms`);
    console.log(`Direction: ${this.config.direction}`);
    console.log(`Program ID: ${this.config.programId}`);

    this.isRunning = true;

    // Start the ETL job interval
    this.startEtlLoop();

    // Start the event processing loop
    this.startEventProcessing();

    console.log('Contract events scheduler started successfully');
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

    console.log('Contract events scheduler stopped');
  }

  /**
   * Start the ETL loop
   */
  private startEtlLoop(): void {
    this.etlInterval = setInterval(async () => {
      if (!this.isRunning) return;

      // For backward direction, we should be more aggressive and continue processing
      // until we truly reach the end of historical data. Only apply cooldown for forward direction.
      const shouldApplyCooldown = this.config.direction === 'forward';
      
      if (shouldApplyCooldown && this.consecutiveEmptyRuns >= this.maxEmptyRuns && this.lastEmptyRunTime) {
        const timeSinceLastEmpty = Date.now() - this.lastEmptyRunTime.getTime();
        if (timeSinceLastEmpty < this.cooldownPeriod) {
          console.log(`ETL in cooldown for ${Math.ceil((this.cooldownPeriod - timeSinceLastEmpty) / 1000)}s more (${this.consecutiveEmptyRuns} consecutive empty runs)`);
          return;
        } else {
          // Reset cooldown
          console.log(`Cooldown period ended, resuming ETL (${this.config.direction})`);
          this.consecutiveEmptyRuns = 0;
          this.lastEmptyRunTime = undefined;
        }
      }

      try {
        const result = await this.runEtlJob();
        
        // Check if this run processed any data
        if (result && result.totalExtracted === 0) {
          this.consecutiveEmptyRuns++;
          this.lastEmptyRunTime = new Date();
          
          if (this.config.direction === 'backward') {
            // For backward direction, log but don't apply aggressive cooldown
            console.log(`Backward ETL run ${this.consecutiveEmptyRuns} with no data - continuing to search historical data`);
            
            // Reset counter more frequently for backward to prevent getting stuck
            if (this.consecutiveEmptyRuns >= 10) { // Higher threshold for backward
              console.log(`Backward ETL: ${this.consecutiveEmptyRuns} consecutive empty runs, may have reached historical limit`);
              // Still don't cooldown, just log the situation
            }
          } else {
            console.log(`Forward ETL run ${this.consecutiveEmptyRuns}/${this.maxEmptyRuns} with no data`);
          }
        } else if (result && result.totalExtracted > 0) {
          // Reset counter if we found data
          this.consecutiveEmptyRuns = 0;
          this.lastEmptyRunTime = undefined;
          console.log(`ETL processed ${result.totalExtracted} transactions (${this.config.direction})`);
        }
      } catch (error) {
        console.error('ETL job failed:', error);
        // Don't increment empty run counter for errors
      }
    }, this.config.etlIntervalMs);

    // Run immediately on start
    this.runEtlJob().catch(error => {
      console.error('Initial ETL job failed:', error);
    });
  }

  /**
   * Start the event processing loop
   */
  private startEventProcessing(): void {
    this.processingInterval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const result = await this.eventProcessor.processUnprocessedEvents();
        
        if (result.processed > 0) {
          console.log(`Event processing completed: ${result.processed} events processed`);
          
          if (result.errors.length > 0) {
            console.warn(`Event processing errors: ${result.errors.length} events failed`);
            result.errors.forEach(error => {
              console.warn(`Event ${error.eventId}: ${error.error}`);
            });
          }
        }
      } catch (error) {
        console.error('Event processing failed:', error);
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
    console.log('Running ETL job manually...');
    const result = await this.runEtlJob();
    console.log('Manual ETL job completed:', result);
    
    return result;
  }

  /**
   * Force process events immediately
   */
  async processEventsNow(): Promise<any> {
    console.log('Processing events manually...');
    const result = await this.eventProcessor.processUnprocessedEvents();
    console.log('Manual event processing completed:', result);
    
    return result;
  }

  /**
   * Reprocess failed events
   */
  async reprocessFailedEvents(eventIds?: number[]): Promise<void> {
    console.log('Reprocessing failed events...');
    await this.eventProcessor.reprocessFailedEvents(eventIds);
    console.log('Failed events reprocessing completed');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ContractEventsSchedulerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Contract events scheduler configuration updated');
  }

  /**
   * Get the event processor instance for direct access
   */
  getEventProcessor(): ContractEventProcessor {
    return this.eventProcessor;
  }
} 