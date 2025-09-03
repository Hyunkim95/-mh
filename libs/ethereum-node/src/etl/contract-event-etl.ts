import { JsonRpcProvider, Contract, Interface } from 'ethers';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { BaseEtlJob, ExtractResult, TransformResult, LoadResult, EtlJobConfig } from './etl-base';
import { 
  ContractEventConfig, 
  EventLogData, 
  EventSchemaMapper
} from './types';

export class ContractEventEtlJob<TSchema = any> extends BaseEtlJob<EventLogData, TSchema> {
  private provider: JsonRpcProvider;
  private contract: Contract;
  private eventInterface: Interface;
  private contractConfig: ContractEventConfig;
  private schemaMapper: EventSchemaMapper<TSchema>;
  private targetTable: any; // Drizzle table reference

  constructor(
    etlConfig: EtlJobConfig,
    db: NodePgDatabase<any>,
    contractConfig: ContractEventConfig,
    targetTable: any, // Drizzle table
    schemaMapper: EventSchemaMapper<TSchema>
  ) {
    super(etlConfig, db);
    
    this.contractConfig = {
      maxBlockRange: 10000,
      confirmations: 12,
      ...contractConfig,
    };
    
    this.provider = new JsonRpcProvider(contractConfig.rpcUrl);
    this.eventInterface = new Interface(contractConfig.contractAbi);
    this.contract = new Contract(
      contractConfig.contractAddress,
      contractConfig.contractAbi,
      this.provider
    );
    
    this.schemaMapper = schemaMapper;
    this.targetTable = targetTable;
  }

  protected async extract(cursor?: string): Promise<ExtractResult<EventLogData>> {
    try {
      // Parse cursor to get last processed block
      const lastBlock = cursor ? parseInt(cursor) : this.contractConfig.fromBlock - 1;
      const currentBlock = await this.provider.getBlockNumber();
      const confirmedBlock = currentBlock - this.contractConfig.confirmations!;

      // Determine the range to process
      const fromBlock = lastBlock + 1;
      const maxToBlock = Math.min(
        fromBlock + this.contractConfig.maxBlockRange! - 1,
        this.contractConfig.toBlock || confirmedBlock,
        confirmedBlock
      );

      if (fromBlock > maxToBlock) {
        return {
          data: [],
          nextCursor: cursor,
          hasMore: false,
          metadata: {
            reason: 'No new confirmed blocks available',
            currentBlock,
            lastProcessedBlock: lastBlock,
          },
        };
      }

      console.log(`Fetching ${this.contractConfig.eventName} events from block ${fromBlock} to ${maxToBlock}`);

      // Create event filter
      const eventFilter = this.contract.filters[this.contractConfig.eventName]();
      
      // Get event logs  
      const logs = await this.provider.getLogs({
        address: this.contractConfig.contractAddress,
        topics: await eventFilter.getTopicFilter(),
        fromBlock,
        toBlock: maxToBlock,
      });

      // Process logs into EventLogData format
      const eventLogs: EventLogData[] = [];
      
      for (const log of logs) {
        try {
          // Parse the log using the contract interface
          const parsedLog = this.eventInterface.parseLog({
            topics: log.topics,
            data: log.data,
          });

          if (parsedLog && parsedLog.name === this.contractConfig.eventName) {
            // Convert args to a plain object
            const args: Record<string, any> = {};
            if (parsedLog.args) {
              for (let i = 0; i < parsedLog.args.length; i++) {
                const input = this.eventInterface.getEvent(this.contractConfig.eventName)?.inputs[i];
                if (input) {
                  args[input.name] = parsedLog.args[i];
                }
              }
            }

            const eventLogData: EventLogData = {
              blockNumber: log.blockNumber,
              blockHash: log.blockHash,
              transactionHash: log.transactionHash,
              transactionIndex: log.transactionIndex,
              logIndex: log.index,
              address: log.address.toLowerCase(),
              eventName: parsedLog.name,
              args,
            };

            eventLogs.push(eventLogData);
          }
        } catch (parseError) {
          console.warn(`Failed to parse log at block ${log.blockNumber}:`, parseError);
        }
      }

      // Get block timestamps for the events (in batches to avoid too many RPC calls)
      const blockNumbers = [...new Set(eventLogs.map(log => log.blockNumber))];
      const blockTimestamps: Record<number, number> = {};

      for (const blockNumber of blockNumbers) {
        try {
          const block = await this.provider.getBlock(blockNumber);
          if (block) {
            blockTimestamps[blockNumber] = block.timestamp;
          }
        } catch (error) {
          console.warn(`Failed to get timestamp for block ${blockNumber}:`, error);
        }
      }

      // Add timestamps to event logs
      eventLogs.forEach(log => {
        log.timestamp = blockTimestamps[log.blockNumber];
      });

      const nextCursor = maxToBlock.toString();
      const hasMore = maxToBlock < (this.contractConfig.toBlock || confirmedBlock);

      return {
        data: eventLogs,
        nextCursor,
        hasMore,
        metadata: {
          fromBlock,
          toBlock: maxToBlock,
          currentBlock,
          confirmedBlock,
          totalLogs: eventLogs.length,
          blockRange: maxToBlock - fromBlock + 1,
        },
      };
    } catch (error) {
      throw new Error(`Failed to extract events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  protected async transform(data: EventLogData[]): Promise<TransformResult<TSchema>> {
    const transformed: TSchema[] = [];
    const errors: Array<{ originalData: EventLogData; error: Error; index: number }> = [];

    for (let i = 0; i < data.length; i++) {
      const eventLog = data[i];

      try {
        // Map event to schema format
        const mappedData = this.schemaMapper.mapEventToSchema(eventLog);
        
        // Validate the mapped data
        if (!this.schemaMapper.validateMappedData(mappedData)) {
          throw new Error('Schema validation failed');
        }

        transformed.push(mappedData);
      } catch (error) {
        errors.push({
          originalData: eventLog,
          error: error instanceof Error ? error : new Error(String(error)),
          index: i,
        });
      }
    }

    return {
      data: transformed,
      errors: errors.length > 0 ? errors : undefined,
      metadata: {
        originalCount: data.length,
        transformedCount: transformed.length,
        errorCount: errors.length,
        eventName: this.contractConfig.eventName,
        contractAddress: this.contractConfig.contractAddress,
      },
    };
  }

  protected async load(data: TSchema[]): Promise<LoadResult> {
    if (data.length === 0) {
      return {
        success: true,
        processedCount: 0,
        metadata: { message: 'No data to load' },
      };
    }

    let processedCount = 0;
    const errors: Array<{ data: TSchema; error: Error; index: number }> = [];

    try {
      // Insert data in batches to avoid overwhelming the database
      const batchSize = 100;
      
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        
        try {
          // Use upsert to handle potential duplicates
          await this.db
            .insert(this.targetTable)
            .values(batch)
            .onConflictDoUpdate({
              target: [this.targetTable.transactionHash, this.targetTable.logIndex],
              set: {
                // Update timestamp and metadata if needed
                processedAt: new Date(),
              },
            });

          processedCount += batch.length;
        } catch (batchError) {
          // If batch insert fails, try individual inserts to identify problematic records
          for (let j = 0; j < batch.length; j++) {
            const item = batch[j];
            try {
              await this.db
                .insert(this.targetTable)
                .values(item as any)
                .onConflictDoUpdate({
                  target: [this.targetTable.transactionHash, this.targetTable.logIndex],
                  set: {
                    processedAt: new Date(),
                  },
                });
              processedCount++;
            } catch (itemError) {
              errors.push({
                data: item,
                error: itemError instanceof Error ? itemError : new Error(String(itemError)),
                index: i + j,
              });
            }
          }
        }
      }

      return {
        success: errors.length === 0,
        processedCount,
        errors: errors.length > 0 ? errors : undefined,
        metadata: {
          totalRecords: data.length,
          successCount: processedCount,
          errorCount: errors.length,
          tableName: this.targetTable._.name,
        },
      };
    } catch (error) {
      throw new Error(`Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  protected async beforeJob(): Promise<void> {
    const config = this.getConfig();
    console.log(`Starting contract event ETL: ${config.jobName}`);
    console.log(`Contract: ${this.contractConfig.contractAddress}`);
    console.log(`Event: ${this.contractConfig.eventName}`);
    console.log(`Block range: ${this.contractConfig.fromBlock} - ${this.contractConfig.toBlock || 'latest'}`);
    
    // Verify contract and event exist
    try {
      await this.provider.getCode(this.contractConfig.contractAddress);
      const eventFragment = this.eventInterface.getEvent(this.contractConfig.eventName);
      if (!eventFragment) {
        throw new Error(`Event ${this.contractConfig.eventName} not found in contract ABI`);
      }
    } catch (error) {
      throw new Error(`Contract verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  protected async afterJob(result: any): Promise<void> {
    const config = this.getConfig();
    console.log(`Contract event ETL completed: ${config.jobName}`);
    console.log(`Success: ${result.success}`);
    console.log(`Events processed: ${result.totalLoaded}`);
    console.log(`Duration: ${result.duration}ms`);
    
    if (result.errors.length > 0) {
      console.log(`Errors encountered: ${result.errors.length}`);
    }
  }

  protected async onError(error: Error, stage: 'extract' | 'transform' | 'load', _data?: any): Promise<void> {
    console.error(`Contract ETL error in ${stage}:`, error.message);
    
    if (stage === 'extract') {
      console.error('Consider reducing maxBlockRange or checking RPC connection');
    } else if (stage === 'load') {
      console.error('Check database schema compatibility and constraints');
    }
  }

  // Utility methods specific to contract event ETL
  
  async getCurrentBlock(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  async getBlockTimestamp(blockNumber: number): Promise<number | null> {
    try {
      const block = await this.provider.getBlock(blockNumber);
      return block?.timestamp || null;
    } catch {
      return null;
    }
  }

  getContractConfig(): ContractEventConfig {
    return { ...this.contractConfig };
  }

  async estimateRemainingBlocks(): Promise<number> {
    const cursor = await this.getCursor();
    const lastProcessedBlock = cursor ? parseInt(cursor.value) : this.contractConfig.fromBlock - 1;
    const currentBlock = await this.getCurrentBlock();
    const targetBlock = this.contractConfig.toBlock || (currentBlock - this.contractConfig.confirmations!);
    
    return Math.max(0, targetBlock - lastProcessedBlock);
  }
}