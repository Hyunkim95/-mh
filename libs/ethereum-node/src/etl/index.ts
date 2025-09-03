// Contract Event ETL Framework
export { ContractEventEtlJob } from './contract-event-etl';

// Types and interfaces
export * from './types';

// Schema mappers
export {
  BaseEventSchemaMapper,
  ERC20TransferMapper,
  ERC721TransferMapper,
  GenericEventMapper,
  createCustomEventMapper,
} from './schema-mappers';

// Example database schemas
export * from './example-schemas';

// Example ETL job factories and usage
export {
  createERC20TransferETL,
  createERC721TransferETL,
  createGenericContractEventETL,
  syncUSDCTransfers,
  syncNFTTransfers,
  syncUniswapSwaps,
  estimateSyncTime,
  ERC20_ABI,
  ERC721_ABI,
  UNISWAP_V2_PAIR_ABI,
} from './examples';