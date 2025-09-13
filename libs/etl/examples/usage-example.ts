import { db } from '@trpc-template/server/db';
import { ExampleApiEtlJob, EtlScheduler, BaseEtlJob } from '../src';
import { ExtractResult, TransformResult, LoadResult } from '../src/types';

// Example 1: Basic ETL Job Usage
async function runBasicEtlJob() {
  const etlJob = new ExampleApiEtlJob(
    {
      jobName: 'sync-users-from-api',
      batchSize: 100,
      maxRetries: 3,
      retryDelay: 2000,
      metadata: {
        source: 'external-api',
        version: '1.0',
      },
    },
    db,
    'https://jsonplaceholder.typicode.com', // Example API
    'your-api-key-here'
  );

  try {
    const result = await etlJob.run();
    
    console.log('ETL Job Result:', {
      success: result.success,
      duration: result.duration,
      extracted: result.totalExtracted,
      loaded: result.totalLoaded,
      errors: result.errors.length,
    });

    if (result.errors.length > 0) {
      console.log('Errors encountered:', result.errors);
    }
  } catch (error) {
    console.error('ETL Job failed:', error);
  }
}

// Example 2: Custom ETL Job Implementation
class CustomDataEtlJob extends BaseEtlJob<any, any> {
  protected async extract(cursor?: string, batchSize = 1000): Promise<ExtractResult> {
    // Implement your custom extraction logic
    // This could be from files, databases, APIs, etc.
    
    console.log(`Extracting data with cursor: ${cursor}, batch size: ${batchSize}`);
    
    // Example: simulate reading from a data source
    const mockData = Array.from({ length: Math.min(batchSize, 50) }, (_, i) => ({
      id: cursor ? parseInt(cursor) + i + 1 : i + 1,
      value: `data-${cursor ? parseInt(cursor) + i + 1 : i + 1}`,
      timestamp: new Date().toISOString(),
    }));

    const nextCursor = mockData.length > 0 ? mockData[mockData.length - 1].id.toString() : undefined;
    
    return {
      data: mockData,
      nextCursor,
      hasMore: mockData.length === batchSize,
      metadata: {
        source: 'custom-source',
        extractedAt: new Date().toISOString(),
      },
    };
  }

  protected async transform(data: any[]): Promise<TransformResult> {
    console.log(`Transforming ${data.length} records`);
    
    const transformedData = data.map(item => ({
      ...item,
      processed: true,
      transformedAt: new Date().toISOString(),
      normalizedValue: item.value.toUpperCase(),
    }));

    return {
      data: transformedData,
      metadata: {
        transformationRules: ['uppercase', 'add-timestamp'],
      },
    };
  }

  protected async load(data: any[]): Promise<LoadResult> {
    console.log(`Loading ${data.length} records`);
    
    // Implement your custom loading logic
    // This could be to databases, files, APIs, etc.
    
    try {
      // Example: simulate loading to a destination
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async operation
      
      return {
        success: true,
        processedCount: data.length,
        metadata: {
          destination: 'custom-destination',
          loadedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        processedCount: 0,
        errors: [{
          data: data[0],
          error: error as Error,
          index: 0,
        }],
      };
    }
  }

  protected async beforeJob(): Promise<void> {
    console.log('Custom ETL job starting...');
    // Add any initialization logic here
  }

  protected async afterJob(result: any): Promise<void> {
    console.log('Custom ETL job completed:', result.success ? 'SUCCESS' : 'FAILED');
    // Add any cleanup logic here
  }
}

// Example 3: Using the ETL Scheduler
async function setupScheduler() {
  const scheduler = new EtlScheduler({
    maxConcurrentJobs: 3,
    logLevel: 'info',
  });

  // Add a job that runs every 5 minutes
  const userSyncJob = new ExampleApiEtlJob(
    {
      jobName: 'user-sync-scheduled',
      batchSize: 50,
    },
    db,
    'https://jsonplaceholder.typicode.com'
  );

  scheduler.addJob(
    'user-sync',
    userSyncJob,
    { intervalMs: 5 * 60 * 1000 }, // Every 5 minutes
    true
  );

  // Add a one-time job
  const customJob = new CustomDataEtlJob(
    {
      jobName: 'custom-data-sync',
      batchSize: 100,
    },
    db
  );

  scheduler.addJob(
    'custom-sync',
    customJob,
    { runOnce: true },
    true
  );

  // Start the scheduler
  scheduler.start(30000); // Check every 30 seconds

  // Run a job immediately
  try {
    const result = await scheduler.runJob('custom-sync');
    console.log('Scheduled job result:', result);
  } catch (error) {
    console.error('Scheduled job failed:', error);
  }

  // Get job statuses
  console.log('Job statuses:', scheduler.getJobStatuses());

  // Stop the scheduler after some time (for demo purposes)
  setTimeout(() => {
    scheduler.stop();
    console.log('Scheduler stopped');
  }, 60000);
}

// Example 4: Error Handling and Monitoring
async function etlWithErrorHandling() {
  const job = new CustomDataEtlJob(
    {
      jobName: 'monitored-job',
      batchSize: 25,
      maxRetries: 2,
      retryDelay: 1000,
    },
    db
  );

  // Check current cursor state
  const currentCursor = await job.getCursor();
  console.log('Current cursor:', currentCursor);

  try {
    const result = await job.run();
    
    // Log detailed results
    console.log('Job completed with result:', {
      jobName: result.jobName,
      success: result.success,
      duration: `${result.duration}ms`,
      extracted: result.totalExtracted,
      transformed: result.totalTransformed,
      loaded: result.totalLoaded,
      errorCount: result.errors.length,
    });

    // Handle errors
    if (result.errors.length > 0) {
      console.error('Errors during ETL process:');
      result.errors.forEach((error, index) => {
        console.error(`  ${index + 1}. Stage: ${error.stage}, Error: ${error.error.message}`);
      });
    }

    // Reset cursor if needed (for testing)
    // await job.reset();
    
  } catch (error) {
    console.error('ETL Job failed completely:', error);
    
    // Get job state for debugging
    console.log('Job state:', job.getState());
  }
}

// Export examples for use
export {
  runBasicEtlJob,
  CustomDataEtlJob,
  setupScheduler,
  etlWithErrorHandling,
};