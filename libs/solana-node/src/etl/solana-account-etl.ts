import { 
  Connection, 
  PublicKey,
  ParsedAccountData
} from '@solana/web3.js';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { BaseEtlJob, ExtractResult, TransformResult, LoadResult, EtlJobConfig } from '@libs/etl';
import { 
  SolanaAccountETLConfig,
  SolanaAccountData,
  SolanaSchemaMapper
} from './types';

export class SolanaAccountEtlJob<TSchema = any> extends BaseEtlJob<SolanaAccountData, TSchema> {
  private connection: Connection;
  private solanaConfig: SolanaAccountETLConfig;
  private schemaMapper: SolanaSchemaMapper<TSchema>;
  private targetTable: any; // Drizzle table reference

  constructor(
    etlConfig: EtlJobConfig,
    db: NodePgDatabase<any>,
    solanaConfig: SolanaAccountETLConfig,
    targetTable: any,
    schemaMapper: SolanaSchemaMapper<TSchema>
  ) {
    super(etlConfig, db);
    
    this.solanaConfig = {
      commitment: 'confirmed',
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

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected async extract(): Promise<ExtractResult<SolanaAccountData>> {
    try {
      let accountData: SolanaAccountData[] = [];
      
      // Add rate limiting delay
      if (this.solanaConfig.delayMs! > 0) {
        await this.wait(this.solanaConfig.delayMs!);
      }

      if (this.solanaConfig.programId) {
        // Get all accounts owned by a program
        accountData = await this.extractProgramAccounts();
      } else if (this.solanaConfig.accountAddress) {
        // Get specific account data
        accountData = await this.extractSpecificAccount();
      } else {
        throw new Error('Either programId or accountAddress must be provided');
      }

      return {
        data: accountData,
        nextCursor: undefined, // Accounts are typically fetched in one go
        hasMore: false,
        metadata: {
          totalAccounts: accountData.length,
          programId: this.solanaConfig.programId,
          accountAddress: this.solanaConfig.accountAddress,
        },
      };
    } catch (error) {
      throw new Error(`Failed to extract Solana accounts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractProgramAccounts(): Promise<SolanaAccountData[]> {
    const programId = new PublicKey(this.solanaConfig.programId!);
    const accounts: SolanaAccountData[] = [];

    console.log(`Fetching accounts for program: ${programId.toString()}`);

    // Get all program accounts
    const programAccounts = await this.connection.getParsedProgramAccounts(
      programId,
      {
        commitment: this.solanaConfig.commitment,
      }
    );

    const currentSlot = await this.connection.getSlot();

    for (const accountInfo of programAccounts) {
      try {
        const account = accountInfo.account;
        const accountData: SolanaAccountData = {
          address: accountInfo.pubkey.toString(),
          lamports: account.lamports,
          owner: account.owner.toString(),
          executable: account.executable,
          rentEpoch: account.rentEpoch,
          slot: currentSlot,
          lastUpdated: new Date(),
        };

        // Handle parsed data if available
        if (account.data && typeof account.data === 'object' && 'parsed' in account.data) {
          accountData.parsedData = account.data as ParsedAccountData;
        } else if (account.data) {
          // Handle raw data
          if (Array.isArray(account.data)) {
            accountData.data = Buffer.from(account.data);
          } else if (typeof account.data === 'string') {
            accountData.data = account.data;
          }
        }

        accounts.push(accountData);
      } catch (error) {
        console.warn(`Failed to process account ${accountInfo.pubkey.toString()}:`, error);
      }
    }

    return accounts;
  }

  private async extractSpecificAccount(): Promise<SolanaAccountData[]> {
    const accountPubkey = new PublicKey(this.solanaConfig.accountAddress!);
    
    console.log(`Fetching account: ${accountPubkey.toString()}`);

    const accountInfo = await this.connection.getParsedAccountInfo(
      accountPubkey,
      this.solanaConfig.commitment
    );

    if (!accountInfo.value) {
      console.log(`Account ${accountPubkey.toString()} not found`);
      return [];
    }

    const account = accountInfo.value;
    const currentSlot = await this.connection.getSlot();

    const accountData: SolanaAccountData = {
      address: accountPubkey.toString(),
      lamports: account.lamports,
      owner: account.owner.toString(),
      executable: account.executable,
      rentEpoch: account.rentEpoch,
      slot: currentSlot,
      lastUpdated: new Date(),
    };

    // Handle parsed data if available
    if (account.data && typeof account.data === 'object' && 'parsed' in account.data) {
      accountData.parsedData = account.data as ParsedAccountData;
    } else if (account.data) {
      // Handle raw data
      if (Array.isArray(account.data)) {
        accountData.data = Buffer.from(account.data);
      } else if (typeof account.data === 'string') {
        accountData.data = account.data;
      }
    }

    return [accountData];
  }

  protected async transform(data: SolanaAccountData[]): Promise<TransformResult<TSchema>> {
    const transformed: TSchema[] = [];
    const errors: Array<{ originalData: SolanaAccountData; error: Error; index: number }> = [];

    for (let i = 0; i < data.length; i++) {
      const accountData = data[i];

      try {
        // Use schema mapper to transform the account
        const mappedData = this.schemaMapper.mapAccountToSchema!(accountData);
        
        // Validate the mapped data
        if (!this.schemaMapper.validateMappedData(mappedData)) {
          throw new Error('Schema validation failed');
        }

        transformed.push(mappedData);
      } catch (error) {
        errors.push({
          originalData: accountData,
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
        programId: this.solanaConfig.programId,
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
          // Use upsert to handle account updates
          await this.db
            .insert(this.targetTable)
            .values(batch)
            .onConflictDoUpdate({
              target: this.targetTable.address,
              set: {
                // Update all relevant fields since accounts can change
                lamports: this.targetTable.lamports,
                owner: this.targetTable.owner,
                executable: this.targetTable.executable,
                rentEpoch: this.targetTable.rentEpoch,
                space: this.targetTable.space,
                slot: this.targetTable.slot,
                lastUpdated: new Date(),
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
                  target: this.targetTable.address,
                  set: {
                    lamports: this.targetTable.lamports,
                    owner: this.targetTable.owner,
                    executable: this.targetTable.executable,
                    rentEpoch: this.targetTable.rentEpoch,
                    space: this.targetTable.space,
                    slot: this.targetTable.slot,
                    lastUpdated: new Date(),
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
  // Override lifecycle methods
  protected async beforeJob(): Promise<void> {
    console.log(`Starting Solana account ETL: ${this.config.jobName}`);
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
    console.log(`Solana account ETL completed: ${this.config.jobName}`);
    console.log(`Success: ${result.success}`);
    console.log(`Accounts processed: ${result.totalLoaded}`);
    console.log(`Duration: ${result.duration}ms`);
    
    if (result.errors.length > 0) {
      console.log(`Errors encountered: ${result.errors.length}`);
    }
  }

  protected async onError(error: Error, stage: 'extract' | 'transform' | 'load'): Promise<void> {
    console.error(`Solana account ETL error in ${stage}:`, error.message);
    
    if (stage === 'extract') {
      console.error('Consider increasing delayMs to avoid rate limiting');
    }
  }

  // Public utility methods
  async getCurrentSlot(): Promise<number> {
    return this.connection.getSlot();
  }

  getSolanaConfig(): SolanaAccountETLConfig {
    return { ...this.solanaConfig };
  }
}