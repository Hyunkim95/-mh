import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ContractEventEtlJob } from './contract-event-etl';
import { ERC20TransferMapper, ERC721TransferMapper, GenericEventMapper } from './schema-mappers';
import { erc20Transfers, erc721Transfers, genericContractEvents } from './example-schemas';

// Example ERC20 ABI (minimal Transfer event)
export const ERC20_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "from", "type": "address"},
      {"indexed": true, "name": "to", "type": "address"},
      {"indexed": false, "name": "value", "type": "uint256"}
    ],
    "name": "Transfer",
    "type": "event"
  }
];

// Example ERC721 ABI (minimal Transfer event)
export const ERC721_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "from", "type": "address"},
      {"indexed": true, "name": "to", "type": "address"},
      {"indexed": true, "name": "tokenId", "type": "uint256"}
    ],
    "name": "Transfer",
    "type": "event"
  }
];

// Example: Sync ERC20 Transfer events
export function createERC20TransferETL(
  db: NodePgDatabase<any>,
  contractAddress: string,
  fromBlock: number,
  rpcUrl: string,
  toBlock?: number
) {
  return new ContractEventEtlJob(
    {
      jobName: `erc20-transfers-${contractAddress.toLowerCase()}`,
      batchSize: 1000, // Process 1000 blocks at a time
      maxRetries: 3,
      retryDelay: 5000,
      metadata: {
        contractType: 'ERC20',
        contractAddress,
      },
    },
    db,
    {
      contractAddress,
      contractAbi: ERC20_ABI,
      eventName: 'Transfer',
      fromBlock,
      toBlock,
      maxBlockRange: 10000, // Process max 10k blocks per batch
      confirmations: 12,
      rpcUrl,
    },
    erc20Transfers,
    new ERC20TransferMapper()
  );
}

// Example: Sync ERC721 Transfer events
export function createERC721TransferETL(
  db: NodePgDatabase<any>,
  contractAddress: string,
  fromBlock: number,
  rpcUrl: string,
  toBlock?: number
) {
  return new ContractEventEtlJob(
    {
      jobName: `erc721-transfers-${contractAddress.toLowerCase()}`,
      batchSize: 1000,
      maxRetries: 3,
      retryDelay: 5000,
      metadata: {
        contractType: 'ERC721',
        contractAddress,
      },
    },
    db,
    {
      contractAddress,
      contractAbi: ERC721_ABI,
      eventName: 'Transfer',
      fromBlock,
      toBlock,
      maxBlockRange: 10000,
      confirmations: 12,
      rpcUrl,
    },
    erc721Transfers,
    new ERC721TransferMapper()
  );
}

// Example: Sync any contract event to generic table
export function createGenericContractEventETL(
  db: NodePgDatabase<any>,
  contractAddress: string,
  contractAbi: any[],
  eventName: string,
  fromBlock: number,
  rpcUrl: string,
  toBlock?: number
) {
  return new ContractEventEtlJob(
    {
      jobName: `generic-events-${contractAddress.toLowerCase()}-${eventName.toLowerCase()}`,
      batchSize: 1000,
      maxRetries: 3,
      retryDelay: 5000,
      metadata: {
        contractAddress,
        eventName,
      },
    },
    db,
    {
      contractAddress,
      contractAbi,
      eventName,
      fromBlock,
      toBlock,
      maxBlockRange: 5000, // Smaller batches for generic events
      confirmations: 12,
      rpcUrl,
    },
    genericContractEvents,
    new GenericEventMapper()
  );
}

// Example usage functions
export async function syncUSDCTransfers(
  db: NodePgDatabase<any>,
  rpcUrl: string,
  fromBlock: number
) {
  const USDC_ADDRESS = '0xA0b86a33E6C2Fe1c7EaDa03b60A97B6d3A73e8Bd'; // Example USDC address
  
  const etlJob = createERC20TransferETL(
    db,
    USDC_ADDRESS,
    fromBlock,
    rpcUrl
  );

  console.log('Starting USDC Transfer sync...');
  const result = await etlJob.run();
  
  console.log('USDC Transfer sync completed:', {
    success: result.success,
    totalTransfers: result.totalLoaded,
    duration: result.duration,
    errors: result.errors.length,
  });

  return result;
}

export async function syncNFTTransfers(
  db: NodePgDatabase<any>,
  nftContractAddress: string,
  rpcUrl: string,
  fromBlock: number
) {
  const etlJob = createERC721TransferETL(
    db,
    nftContractAddress,
    fromBlock,
    rpcUrl
  );

  console.log(`Starting NFT Transfer sync for ${nftContractAddress}...`);
  const result = await etlJob.run();
  
  console.log('NFT Transfer sync completed:', {
    success: result.success,
    totalTransfers: result.totalLoaded,
    duration: result.duration,
    errors: result.errors.length,
  });

  return result;
}

// Example: Sync custom Uniswap V2 Swap events
export const UNISWAP_V2_PAIR_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "sender", "type": "address"},
      {"indexed": false, "name": "amount0In", "type": "uint256"},
      {"indexed": false, "name": "amount1In", "type": "uint256"},
      {"indexed": false, "name": "amount0Out", "type": "uint256"},
      {"indexed": false, "name": "amount1Out", "type": "uint256"},
      {"indexed": true, "name": "to", "type": "address"}
    ],
    "name": "Swap",
    "type": "event"
  }
];

export async function syncUniswapSwaps(
  db: NodePgDatabase<any>,
  pairAddress: string,
  rpcUrl: string,
  fromBlock: number
) {
  const etlJob = createGenericContractEventETL(
    db,
    pairAddress,
    UNISWAP_V2_PAIR_ABI,
    'Swap',
    fromBlock,
    rpcUrl
  );

  console.log(`Starting Uniswap Swap sync for ${pairAddress}...`);
  const result = await etlJob.run();
  
  console.log('Uniswap Swap sync completed:', {
    success: result.success,
    totalSwaps: result.totalLoaded,
    duration: result.duration,
    errors: result.errors.length,
  });

  return result;
}

// Utility function to estimate sync time
export async function estimateSyncTime(
  contractAddress: string,
  fromBlock: number,
  toBlock: number,
  _rpcUrl: string,
  blocksPerBatch: number = 10000
) {
  const totalBlocks = toBlock - fromBlock;
  const batches = Math.ceil(totalBlocks / blocksPerBatch);
  
  // Rough estimate: 2-5 seconds per batch depending on RPC speed and event density
  const estimatedSeconds = batches * 3;
  
  console.log(`Estimated sync time for ${contractAddress}:`);
  console.log(`  Total blocks: ${totalBlocks.toLocaleString()}`);
  console.log(`  Batches: ${batches}`);
  console.log(`  Estimated time: ${Math.ceil(estimatedSeconds / 60)} minutes`);
  
  return {
    totalBlocks,
    batches,
    estimatedSeconds,
    estimatedMinutes: Math.ceil(estimatedSeconds / 60),
  };
}