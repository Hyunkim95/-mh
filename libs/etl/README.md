# ETL Package

A robust Extract, Transform, Load (ETL) framework with database cursor management for tracking progress and resuming jobs.

## Features

- **Abstract Base Classes**: Override `extract()`, `transform()`, and `load()` methods
- **Database Cursor Management**: Track progress with Drizzle ORM integration
- **Error Handling**: Configurable retries with exponential backoff
- **Batch Processing**: Process data in configurable batch sizes
- **Job Scheduling**: Run jobs on intervals or schedules
- **Monitoring**: Track job status, progress, and errors
- **TypeScript**: Full type safety and IntelliSense support

## Installation

```bash
# This package is already configured in your workspace
npm install
```

## Database Setup

The cursor tracking table is already added to your server schema:

```sql
-- ETL cursors table for tracking progress
CREATE TABLE etl_cursors (
  id SERIAL PRIMARY KEY,
  job_name VARCHAR(255) NOT NULL UNIQUE,
  cursor_value TEXT NOT NULL,
  metadata JSON,
  last_processed_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

## Basic Usage

### 1. Create a Custom ETL Job

```typescript
import { BaseEtlJob, ExtractResult, TransformResult, LoadResult } from '@libs/etl';
import { db } from '@trpc-template/server/db';

class MyCustomETL extends BaseEtlJob<SourceData, TransformedData> {
  protected async extract(cursor?: string, batchSize = 1000): Promise<ExtractResult<SourceData>> {
    // Implement your extraction logic
    // - Fetch from APIs, databases, files, etc.
    // - Use cursor for pagination/resumability
    
    const data = await fetchDataFromSource(cursor, batchSize);
    
    return {
      data: data.items,
      nextCursor: data.nextPageToken,
      hasMore: data.hasNextPage,
      metadata: { source: 'my-api' }
    };
  }

  protected async transform(data: SourceData[]): Promise<TransformResult<TransformedData>> {
    const transformed = [];
    const errors = [];

    for (const item of data) {
      try {
        // Implement your transformation logic
        const transformedItem = {
          id: item.id,
          name: item.name.toLowerCase().trim(),
          email: item.email_address,
          createdAt: new Date(item.created_timestamp)
        };
        
        // Validation
        if (!transformedItem.email.includes('@')) {
          throw new Error('Invalid email');
        }
        
        transformed.push(transformedItem);
      } catch (error) {
        errors.push({
          originalData: item,
          error: error as Error,
          index: transformed.length
        });
      }
    }

    return {
      data: transformed,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  protected async load(data: TransformedData[]): Promise<LoadResult> {
    // Implement your loading logic
    // - Save to database, send to APIs, write to files, etc.
    
    let processedCount = 0;
    const errors = [];

    for (const item of data) {
      try {
        await this.db.insert(myTable).values(item);
        processedCount++;
      } catch (error) {
        errors.push({
          data: item,
          error: error as Error,
          index: processedCount
        });
      }
    }

    return {
      success: errors.length === 0,
      processedCount,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}
```

### 2. Run the ETL Job

```typescript
const etlJob = new MyCustomETL(
  {
    jobName: 'my-data-sync',
    batchSize: 500,
    maxRetries: 3,
    retryDelay: 2000,
    metadata: { version: '1.0' }
  },
  db
);

const result = await etlJob.run();

console.log({
  success: result.success,
  extracted: result.totalExtracted,
  loaded: result.totalLoaded,
  duration: result.duration,
  errors: result.errors.length
});
```

### 3. Schedule ETL Jobs

```typescript
import { EtlScheduler } from '@libs/etl';

const scheduler = new EtlScheduler({
  maxConcurrentJobs: 3
});

// Run every hour
scheduler.addJob('hourly-sync', etlJob, { intervalMs: 60 * 60 * 1000 });

// Start scheduler
scheduler.start();
```

## API Reference

### BaseEtlJob

Abstract base class for ETL jobs.

#### Constructor Options

```typescript
interface EtlJobConfig {
  jobName: string;           // Unique job identifier
  batchSize?: number;        // Records per batch (default: 1000)
  maxRetries?: number;       // Max retry attempts (default: 3)
  retryDelay?: number;       // Delay between retries in ms (default: 1000)
  timeout?: number;          // Job timeout in ms (default: 300000)
  concurrency?: number;      // Concurrent operations (default: 1)
  metadata?: object;         // Additional job metadata
}
```

#### Methods to Override

- `extract(cursor?, batchSize)`: Extract data from source
- `transform(data)`: Transform extracted data  
- `load(data)`: Load transformed data to destination
- `beforeJob()`: Optional setup before job starts
- `afterJob(result)`: Optional cleanup after job completes
- `onError(error, stage, data)`: Optional error handling

#### Public Methods

- `run()`: Execute the ETL job
- `reset()`: Clear cursor and reset job state
- `getCursor()`: Get current cursor position
- `getState()`: Get job execution state

### DatabaseCursorManager

Manages ETL cursors in the database.

```typescript
const cursorManager = new DatabaseCursorManager(db);

await cursorManager.updateCursor('job-name', 'cursor-value', { metadata });
const cursor = await cursorManager.getCursor('job-name');
await cursorManager.deleteCursor('job-name');
```

### EtlScheduler

Schedules and manages multiple ETL jobs.

```typescript
const scheduler = new EtlScheduler({
  maxConcurrentJobs: 5,
  defaultTimeoutMs: 3600000
});

scheduler.addJob('job-1', etlJob, { intervalMs: 300000 }); // Every 5 minutes
scheduler.start();
```

## Error Handling

The framework provides comprehensive error handling:

1. **Extraction Errors**: Fail the entire batch, cursor remains unchanged
2. **Transformation Errors**: Track errors per record, continue processing valid records
3. **Load Errors**: Track errors per record, continue processing valid records
4. **Retries**: Configurable retry logic with exponential backoff
5. **Timeouts**: Configurable job-level timeouts

```typescript
const result = await etlJob.run();

if (result.errors.length > 0) {
  result.errors.forEach(error => {
    console.error(`${error.stage}: ${error.error.message}`);
    if (error.data) {
      console.error('Failed data:', error.data);
    }
  });
}
```

## Cursor Management

Cursors enable resumable ETL jobs:

```typescript
// Job automatically saves progress
const result1 = await etlJob.run(); // Processes batches 1-10
const result2 = await etlJob.run(); // Resumes from batch 11

// Manual cursor management
const cursor = await etlJob.getCursor();
console.log('Current position:', cursor?.value);

// Reset to start from beginning
await etlJob.reset();
```

## Monitoring and Observability

### Job State

```typescript
const state = etlJob.getState();
console.log({
  status: state.status,           // 'idle' | 'running' | 'success' | 'error'
  currentBatch: state.currentBatch,
  progress: state.progress,
  lastError: state.lastError
});
```

### Scheduler Status

```typescript
const statuses = scheduler.getJobStatuses();
const runningJobs = scheduler.getRunningJobs();

// Wait for all jobs to complete
await scheduler.waitForAllJobs();
```

## Examples

See `examples/usage-example.ts` for comprehensive usage examples including:

- Basic ETL job implementation
- Custom transformation logic
- Error handling strategies
- Job scheduling
- Monitoring and debugging

## Best Practices

1. **Idempotency**: Make your `load()` method idempotent using upserts
2. **Batch Sizes**: Start with smaller batches, tune based on memory/performance
3. **Error Handling**: Log errors but don't let them stop the entire job
4. **Monitoring**: Track job metrics and set up alerts for failures
5. **Testing**: Mock external dependencies for unit testing
6. **Cursor Strategy**: Use timestamps, IDs, or offsets that guarantee ordering