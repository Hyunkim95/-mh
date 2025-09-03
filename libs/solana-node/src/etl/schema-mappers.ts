import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { 
  SolanaTransactionData, 
  SolanaAccountData, 
  ProcessedTransaction, 
  ProcessedAccount,
  SolanaSchemaMapper 
} from './types';
import { PartiallyDecodedInstruction } from '@solana/web3.js';

// Base schema for Solana transactions
export interface BaseSolanaTransactionSchema {
  signature: string;
  blockTime?: Date;
  slot: number;
  fee: number;
  success: boolean;
  programIds: string[];
  accountKeys: string[];
  logMessages?: string[];
  preBalances: number[];
  postBalances: number[];
  processedAt: Date;
}

// Base mapper for transactions
export abstract class BaseSolanaTransactionMapper<T extends BaseSolanaTransactionSchema> 
  implements SolanaSchemaMapper<T> {

  protected mapBaseTransactionFields(txData: SolanaTransactionData): BaseSolanaTransactionSchema {
    return {
      signature: txData.signature,
      blockTime: txData.blockTime ? new Date(txData.blockTime * 1000) : undefined,
      slot: txData.slot,
      fee: txData.fee,
      success: !txData.err,
      programIds: txData.programIds || [],
      accountKeys: txData.accountKeys || [],
      logMessages: txData.transaction?.meta?.logMessages || [],
      preBalances: txData.transaction?.meta?.preBalances || [],
      postBalances: txData.transaction?.meta?.postBalances || [],
      processedAt: new Date(),
    };
  }

  abstract mapTransactionToSchema(txData: SolanaTransactionData): T;
  
  validateMappedData(data: T): boolean {
    return !!(
      data.signature &&
      typeof data.slot === 'number' &&
      typeof data.fee === 'number' &&
      typeof data.success === 'boolean'
    );
  }
}

// Generic transaction mapper
export class GenericSolanaTransactionMapper extends BaseSolanaTransactionMapper<ProcessedTransaction> {
  mapTransactionToSchema(txData: SolanaTransactionData): ProcessedTransaction {
    const baseFields = this.mapBaseTransactionFields(txData);
    
    // Extract instruction details
    const instructions: ProcessedTransaction['instructions'] = [];
    
    if (txData.transaction?.transaction?.message?.instructions) {
      for (const ix of txData.transaction.transaction.message.instructions) {
        instructions.push({
          programId: ix.programId.toString(),
          accounts: (ix as PartiallyDecodedInstruction).accounts?.map(acc => acc.toString()) || [],
          data: 'data' in ix ? ix.data : undefined,
        });
      }
    }

    // Extract token transfers if any
    const tokenTransfers: ProcessedTransaction['tokenTransfers'] = [];
    
    if (txData.transaction?.meta?.preTokenBalances && txData.transaction?.meta?.postTokenBalances) {
      const preBalances = txData.transaction.meta.preTokenBalances;
      const postBalances = txData.transaction.meta.postTokenBalances;
      
      // Simple token transfer detection (this could be more sophisticated)
      for (const postBalance of postBalances) {
        const preBalance = preBalances.find(pre => 
          pre.accountIndex === postBalance.accountIndex && 
          pre.mint === postBalance.mint
        );
        
        if (preBalance && preBalance.uiTokenAmount.amount !== postBalance.uiTokenAmount.amount) {
          const preAmount = BigInt(preBalance.uiTokenAmount.amount);
          const postAmount = BigInt(postBalance.uiTokenAmount.amount);
          const change = postAmount - preAmount;
          
          if (change !== 0n) {
            tokenTransfers.push({
              mint: postBalance.mint,
              amount: change.toString(),
              decimals: postBalance.uiTokenAmount.decimals,
            });
          }
        }
      }
    }

    return {
      ...baseFields,
      instructions,
      tokenTransfers: tokenTransfers.length > 0 ? tokenTransfers : undefined,
      metadata: {
        confirmationStatus: txData.confirmationStatus,
        memo: txData.memo,
      },
    };
  }
}

// SPL Token transfer specific mapper
export interface SPLTokenTransferSchema extends BaseSolanaTransactionSchema {
  fromTokenAccount?: string;
  toTokenAccount?: string;
  fromOwner?: string;
  toOwner?: string;
  mint: string;
  amount: string;
  decimals?: number;
}

export class SPLTokenTransferMapper extends BaseSolanaTransactionMapper<SPLTokenTransferSchema> {
  mapTransactionToSchema(txData: SolanaTransactionData): SPLTokenTransferSchema {
    const baseFields = this.mapBaseTransactionFields(txData);
    
    // Extract token transfer information
    let tokenTransfer: Partial<SPLTokenTransferSchema> = {};
    
    if (txData.transaction?.meta?.preTokenBalances && txData.transaction?.meta?.postTokenBalances) {
      const preBalances = txData.transaction.meta.preTokenBalances;
      const postBalances = txData.transaction.meta.postTokenBalances;
      
      // Find the token transfer
      for (const postBalance of postBalances) {
        const preBalance = preBalances.find(pre => 
          pre.accountIndex === postBalance.accountIndex && 
          pre.mint === postBalance.mint
        );
        
        if (preBalance && preBalance.uiTokenAmount.amount !== postBalance.uiTokenAmount.amount) {
          const preAmount = BigInt(preBalance.uiTokenAmount.amount);
          const postAmount = BigInt(postBalance.uiTokenAmount.amount);
          const change = postAmount - preAmount;
          
          if (change > 0n) {
            // This account received tokens
            tokenTransfer = {
              toTokenAccount: txData.accountKeys?.[postBalance.accountIndex],
              toOwner: postBalance.owner,
              mint: postBalance.mint,
              amount: change.toString(),
              decimals: postBalance.uiTokenAmount.decimals,
            };
          } else if (change < 0n) {
            // This account sent tokens
            tokenTransfer = {
              fromTokenAccount: txData.accountKeys?.[postBalance.accountIndex],
              fromOwner: postBalance.owner,
              mint: postBalance.mint,
              amount: (-change).toString(),
              decimals: postBalance.uiTokenAmount.decimals,
            };
          }
        }
      }
    }

    if (!tokenTransfer.mint) {
      throw new Error('No token transfer found in transaction');
    }

    return {
      ...baseFields,
      ...tokenTransfer,
      mint: tokenTransfer.mint!,
      amount: tokenTransfer.amount!,
    };
  }

  validateMappedData(data: SPLTokenTransferSchema): boolean {
    return (
      super.validateMappedData(data) &&
      !!data.mint &&
      !!data.amount
    );
  }
}

// Base schema for Solana accounts
export interface BaseSolanaAccountSchema {
  address: string;
  lamports: number;
  owner: string;
  executable: boolean;
  rentEpoch?: number;
  space?: number;
  slot?: number;
  lastUpdated: Date;
  processedAt: Date;
}

// Base mapper for accounts
export abstract class BaseSolanaAccountMapper<T extends BaseSolanaAccountSchema> 
  implements SolanaSchemaMapper<T> {

  protected mapBaseAccountFields(accountData: SolanaAccountData): BaseSolanaAccountSchema {
    return {
      address: accountData.address,
      lamports: accountData.lamports,
      owner: accountData.owner,
      executable: accountData.executable,
      slot: accountData.slot,
      lastUpdated: accountData.lastUpdated,
      processedAt: new Date(),
    };
  }

  abstract mapAccountToSchema(accountData: SolanaAccountData): T;
  
  validateMappedData(data: T): boolean {
    return !!(
      data.address &&
      typeof data.lamports === 'number' &&
      data.owner &&
      typeof data.executable === 'boolean'
    );
  }
}

// Generic account mapper
export class GenericSolanaAccountMapper extends BaseSolanaAccountMapper<ProcessedAccount> {
  mapAccountToSchema(accountData: SolanaAccountData): ProcessedAccount {
    const baseFields = this.mapBaseAccountFields(accountData);
    
    let isTokenAccount = false;
    let tokenData: Partial<ProcessedAccount> = {};
    
    // Check if this is a token account
    if (accountData.parsedData && 
        (accountData.owner === TOKEN_PROGRAM_ID.toString() || 
         accountData.owner === TOKEN_2022_PROGRAM_ID.toString())) {
      
      if ('parsed' in accountData.parsedData && 
          accountData.parsedData.parsed.type === 'account') {
        
        const tokenInfo = accountData.parsedData.parsed.info;
        isTokenAccount = true;
        tokenData = {
          isTokenAccount: true,
          mint: tokenInfo.mint,
          tokenAmount: tokenInfo.tokenAmount?.amount,
          tokenDecimals: tokenInfo.tokenAmount?.decimals,
          tokenOwner: tokenInfo.owner,
        };
      }
    }

    // Extract program-specific data
    let programData: Record<string, any> | undefined;
    if (accountData.parsedData && 'parsed' in accountData.parsedData) {
      programData = accountData.parsedData.parsed;
    } else if (accountData.data) {
      programData = {
        rawData: accountData.data.toString('base64'),
      };
    }

    return {
      ...baseFields,
      ...tokenData,
      isTokenAccount,
      rentEpoch: accountData.rentEpoch || 0,
      space: accountData.space || 0,
      programData,
      metadata: {
        dataSize: accountData.space,
        hasData: !!accountData.data || !!accountData.parsedData,
      },
    };
  }
}

// SPL Token account specific mapper
export interface SPLTokenAccountSchema extends BaseSolanaAccountSchema {
  mint: string;
  tokenOwner: string;
  amount: string;
  decimals: number;
  state: 'initialized' | 'uninitialized' | 'frozen';
}

export class SPLTokenAccountMapper extends BaseSolanaAccountMapper<SPLTokenAccountSchema> {
  mapAccountToSchema(accountData: SolanaAccountData): SPLTokenAccountSchema {
    const baseFields = this.mapBaseAccountFields(accountData);
    
    // Validate this is a token account
    if (accountData.owner !== TOKEN_PROGRAM_ID.toString() && 
        accountData.owner !== TOKEN_2022_PROGRAM_ID.toString()) {
      throw new Error('Account is not a token account');
    }

    if (!accountData.parsedData || !('parsed' in accountData.parsedData)) {
      throw new Error('Token account data not parsed');
    }

    const tokenInfo = accountData.parsedData.parsed.info;
    
    if (!tokenInfo.mint || !tokenInfo.owner || !tokenInfo.tokenAmount) {
      throw new Error('Invalid token account data');
    }

    return {
      ...baseFields,
      mint: tokenInfo.mint,
      tokenOwner: tokenInfo.owner,
      amount: tokenInfo.tokenAmount.amount,
      decimals: tokenInfo.tokenAmount.decimals,
      state: tokenInfo.state || 'initialized',
    };
  }

  validateMappedData(data: SPLTokenAccountSchema): boolean {
    return (
      super.validateMappedData(data) &&
      !!data.mint &&
      !!data.tokenOwner &&
      typeof data.amount === 'string' &&
      typeof data.decimals === 'number'
    );
  }
}

// Custom mapper factory
export function createCustomSolanaMapper<T extends BaseSolanaTransactionSchema | BaseSolanaAccountSchema>(
  type: 'transaction' | 'account',
  mapperFunction: (data: SolanaTransactionData | SolanaAccountData, baseFields: any) => Omit<T, keyof BaseSolanaTransactionSchema | keyof BaseSolanaAccountSchema>,
  validator?: (data: T) => boolean
): SolanaSchemaMapper<T> {
  
  if (type === 'transaction') {
    return new (class extends BaseSolanaTransactionMapper<any> {
      mapTransactionToSchema(txData: SolanaTransactionData): T {
        const baseFields = this.mapBaseTransactionFields(txData);
        const customFields = mapperFunction(txData, baseFields);
        return { ...baseFields, ...customFields } as T;
      }

      validateMappedData(data: T): boolean {
        const baseValid = super.validateMappedData(data);
        return validator ? baseValid && validator(data) : baseValid;
      }
    })();
  } else {
    return new (class extends BaseSolanaAccountMapper<any> {
      mapAccountToSchema(accountData: SolanaAccountData): T {
        const baseFields = this.mapBaseAccountFields(accountData);
        const customFields = mapperFunction(accountData, baseFields);
        return { ...baseFields, ...customFields } as T;
      }

      validateMappedData(data: T): boolean {
        const baseValid = super.validateMappedData(data);
        return validator ? baseValid && validator(data) : baseValid;
      }
    })();
  }
}