// Complete example of using the Contract Event ETL system

import { db } from '@trpc-template/server/db'; // Your database connection
import { EtlScheduler } from '@libs/etl';
import {
  ContractEventEtlJob,
  createERC20TransferETL,
  createERC721TransferETL,
  createGenericContractEventETL,
  ERC20TransferMapper,
  createCustomEventMapper,
  estimateSyncTime,
  BaseEventSchemaMapper,
} from '@libs/ethereum-node';
import { erc20Transfers, genericContractEvents } from '@libs/ethereum-node';

// Configuration
const RPC_URL = process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/YOUR_API_KEY';
const CURRENT_BLOCK = 18500000; // Example current block

// Example 1: Sync ERC20 transfers from USDC contract
async function syncUSDCTransfers() {
  const USDC_ADDRESS = '0xA0b86a33E6C2Fe1c7EaDa03b60A97B6d3A73e8Bd';
  const FROM_BLOCK = 18400000; // Start from this block
  
  console.log('=== Syncing USDC Transfers ===');
  
  // Estimate sync time first
  await estimateSyncTime(USDC_ADDRESS, FROM_BLOCK, CURRENT_BLOCK, RPC_URL);
  
  const etlJob = createERC20TransferETL(
    db,
    USDC_ADDRESS,
    FROM_BLOCK,
    RPC_URL,
    CURRENT_BLOCK
  );

  try {
    const result = await etlJob.run();
    
    console.log('USDC Transfer Sync Result:', {
      success: result.success,
      duration: `${result.duration}ms`,
      totalExtracted: result.totalExtracted,
      totalLoaded: result.totalLoaded,
      errorCount: result.errors.length,
    });

    if (result.errors.length > 0) {
      console.log('Sample errors:');
      result.errors.slice(0, 3).forEach((error, i) => {
        console.log(`  ${i + 1}. ${error.stage}: ${error.error.message}`);
      });
    }

    // Check cursor position
    const cursor = await etlJob.getCursor();
    console.log('Final cursor position:', cursor?.value);

  } catch (error) {
    console.error('USDC sync failed:', error);
  }
}

// Example 2: Sync NFT transfers from a popular collection
async function syncBoredApeTransfers() {
  const BAYC_ADDRESS = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D';
  const FROM_BLOCK = 18400000;
  
  console.log('\n=== Syncing Bored Ape Yacht Club Transfers ===');
  
  const etlJob = createERC721TransferETL(
    db,
    BAYC_ADDRESS,
    FROM_BLOCK,
    RPC_URL,
    CURRENT_BLOCK
  );

  try {
    const result = await etlJob.run();
    console.log('BAYC Transfer Sync Result:', {
      success: result.success,
      totalTransfers: result.totalLoaded,
      duration: `${result.duration}ms`,
    });
  } catch (error) {
    console.error('BAYC sync failed:', error);
  }
}

// Example 3: Custom event mapper for Uniswap V3 Pool events
interface UniswapV3SwapSchema {
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  contractAddress: string;
  eventName: string;
  timestamp?: Date;
  processedAt: Date;
  
  // Uniswap V3 specific fields
  sender: string;
  recipient: string;
  amount0: string;
  amount1: string;
  sqrtPriceX96: string;
  liquidity: string;
  tick: number;
}

const UNISWAP_V3_POOL_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "sender", "type": "address"},
      {"indexed": true, "name": "recipient", "type": "address"},
      {"indexed": false, "name": "amount0", "type": "int256"},
      {"indexed": false, "name": "amount1", "type": "int256"},
      {"indexed": false, "name": "sqrtPriceX96", "type": "uint160"},
      {"indexed": false, "name": "liquidity", "type": "uint128"},
      {"indexed": false, "name": "tick", "type": "int24"}
    ],
    "name": "Swap",
    "type": "event"
  }
];

class UniswapV3SwapMapper extends BaseEventSchemaMapper<UniswapV3SwapSchema> {
  mapEventToSchema(eventLog: any): UniswapV3SwapSchema {
    const baseFields = this.mapBaseFields(eventLog);
    const { sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick } = eventLog.args;
    
    return {
      ...baseFields,
      sender: sender.toLowerCase(),
      recipient: recipient.toLowerCase(),
      amount0: amount0.toString(),
      amount1: amount1.toString(),
      sqrtPriceX96: sqrtPriceX96.toString(),
      liquidity: liquidity.toString(),
      tick: Number(tick),
    } as UniswapV3SwapSchema;
  }

  validateMappedData(data: UniswapV3SwapSchema): boolean {
    return (
      super.validateMappedData(data) &&
      !!data.sender &&
      !!data.recipient &&
      typeof data.tick === 'number'
    );
  }
}

async function syncUniswapV3Swaps() {
  const UNISWAP_V3_USDC_ETH_POOL = '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8'; // 0.3% fee pool
  const FROM_BLOCK = 18490000;
  
  console.log('\n=== Syncing Uniswap V3 USDC/ETH Swaps ===');
  
  const etlJob = new ContractEventEtlJob(
    {
      jobName: 'uniswap-v3-usdc-eth-swaps',
      batchSize: 500, // Smaller batches for busy pools
      maxRetries: 5,
      retryDelay: 3000,
    },
    db,
    {
      contractAddress: UNISWAP_V3_USDC_ETH_POOL,
      contractAbi: UNISWAP_V3_POOL_ABI,
      eventName: 'Swap',
      fromBlock: FROM_BLOCK,
      toBlock: CURRENT_BLOCK,
      maxBlockRange: 1000, // Small ranges for busy contracts
      rpcUrl: RPC_URL,
    },
    genericContractEvents, // Using generic table for this example
    new UniswapV3SwapMapper()
  );

  try {
    const result = await etlJob.run();
    console.log('Uniswap V3 Swap Sync Result:', {
      success: result.success,
      totalSwaps: result.totalLoaded,
      duration: `${result.duration}ms`,
    });
  } catch (error) {
    console.error('Uniswap V3 sync failed:', error);
  }
}

// Example 4: Using the scheduler to run multiple ETL jobs
async function setupScheduledSync() {
  console.log('\n=== Setting up Scheduled ETL Jobs ===');
  
  const scheduler = new EtlScheduler({
    maxConcurrentJobs: 2, // Run max 2 jobs at once
    logLevel: 'info',
  });

  // Daily USDC sync
  const usdcJob = createERC20TransferETL(
    db,
    '0xA0b86a33E6C2Fe1c7EaDa03b60A97B6d3A73e8Bd',
    18400000,
    RPC_URL
  );

  scheduler.addJob(
    'daily-usdc-sync',
    usdcJob,
    { intervalMs: 24 * 60 * 60 * 1000 }, // Every 24 hours
    true
  );

  // Hourly NFT sync for a specific collection
  const nftJob = createERC721TransferETL(
    db,
    '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
    18400000,
    RPC_URL
  );

  scheduler.addJob(
    'hourly-bayc-sync',
    nftJob,
    { intervalMs: 60 * 60 * 1000 }, // Every hour
    true
  );

  // Start the scheduler
  scheduler.start(30000); // Check every 30 seconds

  console.log('Scheduler started with jobs:', Object.keys(scheduler.getJobStatuses()));

  // Run one job immediately as a test
  try {
    await scheduler.runJob('daily-usdc-sync');
  } catch (error) {
    console.error('Scheduled job failed:', error);
  }

  // Stop after 10 minutes (for example purposes)
  setTimeout(() => {
    scheduler.stop();
    console.log('Scheduler stopped');
  }, 10 * 60 * 1000);
}

// Example 5: Monitoring and error handling
async function monitorETLProgress() {
  console.log('\n=== Monitoring ETL Progress ===');
  
  const etlJob = createERC20TransferETL(
    db,
    '0xA0b86a33E6C2Fe1c7EaDa03b60A97B6d3A73e8Bd',
    18400000,
    RPC_URL,
    18450000 // Limited range for demo
  );

  // Check current state
  console.log('Initial state:', etlJob.getState());
  
  // Check cursor
  const cursor = await etlJob.getCursor();
  console.log('Current cursor:', cursor);

  // Estimate remaining work
  const remainingBlocks = await etlJob.estimateRemainingBlocks();
  console.log('Estimated remaining blocks:', remainingBlocks);

  // Run with progress monitoring (in real app, you'd do this in separate process)
  const startTime = Date.now();
  let lastCheck = startTime;
  
  const progressInterval = setInterval(async () => {
    const state = etlJob.getState();
    const currentCursor = await etlJob.getCursor();
    const elapsed = Date.now() - startTime;
    
    console.log(`Progress check (${elapsed}ms elapsed):`, {
      status: state.status,
      cursor: currentCursor?.value,
      currentBatch: state.currentBatch,
    });
    
    if (state.status !== 'running') {
      clearInterval(progressInterval);
    }
  }, 5000); // Check every 5 seconds

  try {
    const result = await etlJob.run();
    clearInterval(progressInterval);
    
    console.log('Final result:', {
      success: result.success,
      totalProcessed: result.totalLoaded,
      totalTime: result.duration,
      avgTimePerBatch: result.totalLoaded > 0 ? result.duration / (result.totalLoaded / 1000) : 0,
    });
  } catch (error) {
    clearInterval(progressInterval);
    console.error('ETL failed:', error);
  }
}

// Main execution
async function main() {
  try {
    // Run individual examples
    await syncUSDCTransfers();
    await syncBoredApeTransfers();
    await syncUniswapV3Swaps();
    
    // Setup monitoring
    await monitorETLProgress();
    
    // Setup scheduler (commented out to avoid long running process)
    // await setupScheduledSync();
    
  } catch (error) {
    console.error('Example execution failed:', error);
  }
}

// Export functions for individual use
export {
  syncUSDCTransfers,
  syncBoredApeTransfers,
  syncUniswapV3Swaps,
  setupScheduledSync,
  monitorETLProgress,
  main,
};

// Run if executed directly
if (require.main === module) {
  main();
}