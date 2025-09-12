# Contract Events Monitoring System

This document describes the contract events monitoring system that automatically fetches transactions from the Solana MultiHopper contract, extracts events, and updates route states in the database.

## Overview

The system consists of several components working together:

1. **Contract Events ETL Job** - Fetches transactions from the Solana blockchain
2. **Event Processor** - Processes contract events and updates database state
3. **Scheduler** - Manages the periodic execution of ETL and processing
4. **Service Layer** - Provides a unified interface for managing the system

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Solana RPC     │───▶│ Contract ETL    │───▶│ Database        │
│  (Transactions) │    │ Job             │    │ (Transactions)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Route States    │◀───│ Event           │◀───│ Contract        │
│ (Updated)       │    │ Processor       │    │ Events          │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Key Features

### Bidirectional Transaction Fetching
- **Forward Mode**: Fetches from most recent to oldest (default)
- **Backward Mode**: Fetches from oldest indexed to oldest available
- Uses transaction signatures as cursors for reliable pagination

### Event Processing
The system processes these contract events:
- **HopCompleted**: Updates hop execution status and advances route state
- **RouteCreated**: Links on-chain routes to database records
- **RouteFinished**: Marks routes as completed
- **TokenConfigCreated**: Tracks token configuration creation

### Automatic State Management
- Updates hop execution timestamps and transaction hashes
- Advances route current index after hop completion
- Marks next hops as ready for execution
- Links deployed routes to their on-chain PDAs

## Database Schema

### Contract Transactions Table
```sql
CREATE TABLE contract_transactions (
  id SERIAL PRIMARY KEY,
  signature VARCHAR NOT NULL UNIQUE,
  slot BIGINT NOT NULL,
  block_time TIMESTAMP,
  fee BIGINT DEFAULT 0,
  success BOOLEAN DEFAULT TRUE,
  error TEXT,
  program_id VARCHAR NOT NULL,
  transaction_data JSON,
  processed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Contract Events Table
```sql
CREATE TABLE contract_events (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER REFERENCES contract_transactions(id),
  signature VARCHAR NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSON NOT NULL,
  route_pda VARCHAR,
  route_id BIGINT,
  creator VARCHAR,
  hop_index INTEGER,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Configuration

The system is configured via environment variables:

```bash
# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
MULTI_HOPPER_PROGRAM_ID=DzM2xPUErizCjWTHyWTFqWtSgVazcfFVAGiehoRsG8os

# ETL Configuration
CONTRACT_ETL_INTERVAL_MS=30000          # ETL runs every 30 seconds
CONTRACT_PROCESSING_INTERVAL_MS=10000   # Event processing every 10 seconds
CONTRACT_ETL_DIRECTION=forward          # forward | backward
CONTRACT_EVENTS_ENABLED=true            # Enable/disable the system
```

## API Endpoints

The system exposes TRPC endpoints for management:

### Get Status
```typescript
contractEvents.getStatus()
```
Returns current system status including ETL and processing statistics.

### Manual Operations
```typescript
// Run ETL job immediately
contractEvents.runEtlNow()

// Process events immediately
contractEvents.processEventsNow()

// Reprocess failed events
contractEvents.reprocessFailedEvents({ eventIds?: number[] })
```

### Configuration Management
```typescript
contractEvents.updateConfig({
  etlIntervalMs?: number,
  processingIntervalMs?: number,
  enabled?: boolean,
  direction?: 'forward' | 'backward'
})
```

### Statistics
```typescript
// Get processing statistics
contractEvents.getProcessingStats()

// Check if service is ready
contractEvents.isReady()
```

## Event Processing Logic

### HopCompleted Event
1. Find route by PDA from event
2. Find specific hop by route ID and hop index
3. Update hop as executed with timestamp and transaction hash
4. Advance route's current index
5. Mark next hop as ready if it exists

### RouteCreated Event
1. Find matching route by creator (without PDA assigned)
2. Update route with on-chain PDA and deployment info
3. Mark first hop as ready for execution

### RouteFinished Event
1. Find route by PDA
2. Mark route status as completed

## Error Handling

### ETL Errors
- Automatic retries with exponential backoff
- Rate limiting to avoid RPC limits
- Graceful handling of network issues

### Processing Errors
- Events marked as unprocessed on failure
- Manual reprocessing capabilities
- Detailed error logging and tracking

### Recovery Mechanisms
- Cursor-based pagination ensures no missed transactions
- Duplicate transaction handling via unique constraints
- Failed events can be reprocessed individually

## Monitoring and Observability

### Logging
The system provides comprehensive logging:
- ETL job execution and results
- Event processing success/failure
- Configuration changes
- Error details and stack traces

### Metrics
Available through the API:
- Total transactions processed
- Events by type
- Processing success/failure rates
- Current cursor position

## Deployment

### Database Migration
Run the migration to create required tables:
```bash
cd libs/server
npx drizzle-kit migrate
```

### Service Startup
The service automatically starts with the server application. To disable:
```bash
export CONTRACT_EVENTS_ENABLED=false
```

### Health Checks
Check service health via:
```typescript
const status = await trpc.contractEvents.getStatus.query();
const ready = await trpc.contractEvents.isReady.query();
```

## Troubleshooting

### Common Issues

**ETL not fetching transactions**
- Check RPC URL and program ID configuration
- Verify network connectivity
- Check rate limiting settings

**Events not being processed**
- Check event processor interval
- Verify database connectivity
- Look for parsing errors in logs

**Route states not updating**
- Verify route PDA matches between on-chain and database
- Check hop indexing consistency
- Ensure creator addresses match

### Debug Commands

```typescript
// Get current status
const status = await trpc.contractEvents.getStatus.query();

// Get processing stats
const stats = await trpc.contractEvents.getProcessingStats.query();

// Force run ETL
await trpc.contractEvents.runEtlNow.mutate();

// Force process events
await trpc.contractEvents.processEventsNow.mutate();
```

## Enhanced Contract Integration

### Contract Utilities (`contract-utils.ts`)
The system leverages logic from `contract.service.ts` to provide:

**PDA Derivation Functions:**
- `getTokenConfigPda()` - Derive token config PDAs
- `getRouteConfigPda()` - Derive route config PDAs  
- `getRouteStatePda()` - Derive route state PDAs

**On-Chain Data Access:**
- `getRouteIdFromPda()` - Extract route ID from PDA
- `getRouteConfiguration()` - Fetch route config from chain
- `getRouteStateAccount()` - Fetch route state from chain
- `verifyRoutePda()` - Verify PDA matches expected route ID

**Smart Route Matching:**
- Routes are matched by route ID derived from PDAs (most accurate)
- Fallback to creator-based matching for unlinked routes
- Automatic PDA discovery and database updates
- Enhanced error recovery and logging

### New API Endpoints

```typescript
// Sync route data with on-chain state
contractEvents.syncRouteWithChain({ routeId: number })
```

## Development

### Running Locally
1. Set environment variables in `.env`
2. Run database migrations
3. Start the server - the service will auto-initialize

### Testing
The system includes comprehensive error handling and can be tested by:
1. Running manual ETL jobs
2. Processing events immediately
3. Checking statistics and status
4. Syncing specific routes with on-chain data

### Extending
To add new event types:
1. Add event definition to `contract-events-etl.ts`
2. Add processing logic to `contract-event-processor.ts`
3. Update database schema if needed
4. Add utility functions to `contract-utils.ts` if needed

## Performance Considerations

### RPC Rate Limiting
- Default 200ms delay between requests
- Configurable batch sizes
- Exponential backoff on errors

### Database Performance
- Indexed on signatures and PDAs
- Batch inserts for efficiency
- Proper foreign key constraints

### Memory Usage
- Streaming processing for large batches
- Configurable batch sizes
- Automatic cleanup of old data (if implemented)

## Security

### Access Control
- TRPC endpoints currently public (add auth as needed)
- Environment variable configuration
- No sensitive data in logs

### Data Integrity
- Transaction uniqueness enforced
- Foreign key constraints
- Atomic database operations

This system ensures reliable, automated synchronization between on-chain contract events and your application's database state. 