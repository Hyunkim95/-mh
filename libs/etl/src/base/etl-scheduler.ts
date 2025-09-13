import { BaseEtlJob } from './etl-job';
import { EtlJobResult } from '../types';

export interface ScheduledJob {
  job: BaseEtlJob<any, any>;
  cronExpression?: string;
  intervalMs?: number;
  runOnce?: boolean;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

export interface SchedulerConfig {
  maxConcurrentJobs?: number;
  defaultTimeoutMs?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export class EtlScheduler {
  private jobs = new Map<string, ScheduledJob>();
  private runningJobs = new Map<string, Promise<EtlJobResult>>();
  private config: Required<SchedulerConfig>;
  private intervalId?: NodeJS.Timeout;

  constructor(config: SchedulerConfig = {}) {
    this.config = {
      maxConcurrentJobs: 5,
      defaultTimeoutMs: 3600000, // 1 hour
      logLevel: 'info',
      ...config,
    };
  }

  /**
   * Add a job to be scheduled
   */
  addJob(
    jobName: string,
    job: BaseEtlJob<any, any>,
    schedule: {
      cronExpression?: string;
      intervalMs?: number;
      runOnce?: boolean;
    },
    enabled: boolean = true
  ): void {
    this.jobs.set(jobName, {
      job,
      cronExpression: schedule.cronExpression,
      intervalMs: schedule.intervalMs,
      runOnce: schedule.runOnce,
      enabled,
    });

    this.log('info', `Job ${jobName} added to scheduler`);
  }

  /**
   * Remove a job from the scheduler
   */
  removeJob(jobName: string): boolean {
    return this.jobs.delete(jobName);
  }

  /**
   * Enable or disable a job
   */
  setJobEnabled(jobName: string, enabled: boolean): boolean {
    const job = this.jobs.get(jobName);
    if (job) {
      job.enabled = enabled;
      this.log('info', `Job ${jobName} ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    }
    return false;
  }

  /**
   * Run a specific job immediately
   */
  async runJob(jobName: string, force: boolean = false): Promise<EtlJobResult> {
    const scheduledJob = this.jobs.get(jobName);
    if (!scheduledJob) {
      throw new Error(`Job ${jobName} not found`);
    }

    if (!scheduledJob.enabled && !force) {
      throw new Error(`Job ${jobName} is disabled`);
    }

    // Check if job is already running
    if (this.runningJobs.has(jobName) && !force) {
      throw new Error(`Job ${jobName} is already running`);
    }

    // Check concurrent job limit
    if (this.runningJobs.size >= this.config.maxConcurrentJobs && !force) {
      throw new Error('Maximum concurrent jobs limit reached');
    }

    this.log('info', `Starting job ${jobName}`);

    const jobPromise = this.executeJob(scheduledJob);
    this.runningJobs.set(jobName, jobPromise);

    try {
      const result = await jobPromise;
      scheduledJob.lastRun = new Date();

      // Mark as completed if it was a run-once job
      if (scheduledJob.runOnce) {
        scheduledJob.enabled = false;
      }

      this.log('info', `Job ${jobName} completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      return result;
    } finally {
      this.runningJobs.delete(jobName);
    }
  }

  private async executeJob(scheduledJob: ScheduledJob): Promise<EtlJobResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Job execution timeout'));
      }, this.config.defaultTimeoutMs);

      scheduledJob.job
        .run()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Start the scheduler
   */
  start(intervalMs: number = 60000): void {
    if (this.intervalId) {
      this.log('warn', 'Scheduler is already running');
      return;
    }

    this.log('info', 'Starting ETL scheduler');
    
    this.intervalId = setInterval(() => {
      this.checkAndRunScheduledJobs();
    }, intervalMs);

    // Run initial check
    this.checkAndRunScheduledJobs();
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      this.log('info', 'ETL scheduler stopped');
    }
  }

  private checkAndRunScheduledJobs(): void {
    const now = new Date();

    for (const [jobName, scheduledJob] of this.jobs) {
      if (!scheduledJob.enabled) continue;
      if (this.runningJobs.has(jobName)) continue;

      let shouldRun = false;

      // Check interval-based scheduling
      if (scheduledJob.intervalMs) {
        if (!scheduledJob.lastRun) {
          shouldRun = true;
        } else {
          const timeSinceLastRun = now.getTime() - scheduledJob.lastRun.getTime();
          shouldRun = timeSinceLastRun >= scheduledJob.intervalMs;
        }
      }

      // Check cron expression (basic implementation - you might want to use a cron library)
      if (scheduledJob.cronExpression && !shouldRun) {
        // For now, just log that cron is not implemented
        this.log('warn', `Cron expression not implemented for job ${jobName}`);
      }

      if (shouldRun) {
        this.runJob(jobName).catch(error => {
          this.log('error', `Failed to run scheduled job ${jobName}: ${error.message}`);
        });
      }
    }
  }

  /**
   * Get status of all jobs
   */
  getJobStatuses(): Record<string, { running: boolean; lastRun?: Date; enabled: boolean }> {
    const statuses: Record<string, { running: boolean; lastRun?: Date; enabled: boolean }> = {};

    for (const [jobName, scheduledJob] of this.jobs) {
      statuses[jobName] = {
        running: this.runningJobs.has(jobName),
        lastRun: scheduledJob.lastRun,
        enabled: scheduledJob.enabled,
      };
    }

    return statuses;
  }

  /**
   * Get list of running jobs
   */
  getRunningJobs(): string[] {
    return Array.from(this.runningJobs.keys());
  }

  /**
   * Wait for all running jobs to complete
   */
  async waitForAllJobs(): Promise<EtlJobResult[]> {
    const runningPromises = Array.from(this.runningJobs.values());
    return Promise.all(runningPromises);
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const configLevel = levels[this.config.logLevel];
    const messageLevel = levels[level];

    if (messageLevel >= configLevel) {
      const timestamp = new Date().toISOString();
      console[level](`[ETL Scheduler ${timestamp}] ${message}`);
    }
  }
}