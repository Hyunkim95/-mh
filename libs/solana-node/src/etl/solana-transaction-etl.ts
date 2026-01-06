import { 
  Connection, 
  PublicKey, 
  ConfirmedSignatureInfo,
  GetVersionedTransactionConfig,
  Finality
} from '@solana/web3.js';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql, inArray } from 'drizzle-orm';
import { BaseEtlJob, ExtractResult, TransformResult, LoadResult, EtlJobConfig } from '@libs/etl';
import { uniqBy } from 'lodash';
import { 
  SolanaTransactionETLConfig,
  SolanaTransactionData,
  SignatureCursor,
  IndexingDirection,
  SolanaSchemaMapper
} from './types';

// Type constraint to ensure TSchema has a signature property
interface SchemaWithSignature {
  signature: string;
  [key: string]: any;
}

export class SolanaTransactionEtlJob<TSchema extends SchemaWithSignature = any> extends BaseEtlJob<SolanaTransactionData, TSchema> {
  private connection: Connection;
  private solanaConfig: SolanaTransactionETLConfig;
  private schemaMapper: SolanaSchemaMapper<TSchema>;
  private targetTable: any; // Drizzle table reference
  private recentCursors: string[] = []; // Track recent cursors to detect loops
  private maxCursorHistory = 5; // Keep track of last 5 cursors
  private indexedTransactions: Map<string, boolean> = new Map(); // Track processed transactions in memory

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
      maxSignatures: 50, // Reduced from 1000 to be more conservative
      delayMs: 500, // Increased from 100ms to 500ms for better rate limiting
      ...solanaConfig,
    };
    
    this.connection = new Connection(
      solanaConfig.rpcUrl,
      { 
        commitment: this.solanaConfig.commitment,
        httpHeaders: {
          'Content-Type': 'application/json',
        },
        // Add fetch options for better error handling
        fetch: async (url, options) => {
          const response = await fetch(url, options);
          
          // Handle rate limiting with exponential backoff
          if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after');
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(1000 * Math.pow(2, Math.random() * 3), 10000);
            
            console.log(`Server responded with 429 Too Many Requests. Retrying after ${delay}ms delay...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Retry the request
            return fetch(url, options);
          }
          
          return response;
        }
      }
    );
    
    this.schemaMapper = schemaMapper;
    this.targetTable = targetTable;
  }

  protected async extract(cursor?: string): Promise<ExtractResult<SolanaTransactionData>> {
    try {
      // Parse cursor to get signature and direction info
      const cursorInfo = this.parseCursor(cursor);
      
      const address = this.solanaConfig.programId || this.solanaConfig.accountAddress;
      
      if (!address) {
        throw new Error('Either programId or accountAddress must be provided');
      }

      const publicKey = new PublicKey(address);
      
      // Add rate limiting delay
      if (this.solanaConfig.delayMs! > 0) {
        await this.delay(this.solanaConfig.delayMs!);
      }

      // Get recent and historical transactions with proper cursor management
      const recentTransactions = await this.getRecentTransactions(publicKey, cursorInfo?.signature);
      const historicalTransactions = await this.getHistoricalTransactions(publicKey, cursorInfo?.signature);
      
      // Deduplicate transactions using lodash uniqBy
      const combinedTransactions = uniqBy(
        [...recentTransactions, ...historicalTransactions],
        'signature'
      );

      console.log(`Found ${combinedTransactions.length} unique transactions (${recentTransactions.length} recent, ${historicalTransactions.length} historical)`);

      if (combinedTransactions.length === 0) {
        console.log(`No signatures found for ${this.solanaConfig.direction} direction (cursor: ${cursor ? 'exists' : 'none'})`);
        return {
          data: [],
          nextCursor: cursor,
          hasMore: false,
          metadata: {
            direction: this.solanaConfig.direction,
            reason: 'No more signatures available',
            cursorUsed: !!cursor,
          },
        };
      }

      // Filter out already processed transactions using cursor metadata
      const unprocessedTransactions = await this.filterProcessedTransactions(combinedTransactions);

      console.log(`Processing ${unprocessedTransactions.length} unprocessed transactions (${combinedTransactions.length - unprocessedTransactions.length} already processed)`);

      if (unprocessedTransactions.length === 0) {
        return {
          data: [],
          nextCursor: cursor,
          hasMore: false,
          metadata: {
            direction: this.solanaConfig.direction,
            reason: 'All transactions already processed',
            cursorUsed: !!cursor,
          },
        };
      }

      // Fetch full transaction details for each signature
      const transactionData = await this.fetchTransactionDetails(unprocessedTransactions);

      // Determine next cursor
      const nextCursor = this.createCursor(
        unprocessedTransactions[unprocessedTransactions.length - 1],
        this.solanaConfig.direction
      );

      // Detect cursor loops to prevent infinite processing
      if (this.recentCursors.includes(nextCursor)) {
        console.warn(`Cursor loop detected! Cursor ${nextCursor.substring(0, 50)}... has been seen before. Stopping ETL.`);
        return {
          data: transactionData,
          nextCursor,
          hasMore: false, // Force stop to prevent infinite loop
          metadata: {
            direction: this.solanaConfig.direction,
            fetchedSignatures: unprocessedTransactions.length,
            successfulTransactions: transactionData.length,
            failedTransactions: unprocessedTransactions.length - transactionData.length,
            oldestSlot: unprocessedTransactions.length > 0 ? Math.min(...unprocessedTransactions.map(s => s.slot)) : 0,
            newestSlot: unprocessedTransactions.length > 0 ? Math.max(...unprocessedTransactions.map(s => s.slot)) : 0,
            reason: 'Cursor loop detected - preventing infinite processing',
          },
        };
      }

      // Update cursor history
      this.recentCursors.push(nextCursor);
      if (this.recentCursors.length > this.maxCursorHistory) {
        this.recentCursors.shift(); // Remove oldest cursor
      }

      // Improved hasMore logic to prevent infinite loops
      let hasMore = false;
      
      if (unprocessedTransactions.length > 0) {
        // We have more data if:
        // 1. We got a full batch (might be more available)
        // 2. AND the cursor is different from the previous one (we're making progress)
        const gotFullBatch = unprocessedTransactions.length >= this.solanaConfig.maxSignatures!;
        const cursorChanged = cursor !== nextCursor;
        
        hasMore = gotFullBatch && cursorChanged;
        
        // Additional check: if we got fewer than expected, likely no more data
        if (unprocessedTransactions.length < Math.min(10, this.solanaConfig.maxSignatures! / 5)) {
          hasMore = false; // Very few results suggest we're at the end
        }
      }

      return {
        data: transactionData,
        nextCursor,
        hasMore,
        metadata: {
          direction: this.solanaConfig.direction,
          fetchedSignatures: unprocessedTransactions.length,
          successfulTransactions: transactionData.length,
          failedTransactions: unprocessedTransactions.length - transactionData.length,
          oldestSlot: unprocessedTransactions.length > 0 ? Math.min(...unprocessedTransactions.map(s => s.slot)) : 0,
          newestSlot: unprocessedTransactions.length > 0 ? Math.max(...unprocessedTransactions.map(s => s.slot)) : 0,
          cursorChanged: cursor !== nextCursor,
          gotFullBatch: unprocessedTransactions.length >= this.solanaConfig.maxSignatures!,
        },
      };
    } catch (error) {
      throw new Error(`Failed to extract Solana transactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // New method: Filter out already processed transactions using database and cursor metadata
  private async filterProcessedTransactions(transactions: ConfirmedSignatureInfo[]): Promise<ConfirmedSignatureInfo[]> {
    try {
      if (transactions.length === 0) return transactions;

      const processedSignatures = new Set<string>();

      // First check cursor metadata for recently processed signatures
      const currentCursor = await this.getCursor();
      if (currentCursor?.metadata?.processedSignatures) {
        const signatures = currentCursor.metadata.processedSignatures as string[];
        signatures.forEach(sig => processedSignatures.add(sig));
      }

      // Query database for processed signatures in this batch
      const signaturesToCheck = transactions.map(tx => tx.signature);
      const existingSignatures = await this.db
        .select({ signature: this.targetTable.signature })
        .from(this.targetTable)
        .where(inArray(this.targetTable.signature, signaturesToCheck));

      // Add database results to processed set
      existingSignatures.forEach(row => {
        processedSignatures.add(row.signature);
      });

      // Filter out already processed transactions
      const unprocessed = transactions.filter(tx => !processedSignatures.has(tx.signature));
      
      console.log(`Filtered out ${processedSignatures.size} already processed signatures from batch of ${transactions.length}`);

      // Update in-memory cache
      transactions.forEach(tx => {
        this.indexedTransactions.set(tx.signature, true);
      });

      return unprocessed;
    } catch (error) {
      console.warn('Failed to filter processed transactions, processing all:', error);
      return transactions;
    }
  }

  // New method: Get recent transactions with optimized cursor management
  private async getRecentTransactions(publicKey: PublicKey, untilSignature?: string): Promise<ConfirmedSignatureInfo[]> {
    // Get processed signature boundaries to optimize RPC calls
    const boundaries = await this.getProcessedSignatureBoundaries();
    
    // Use the newest processed signature as the 'until' boundary to avoid re-fetching
    const until = untilSignature || boundaries.newestProcessed;

    if (until && this.indexedTransactions.has(until)) {
      console.log('Last transaction already indexed, skipping RPC call');
      return [];
    }

    console.log(`Fetching recent transactions until: ${until ? until.substring(0, 8) + '...' : 'none'}`);

    try {
      const signatures = await this.connection.getSignaturesForAddress(
        publicKey,
        {
          limit: this.solanaConfig.maxSignatures,
          until: until,
        }
      );

      // Pre-filter signatures against recent processed ones to reduce subsequent processing
      const filteredSignatures = signatures.filter(sig => !boundaries.recentProcessedSignatures.has(sig.signature));
      
      console.log(`Fetched ${signatures.length} signatures, ${filteredSignatures.length} are potentially new`);

      if (until) {
        this.indexedTransactions.set(until, true);
      }

      return filteredSignatures;
    } catch (error) {
      console.error('Error fetching recent transactions:', error);
      return [];
    }
  }

  // New method: Get historical transactions with optimized cursor management
  private async getHistoricalTransactions(publicKey: PublicKey, beforeSignature?: string): Promise<ConfirmedSignatureInfo[]> {
    // Get processed signature boundaries to optimize RPC calls
    const boundaries = await this.getProcessedSignatureBoundaries();
    
    // Use the oldest processed signature as the 'before' boundary to avoid re-fetching processed history
    const before = beforeSignature || boundaries.oldestProcessed;
    
    if (!before) {
      console.log('No historical boundary found, fetching from beginning');
      // If no processed signatures exist, we can fetch some historical data
      try {
        const signatures = await this.connection.getSignaturesForAddress(
          publicKey,
          {
            limit: this.solanaConfig.maxSignatures,
          }
        );
        return signatures.filter(sig => !boundaries.recentProcessedSignatures.has(sig.signature));
      } catch (error) {
        console.error('Error fetching initial historical transactions:', error);
        return [];
      }
    }

    if (this.indexedTransactions.has(before)) {
      console.log('Historical boundary already indexed, skipping RPC call');
      return [];
    }

    console.log(`Fetching historical transactions before: ${before.substring(0, 8)}...`);

    try {
      const signatures = await this.connection.getSignaturesForAddress(
        publicKey,
        {
          limit: this.solanaConfig.maxSignatures,
          before: before,
        }
      );

      // Pre-filter signatures against recent processed ones
      const filteredSignatures = signatures.filter(sig => !boundaries.recentProcessedSignatures.has(sig.signature));
      
      console.log(`Fetched ${signatures.length} historical signatures, ${filteredSignatures.length} are potentially new`);

      if (before) {
        this.indexedTransactions.set(before, true);
      }

      return filteredSignatures;
    } catch (error) {
      console.error('Error fetching historical transactions:', error);
      return [];
    }
  }


  // New method: Get processed signature boundaries to optimize RPC calls
  private async getProcessedSignatureBoundaries(): Promise<{
    newestProcessed?: string;
    oldestProcessed?: string;
    recentProcessedSignatures: Set<string>;
  }> {
    try {
      const results = await Promise.all([
        // Get newest processed signature
        this.db
          .select({ signature: this.targetTable.signature })
          .from(this.targetTable)
          .orderBy(sql`${this.targetTable.slot} DESC`)
          .limit(1),
        
        // Get oldest processed signature
        this.db
          .select({ signature: this.targetTable.signature })
          .from(this.targetTable)
          .orderBy(sql`${this.targetTable.slot} ASC`)
          .limit(1),
        
        // Get recent 100 processed signatures for immediate filtering
        this.db
          .select({ signature: this.targetTable.signature })
          .from(this.targetTable)
          .orderBy(sql`${this.targetTable.slot} DESC`)
          .limit(100)
      ]);

      const [newestResult, oldestResult, recentResults] = results;
      const recentProcessedSignatures = new Set(recentResults.map(r => r.signature));

      return {
        newestProcessed: newestResult[0]?.signature,
        oldestProcessed: oldestResult[0]?.signature,
        recentProcessedSignatures,
      };
    } catch (error) {
      console.warn('Failed to get processed signature boundaries:', error);
      return { recentProcessedSignatures: new Set() };
    }
  }

  // New method: Fetch transaction details with better error handling
  private async fetchTransactionDetails(signatures: ConfirmedSignatureInfo[]): Promise<SolanaTransactionData[]> {
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

    return transactionData;
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

    // Deduplicate by signature before processing using lodash
    const uniqueData = uniqBy(data, 'signature');
    
    console.log(`Processing ${uniqueData.length} unique transactions (${data.length - uniqueData.length} duplicates removed)`);

    let processedCount = 0;
    const errors: Array<{ data: TSchema; error: Error; index: number }> = [];

    try {
      // Insert data in batches
      const batchSize = 100;
      
      for (let i = 0; i < uniqueData.length; i += batchSize) {
        const batch = uniqueData.slice(i, i + batchSize);
        
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
          
          // Mark transactions as processed in memory
          batch.forEach((tx: TSchema) => {
            this.indexedTransactions.set(tx.signature, true);
          });
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
              
              // Mark transaction as processed in memory
              this.indexedTransactions.set(item.signature, true);
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

      // Update cursor with processed signatures
      await this.updateCursorWithProcessedSignatures(uniqueData.map((tx: TSchema) => tx.signature));

      return {
        success: errors.length === 0,
        processedCount,
        errors: errors.length > 0 ? errors : undefined,
        metadata: {
          totalRecords: uniqueData.length,
          successCount: processedCount,
          errorCount: errors.length,
          tableName: this.targetTable._.name,
        },
      };
    } catch (error) {
      throw new Error(`Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Enhanced method: Update cursor with processed signatures and boundaries
  private async updateCursorWithProcessedSignatures(signatures: string[]): Promise<void> {
    try {
      if (signatures.length === 0) return;

      const currentCursor = await this.getCursor();
      const existingSignatures = new Set<string>();
      
      if (currentCursor?.metadata?.processedSignatures) {
        const existing = currentCursor.metadata.processedSignatures as string[];
        existing.forEach(sig => existingSignatures.add(sig));
      }

      // Add new signatures to the set
      signatures.forEach(sig => existingSignatures.add(sig));

      // Keep only the last 500 signatures to prevent cursor from growing too large
      // (reduced from 1000 since we now also query database for filtering)
      const processedSignatures = Array.from(existingSignatures).slice(-500);
      const lastProcessedSignature = signatures[signatures.length - 1];
      const firstProcessedSignature = signatures[0];

      // Get current boundaries from database for better cursor state
      const boundaries = await this.getProcessedSignatureBoundaries();

      // Get current slot for metadata
      let lastIndexedSlot = 0;
      try {
        lastIndexedSlot = await this.connection.getSlot();
      } catch (error) {
        console.warn('Failed to get current slot for cursor metadata:', error);
      }

      // Update cursor with enhanced metadata including boundaries
      await this.cursorManager.updateCursor(
        this.config.jobName,
        JSON.stringify({
          signature: lastProcessedSignature,
          direction: this.solanaConfig.direction,
          metadata: {
            programId: this.solanaConfig.programId,
            accountAddress: this.solanaConfig.accountAddress,
            lastIndexedSlot,
            processedSignatures,
            lastProcessedSignature,
            firstProcessedSignature,
            // Add boundary information for more efficient RPC calls
            newestBoundary: boundaries.newestProcessed,
            oldestBoundary: boundaries.oldestProcessed,
            lastBatchSize: signatures.length,
            lastUpdated: new Date().toISOString(),
          },
        }),
        {
          processedSignatures,
          lastProcessedSignature,
          firstProcessedSignature,
          totalProcessed: processedSignatures.length,
          boundaries: {
            newest: boundaries.newestProcessed,
            oldest: boundaries.oldestProcessed,
          },
        }
      );

      console.log(`Updated cursor with ${signatures.length} new signatures, boundaries: newest=${boundaries.newestProcessed?.substring(0, 8)}..., oldest=${boundaries.oldestProcessed?.substring(0, 8)}...`);
    } catch (error) {
      console.warn('Failed to update cursor with processed signatures:', error);
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