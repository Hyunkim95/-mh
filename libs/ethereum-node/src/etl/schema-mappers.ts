import { EventLogData, EventSchemaMapper } from './types';

// Generic base schema that most contract events will have
export interface BaseContractEventSchema {
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  contractAddress: string;
  eventName: string;
  timestamp?: Date;
  processedAt: Date;
}

// Base mapper for common event fields
export abstract class BaseEventSchemaMapper<T extends BaseContractEventSchema> 
  implements EventSchemaMapper<T> {
  
  protected mapBaseFields(eventLog: EventLogData): Partial<BaseContractEventSchema> {
    return {
      blockNumber: eventLog.blockNumber,
      blockHash: eventLog.blockHash,
      transactionHash: eventLog.transactionHash,
      transactionIndex: eventLog.transactionIndex,
      logIndex: eventLog.logIndex,
      contractAddress: eventLog.address,
      eventName: eventLog.eventName,
      timestamp: eventLog.timestamp ? new Date(eventLog.timestamp * 1000) : undefined,
      processedAt: new Date(),
    };
  }

  abstract mapEventToSchema(eventLog: EventLogData): T;
  
  validateMappedData(data: T): boolean {
    return !!(
      data.blockNumber &&
      data.blockHash &&
      data.transactionHash &&
      typeof data.logIndex === 'number' &&
      data.contractAddress &&
      data.eventName
    );
  }
}

// Example: ERC20 Transfer event mapper
export interface ERC20TransferSchema extends BaseContractEventSchema {
  fromAddress: string;
  toAddress: string;
  value: string; // Store as string to avoid precision issues
  tokenAddress: string;
}

export class ERC20TransferMapper extends BaseEventSchemaMapper<ERC20TransferSchema> {
  mapEventToSchema(eventLog: EventLogData): ERC20TransferSchema {
    const baseFields = this.mapBaseFields(eventLog);
    
    // Validate this is a Transfer event with expected args
    if (eventLog.eventName !== 'Transfer') {
      throw new Error(`Expected Transfer event, got ${eventLog.eventName}`);
    }

    const { from, to, value } = eventLog.args;
    
    if (!from || !to || value === undefined) {
      throw new Error('Missing required Transfer event arguments');
    }

    return {
      ...baseFields,
      fromAddress: from.toLowerCase(),
      toAddress: to.toLowerCase(),
      value: value.toString(),
      tokenAddress: eventLog.address.toLowerCase(),
    } as ERC20TransferSchema;
  }

  validateMappedData(data: ERC20TransferSchema): boolean {
    return (
      super.validateMappedData(data) &&
      !!data.fromAddress &&
      !!data.toAddress &&
      !!data.value &&
      !!data.tokenAddress
    );
  }
}

// Example: ERC721 Transfer event mapper
export interface ERC721TransferSchema extends BaseContractEventSchema {
  fromAddress: string;
  toAddress: string;
  tokenId: string;
  tokenAddress: string;
}

export class ERC721TransferMapper extends BaseEventSchemaMapper<ERC721TransferSchema> {
  mapEventToSchema(eventLog: EventLogData): ERC721TransferSchema {
    const baseFields = this.mapBaseFields(eventLog);
    
    if (eventLog.eventName !== 'Transfer') {
      throw new Error(`Expected Transfer event, got ${eventLog.eventName}`);
    }

    const { from, to, tokenId } = eventLog.args;
    
    if (!from || !to || tokenId === undefined) {
      throw new Error('Missing required Transfer event arguments');
    }

    return {
      ...baseFields,
      fromAddress: from.toLowerCase(),
      toAddress: to.toLowerCase(),
      tokenId: tokenId.toString(),
      tokenAddress: eventLog.address.toLowerCase(),
    } as ERC721TransferSchema;
  }

  validateMappedData(data: ERC721TransferSchema): boolean {
    return (
      super.validateMappedData(data) &&
      !!data.fromAddress &&
      !!data.toAddress &&
      !!data.tokenId &&
      !!data.tokenAddress
    );
  }
}

// Generic mapper for simple events (just stores args as JSON)
export interface GenericEventSchema extends BaseContractEventSchema {
  eventArgs: Record<string, any>;
  metadata?: Record<string, any>;
}

export class GenericEventMapper extends BaseEventSchemaMapper<GenericEventSchema> {
  mapEventToSchema(eventLog: EventLogData): GenericEventSchema {
    const baseFields = this.mapBaseFields(eventLog);
    
    // Convert all args to string representation to avoid serialization issues
    const sanitizedArgs: Record<string, any> = {};
    for (const [key, value] of Object.entries(eventLog.args)) {
      if (typeof value === 'bigint') {
        sanitizedArgs[key] = value.toString();
      } else if (value && typeof value === 'object' && value.toString) {
        sanitizedArgs[key] = value.toString();
      } else {
        sanitizedArgs[key] = value;
      }
    }

    return {
      ...baseFields,
      eventArgs: sanitizedArgs,
      metadata: {
        originalArgsCount: Object.keys(eventLog.args).length,
      },
    } as GenericEventSchema;
  }

  validateMappedData(data: GenericEventSchema): boolean {
    return super.validateMappedData(data) && typeof data.eventArgs === 'object';
  }
}

// Custom mapper factory for specific event types
export function createCustomEventMapper<T extends BaseContractEventSchema>(
  eventName: string,
  mapperFunction: (args: Record<string, any>, baseFields: Partial<BaseContractEventSchema>) => Omit<T, keyof BaseContractEventSchema>,
  validator?: (data: T) => boolean
): EventSchemaMapper<T> {
  return new (class extends BaseEventSchemaMapper<T> {
    mapEventToSchema(eventLog: EventLogData): T {
      if (eventLog.eventName !== eventName) {
        throw new Error(`Expected ${eventName} event, got ${eventLog.eventName}`);
      }

      const baseFields = this.mapBaseFields(eventLog);
      const customFields = mapperFunction(eventLog.args, baseFields);
      
      return { ...baseFields, ...customFields } as T;
    }

    validateMappedData(data: T): boolean {
      const baseValid = super.validateMappedData(data);
      return validator ? baseValid && validator(data) : baseValid;
    }
  })();
}