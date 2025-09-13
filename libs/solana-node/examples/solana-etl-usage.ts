// Complete example of using the Solana ETL system

import { db } from '@server/db'; // Your database connection
import { EtlScheduler } from '@libs/etl';
import {
  SolanaTransactionEtlJob,
  SolanaAccountEtlJob,
  createProgramTransactionETL,
  createSPLTokenTransferETL,
  bidirectionalTransactionSync,
  syncUSDCTransactionsForward,
  syncUSDCTransactionsBackward,
  syncRaydiumTransactions,
  monitorWalletActivity,
  GenericSolanaTransactionMapper,
  SPLTokenTransferMapper,
  solanaTransactions,
  splTokenTransfers,
} from '@libs/solana-node';

// Configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Example 1: Forward sync - from most recent to latest
async function forwardSyncExample() {
  console.log('=== Forward Sync Example ===');
  console.log('Syncing from most recent signatures to latest (ongoing)');
  
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  
  try {
    const result = await syncUSDCTransactionsForward(db, SOLANA_RPC_URL);
    
    console.log('Forward sync result:', {
      success: result.success,
      totalTransactions: result.totalLoaded,
      duration: `${result.duration}ms`,
      errors: result.errors.length,
    });

    // Check cursor to see where we are
    const forwardJob = createSPLTokenTransferETL(db, USDC_MINT, SOLANA_RPC_URL, 'forward');
    const cursor = await forwardJob.getCursor();
    console.log('Current forward cursor:', cursor?.value ? JSON.parse(cursor.value) : 'none');

  } catch (error) {
    console.error('Forward sync failed:', error);
  }
}

// Example 2: Backward sync - from oldest indexed to oldest available
async function backwardSyncExample() {
  console.log('\n=== Backward Sync Example ===');
  console.log('Syncing from oldest indexed signature to oldest available');
  
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  
  try {
    const result = await syncUSDCTransactionsBackward(db, SOLANA_RPC_URL);
    
    console.log('Backward sync result:', {
      success: result.success,
      totalTransactions: result.totalLoaded,
      duration: `${result.duration}ms`,
      errors: result.errors.length,
    });

    // Check cursor to see where we are
    const backwardJob = createSPLTokenTransferETL(db, USDC_MINT, SOLANA_RPC_URL, 'backward');
    const cursor = await backwardJob.getCursor();
    console.log('Current backward cursor:', cursor?.value ? JSON.parse(cursor.value) : 'none');

  } catch (error) {
    console.error('Backward sync failed:', error);
  }
}

// Example 3: Bidirectional sync for complete coverage
async function bidirectionalSyncExample() {
  console.log('\n=== Bidirectional Sync Example ===');
  
  const RAYDIUM_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
  
  try {
    const result = await bidirectionalTransactionSync(
      db,
      RAYDIUM_PROGRAM_ID,
      SOLANA_RPC_URL
    );
    
    console.log('Bidirectional sync summary:', result.summary);
  } catch (error) {
    console.error('Bidirectional sync failed:', error);
  }
}

// Example 4: Monitor specific wallet activity
async function walletMonitoringExample() {
  console.log('\n=== Wallet Monitoring Example ===');
  
  // Example wallet (replace with actual wallet address)
  const WALLET_ADDRESS = 'DhLrr1KAQgWKNHcnMcCJKLPw4QP4jYhgNs6H7nQ8nP8r';
  
  try {
    // Monitor recent activity (forward)
    console.log('Monitoring recent wallet activity...');
    const recentResult = await monitorWalletActivity(
      db,
      WALLET_ADDRESS,
      SOLANA_RPC_URL,
      'forward'
    );

    // Monitor historical activity (backward)
    console.log('Monitoring historical wallet activity...');
    const historicalResult = await monitorWalletActivity(
      db,
      WALLET_ADDRESS,
      SOLANA_RPC_URL,
      'backward'
    );

    console.log('Wallet monitoring summary:', {
      recent: {
        transactions: recentResult.totalLoaded,
        success: recentResult.success,
      },
      historical: {
        transactions: historicalResult.totalLoaded,
        success: historicalResult.success,
      },
    });

  } catch (error) {
    console.error('Wallet monitoring failed:', error);
  }
}

// Example 5: Custom ETL with specific program
async function customProgramETL() {
  console.log('\n=== Custom Program ETL Example ===');
  
  // Example: Mango Markets program
  const MANGO_PROGRAM_ID = 'mv3ekLzLbnVPNxjSKvqBpU3ZeZXPQdEC3bp5MDEBG68';
  
  const etlJob = new SolanaTransactionEtlJob(
    {
      jobName: `mango-transactions-forward`,
      batchSize: 50, // Smaller batches for complex programs
      maxRetries: 5,
      retryDelay: 3000,
      metadata: {
        programName: 'Mango Markets',
        version: '1.0',
      },
    },
    db,
    {
      type: 'transactions',
      programId: MANGO_PROGRAM_ID,
      direction: 'forward',
      rpcUrl: SOLANA_RPC_URL,
      commitment: 'confirmed',
      maxSignatures: 500, // Conservative for busy programs
      delayMs: 300, // More delay to avoid rate limiting
    },
    solanaTransactions,
    new GenericSolanaTransactionMapper()
  );

  try {
    console.log('Starting Mango Markets transaction sync...');
    const result = await etlJob.run();
    
    console.log('Mango transactions sync result:', {
      success: result.success,
      transactions: result.totalLoaded,
      duration: `${result.duration}ms`,
      averageSlot: result.metadata?.newestSlot,
    });

    // Get current sync state
    const state = etlJob.getState();
    const cursor = await etlJob.getCursor();
    
    console.log('ETL job state:', {
      status: state.status,
      currentBatch: state.currentBatch,
      cursor: cursor?.value,
    });

  } catch (error) {
    console.error('Mango ETL failed:', error);
  }
}

// Example 6: Scheduled ETL jobs
async function setupScheduledSolanaETL() {
  console.log('\n=== Scheduled Solana ETL Setup ===');
  
  const scheduler = new EtlScheduler({
    maxConcurrentJobs: 2, // Conservative for Solana RPC limits
    logLevel: 'info',
  });

  // Hourly USDC forward sync (keep up with new transactions)
  const usdcForwardJob = createSPLTokenTransferETL(
    db,
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    SOLANA_RPC_URL,
    'forward'
  );

  scheduler.addJob(
    'usdc-forward-sync',
    usdcForwardJob,
    { intervalMs: 60 * 60 * 1000 }, // Every hour
    true
  );

  // Daily USDC backward sync (backfill historical data)
  const usdcBackwardJob = createSPLTokenTransferETL(
    db,
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    SOLANA_RPC_URL,
    'backward'
  );

  scheduler.addJob(
    'usdc-backward-sync',
    usdcBackwardJob,
    { intervalMs: 24 * 60 * 60 * 1000 }, // Every 24 hours
    true
  );

  // Start the scheduler
  scheduler.start(60000); // Check every minute

  console.log('Scheduler started with jobs:', Object.keys(scheduler.getJobStatuses()));

  // Run one job immediately as test
  try {
    console.log('Running immediate test sync...');
    await scheduler.runJob('usdc-forward-sync');
  } catch (error) {
    console.error('Scheduled job test failed:', error);
  }

  return scheduler;
}

// Example 7: Progress monitoring and cursor management
async function progressMonitoringExample() {
  console.log('\n=== Progress Monitoring Example ===');
  
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const etlJob = createSPLTokenTransferETL(db, USDC_MINT, SOLANA_RPC_URL, 'forward');

  // Check current state before starting
  console.log('Initial job state:', etlJob.getState());
  
  // Check existing cursor
  const initialCursor = await etlJob.getCursor();
  console.log('Initial cursor:', initialCursor ? JSON.parse(initialCursor.value) : 'none');

  // Monitor progress during execution
  const progressMonitor: NodeJS.Timeout = setInterval(async () => {
    const state = etlJob.getState();
    const cursor = await etlJob.getCursor();
    
    console.log('Progress update:', {
      status: state.status,
      currentBatch: state.currentBatch,
      cursor: cursor ? JSON.parse(cursor.value) : null,
      timestamp: new Date().toISOString(),
    });
  }, 5000); // Check every 5 seconds

  try {
    
    const result = await etlJob.run();
    
    clearInterval(progressMonitor);
    
    console.log('Final result:', {
      success: result.success,
      totalLoaded: result.totalLoaded,
      duration: `${result.duration}ms`,
      finalCursor: JSON.parse((await etlJob.getCursor())?.value || 'null'),
    });

    // Demonstrate cursor reset
    console.log('Resetting cursor for fresh start...');
    await etlJob.reset();
    
    const resetCursor = await etlJob.getCursor();
    console.log('Cursor after reset:', resetCursor);

  } catch (error) {
    clearInterval(progressMonitor);
    console.error('Progress monitoring failed:', error);
  }
}

// Main execution function
async function main() {
  console.log('🚀 Solana ETL Examples Starting...\n');

  try {
    // Run individual examples
    await forwardSyncExample();
    await backwardSyncExample();
    await bidirectionalSyncExample();
    await walletMonitoringExample();
    await customProgramETL();
    await progressMonitoringExample();
    
    // Setup scheduler (commented out for demo)
    // const scheduler = await setupScheduledSolanaETL();
    // setTimeout(() => scheduler.stop(), 60000); // Stop after 1 minute
    
    console.log('\n✅ All Solana ETL examples completed successfully!');
    
  } catch (error) {
    console.error('❌ Example execution failed:', error);
  }
}

// Export functions for individual use
export {
  forwardSyncExample,
  backwardSyncExample,
  bidirectionalSyncExample,
  walletMonitoringExample,
  customProgramETL,
  setupScheduledSolanaETL,
  progressMonitoringExample,
  main,
};

// Run if executed directly
if (require.main === module) {
  main();
}