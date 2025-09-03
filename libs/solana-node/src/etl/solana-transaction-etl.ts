import { 
  Connection, 
  PublicKey, 
  ConfirmedSignatureInfo,
  GetVersionedTransactionConfig,
  Finality
} from '@solana/web3.js';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { BaseEtlJob, ExtractResult, TransformResult, LoadResult, EtlJobConfig } from '@libs/etl';
import { 
  SolanaTransactionETLConfig,
  SolanaTransactionData,
  SignatureCursor,
  IndexingDirection,
  SolanaSchemaMapper
} from './types';

export class SolanaTransactionEtlJob<TSchema = any> extends BaseEtlJob<SolanaTransactionData, TSchema> {
  private connection: Connection;
  private solanaConfig: SolanaTransactionETLConfig;
  private schemaMapper: SolanaSchemaMapper<TSchema>;
  private targetTable: any; // Drizzle table reference

  constructor(
    etlConfig: EtlJobConfig,
    db: NodePgDatabase<any>,
    solanaConfig: SolanaTransactionETLConfig,
    targetTable: any,
    schemaMapper: SolanaSchemaMapper<TSchema>
  ) {
    super(etlConfig, db);
    
    this.solanaConfig = {
      commitment: 'confirmed',
      maxSignatures: 1000,
      delayMs: 100,
      ...solanaConfig,
    };
    
    this.connection = new Connection(
      solanaConfig.rpcUrl,
      { commitment: this.solanaConfig.commitment }
    );
    
    this.schemaMapper = schemaMapper;
    this.targetTable = targetTable;
  }

  protected async extract(cursor?: string): Promise<ExtractResult<SolanaTransactionData>> {
    try {
      // Parse cursor to get signature and direction info
      const cursorInfo = this.parseCursor(cursor);
      
      let signatures: ConfirmedSignatureInfo[] = [];
      const address = this.solanaConfig.programId || this.solanaConfig.accountAddress;
      
      if (!address) {
        throw new Error('Either programId or accountAddress must be provided');
      }

      const publicKey = new PublicKey(address);
      
      // Add rate limiting delay
      if (this.solanaConfig.delayMs! > 0) {
        await this.delay(this.solanaConfig.delayMs!);
      }

      if (this.solanaConfig.direction === 'forward') {
        // Forward indexing: from most recent signatures to latest
        signatures = await this.connection.getSignaturesForAddress(
          publicKey,
          {
            limit: this.solanaConfig.maxSignatures,
            before: cursorInfo?.signature, // Get signatures before this one (going forward in time)
            until: this.solanaConfig.untilSignature,
          }
        );
      } else {
        // Backward indexing: from oldest indexed signature to oldest available
        signatures = await this.connection.getSignaturesForAddress(
          publicKey,
          {
            limit: this.solanaConfig.maxSignatures,
            before: this.solanaConfig.beforeSignature,
            until: cursorInfo?.signature, // Get signatures until this one (going backward in time)
          }
        );
        
        // Reverse for backward indexing to process oldest first
        signatures.reverse();
      }

      if (signatures.length === 0) {
        return {
          data: [],
          nextCursor: cursor,
          hasMore: false,
          metadata: {
            direction: this.solanaConfig.direction,
            reason: 'No more signatures available',
          },
        };
      }

      console.log(`Fetching ${signatures.length} transactions (${this.solanaConfig.direction})`);

      // Fetch full transaction details for each signature
      const transactionPromises = signatures.map(async (sigInfo): Promise<SolanaTransactionData | null> => {
        try {
          const config: GetVersionedTransactionConfig = {
            commitment: this.solanaConfig.commitment as Finality,
            maxSupportedTransactionVersion: 0,
          };

          const transaction = await this.connection.getParsedTransaction(
            sigInfo.signature,
            config
          );

          // Extract program IDs and account keys
          const programIds: string[] = [];
          const accountKeys: string[] = [];

          if (transaction?.transaction) {
            transaction.transaction.message.accountKeys.forEach(key => {
              accountKeys.push(key.pubkey.toString());
            });

            transaction.transaction.message.instructions.forEach(ix => {
              const programId = ix.programId.toString();
              if (!programIds.includes(programId)) {
                programIds.push(programId);
              }
            });
          }

          return {
            signature: sigInfo.signature,
            blockTime: sigInfo.blockTime,
            slot: sigInfo.slot,
            err: sigInfo.err,
            memo: sigInfo.memo,
            fee: transaction?.meta?.fee || 0,
            transaction,
            confirmationStatus: sigInfo.confirmationStatus,
            programIds,
            accountKeys,
          };
        } catch (error) {
          console.warn(`Failed to fetch transaction ${sigInfo.signature}:`, error);
          return null;
        }
      });

      // Execute transaction fetches with some concurrency control
      const batchSize = 10;
      const transactionData: SolanaTransactionData[] = [];
      
      for (let i = 0; i < transactionPromises.length; i += batchSize) {
        const batch = transactionPromises.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch);
        
        batchResults.forEach(result => {
          if (result) {
            transactionData.push(result);
          }
        });

        // Rate limiting between batches
        if (i + batchSize < transactionPromises.length) {
          await this.delay(this.solanaConfig.delayMs!);
        }
      }

      // Determine next cursor
      const nextCursor = this.createCursor(
        signatures[signatures.length - 1],
        this.solanaConfig.direction
      );

      // For forward indexing, we have more if we got a full batch
      // For backward indexing, we have more if there are potentially older signatures
      const hasMore = signatures.length >= this.solanaConfig.maxSignatures!;

      return {
        data: transactionData,
        nextCursor,
        hasMore,
        metadata: {
          direction: this.solanaConfig.direction,
          fetchedSignatures: signatures.length,
          successfulTransactions: transactionData.length,
          failedTransactions: signatures.length - transactionData.length,
          oldestSlot: Math.min(...signatures.map(s => s.slot)),
          newestSlot: Math.max(...signatures.map(s => s.slot)),
        },
      };
    } catch (error) {
      throw new Error(`Failed to extract Solana transactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  protected async transform(data: SolanaTransactionData[]): Promise<TransformResult<TSchema>> {
    const transformed: TSchema[] = [];
    const errors: Array<{ originalData: SolanaTransactionData; error: Error; index: number }> = [];

    for (let i = 0; i < data.length; i++) {
      const txData = data[i];

      try {
        // Use schema mapper to transform the transaction
        const mappedData = this.schemaMapper.mapTransactionToSchema!(txData);
        
        // Validate the mapped data
        if (!this.schemaMapper.validateMappedData(mappedData)) {
          throw new Error('Schema validation failed');
        }

        transformed.push(mappedData);
      } catch (error) {
        errors.push({
          originalData: txData,
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
        direction: this.solanaConfig.direction,
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
      // Insert data in batches
      const batchSize = 100;
      
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        
        try {
          // Use upsert to handle potential duplicates based on signature
          await this.db
            .insert(this.targetTable)
            .values(batch as any[])
            .onConflictDoUpdate({
              target: this.targetTable.signature,
              set: {
                // Update processedAt timestamp
                processedAt: new Date(),
              },
            });

          processedCount += batch.length;
        } catch (batchError) {
          // If batch insert fails, try individual inserts
          for (let j = 0; j < batch.length; j++) {
            const item = batch[j];
            try {
              await this.db
                .insert(this.targetTable)
                .values(item as any)
                .onConflictDoUpdate({
                  target: this.targetTable.signature,
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

  // Utility methods specific to Solana ETL

  private parseCursor(cursor?: string): SignatureCursor | null {
    if (!cursor) return null;

    try {
      return JSON.parse(cursor) as SignatureCursor;
    } catch {
      // Legacy cursor format - just a signature string
      return {
        signature: cursor,
        direction: this.solanaConfig.direction,
      };
    }
  }

  private createCursor(sigInfo: ConfirmedSignatureInfo, direction: IndexingDirection): string {
    const cursorData: SignatureCursor = {
      signature: sigInfo.signature,
      blockTime: sigInfo.blockTime || undefined,
      slot: sigInfo.slot,
      direction,
      metadata: {
        programId: this.solanaConfig.programId,
        accountAddress: this.solanaConfig.accountAddress,
        lastIndexedSlot: sigInfo.slot,
      },
    };

    return JSON.stringify(cursorData);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Override lifecycle methods
  protected async beforeJob(): Promise<void> {
    console.log(`Starting Solana transaction ETL: ${this.config.jobName}`);
    console.log(`Direction: ${this.solanaConfig.direction}`);
    console.log(`Program/Account: ${this.solanaConfig.programId || this.solanaConfig.accountAddress}`);
    console.log(`RPC: ${this.solanaConfig.rpcUrl}`);
    console.log(`Commitment: ${this.solanaConfig.commitment}`);
    
    // Test RPC connection
    try {
      const slot = await this.connection.getSlot();
      console.log(`Connected to Solana RPC, current slot: ${slot}`);
    } catch (error) {
      throw new Error(`Failed to connect to Solana RPC: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  protected async afterJob(result: any): Promise<void> {
    console.log(`Solana transaction ETL completed: ${this.config.jobName}`);
    console.log(`Success: ${result.success}`);
    console.log(`Transactions processed: ${result.totalLoaded}`);
    console.log(`Duration: ${result.duration}ms`);
    
    if (result.errors.length > 0) {
      console.log(`Errors encountered: ${result.errors.length}`);
    }
  }

  protected async onError(error: Error, stage: 'extract' | 'transform' | 'load'): Promise<void> {
    console.error(`Solana ETL error in ${stage}:`, error.message);
    
    if (stage === 'extract') {
      console.error('Consider reducing maxSignatures or increasing delayMs to avoid rate limiting');
    }
  }

  // Public utility methods
  async getCurrentSlot(): Promise<number> {
    return this.connection.getSlot();
  }

  getDirection(): IndexingDirection {
    return this.solanaConfig.direction;
  }

  getSolanaConfig(): SolanaTransactionETLConfig {
    return { ...this.solanaConfig };
  }
}