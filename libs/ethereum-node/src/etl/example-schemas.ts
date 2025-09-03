// Example database schemas for common contract events
// These would typically be defined in your main database schema file

import { 
  pgTable, 
  serial, 
  varchar, 
  text, 
  timestamp, 
  integer, 
  json, 
  index,
  primaryKey
} from 'drizzle-orm/pg-core';

// Base table for all contract events
export const contractEvents = pgTable('contract_events', {
  id: serial('id').primaryKey(),
  blockNumber: integer('block_number').notNull(),
  blockHash: varchar('block_hash', { length: 66 }).notNull(),
  transactionHash: varchar('transaction_hash', { length: 66 }).notNull(),
  transactionIndex: integer('transaction_index').notNull(),
  logIndex: integer('log_index').notNull(),
  contractAddress: varchar('contract_address', { length: 42 }).notNull(),
  eventName: varchar('event_name', { length: 255 }).notNull(),
  timestamp: timestamp('timestamp'),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
}, (table) => ({
  // Unique constraint to prevent duplicate events
  uniqueEvent: primaryKey({
    columns: [table.transactionHash, table.logIndex]
  }),
  // Indexes for efficient querying
  blockNumberIdx: index('contract_events_block_number_idx').on(table.blockNumber),
  contractAddressIdx: index('contract_events_contract_address_idx').on(table.contractAddress),
  eventNameIdx: index('contract_events_event_name_idx').on(table.eventName),
  timestampIdx: index('contract_events_timestamp_idx').on(table.timestamp),
}));

// ERC20 Transfer events
export const erc20Transfers = pgTable('erc20_transfers', {
  id: serial('id').primaryKey(),
  blockNumber: integer('block_number').notNull(),
  blockHash: varchar('block_hash', { length: 66 }).notNull(),
  transactionHash: varchar('transaction_hash', { length: 66 }).notNull(),
  transactionIndex: integer('transaction_index').notNull(),
  logIndex: integer('log_index').notNull(),
  contractAddress: varchar('contract_address', { length: 42 }).notNull(),
  eventName: varchar('event_name', { length: 255 }).notNull().default('Transfer'),
  timestamp: timestamp('timestamp'),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
  
  // ERC20 specific fields
  fromAddress: varchar('from_address', { length: 42 }).notNull(),
  toAddress: varchar('to_address', { length: 42 }).notNull(),
  value: text('value').notNull(), // Store as text to handle large numbers
  tokenAddress: varchar('token_address', { length: 42 }).notNull(),
}, (table) => ({
  // Unique constraint to prevent duplicate events
  uniqueTransfer: primaryKey({
    columns: [table.transactionHash, table.logIndex]
  }),
  // Indexes for efficient querying
  blockNumberIdx: index('erc20_transfers_block_number_idx').on(table.blockNumber),
  fromAddressIdx: index('erc20_transfers_from_address_idx').on(table.fromAddress),
  toAddressIdx: index('erc20_transfers_to_address_idx').on(table.toAddress),
  tokenAddressIdx: index('erc20_transfers_token_address_idx').on(table.tokenAddress),
  timestampIdx: index('erc20_transfers_timestamp_idx').on(table.timestamp),
}));

// ERC721 Transfer events
export const erc721Transfers = pgTable('erc721_transfers', {
  id: serial('id').primaryKey(),
  blockNumber: integer('block_number').notNull(),
  blockHash: varchar('block_hash', { length: 66 }).notNull(),
  transactionHash: varchar('transaction_hash', { length: 66 }).notNull(),
  transactionIndex: integer('transaction_index').notNull(),
  logIndex: integer('log_index').notNull(),
  contractAddress: varchar('contract_address', { length: 42 }).notNull(),
  eventName: varchar('event_name', { length: 255 }).notNull().default('Transfer'),
  timestamp: timestamp('timestamp'),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
  
  // ERC721 specific fields
  fromAddress: varchar('from_address', { length: 42 }).notNull(),
  toAddress: varchar('to_address', { length: 42 }).notNull(),
  tokenId: text('token_id').notNull(), // Store as text to handle large numbers
  tokenAddress: varchar('token_address', { length: 42 }).notNull(),
}, (table) => ({
  // Unique constraint to prevent duplicate events
  uniqueTransfer: primaryKey({
    columns: [table.transactionHash, table.logIndex]
  }),
  // Indexes for efficient querying
  blockNumberIdx: index('erc721_transfers_block_number_idx').on(table.blockNumber),
  fromAddressIdx: index('erc721_transfers_from_address_idx').on(table.fromAddress),
  toAddressIdx: index('erc721_transfers_to_address_idx').on(table.toAddress),
  tokenAddressIdx: index('erc721_transfers_token_address_idx').on(table.tokenAddress),
  tokenIdIdx: index('erc721_transfers_token_id_idx').on(table.tokenId),
  timestampIdx: index('erc721_transfers_timestamp_idx').on(table.timestamp),
}));

// Generic events table (for custom or unknown events)
export const genericContractEvents = pgTable('generic_contract_events', {
  id: serial('id').primaryKey(),
  blockNumber: integer('block_number').notNull(),
  blockHash: varchar('block_hash', { length: 66 }).notNull(),
  transactionHash: varchar('transaction_hash', { length: 66 }).notNull(),
  transactionIndex: integer('transaction_index').notNull(),
  logIndex: integer('log_index').notNull(),
  contractAddress: varchar('contract_address', { length: 42 }).notNull(),
  eventName: varchar('event_name', { length: 255 }).notNull(),
  timestamp: timestamp('timestamp'),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
  
  // Generic fields
  eventArgs: json('event_args').notNull(), // Store all event arguments as JSON
  metadata: json('metadata'), // Additional metadata
}, (table) => ({
  // Unique constraint to prevent duplicate events
  uniqueEvent: primaryKey({
    columns: [table.transactionHash, table.logIndex]
  }),
  // Indexes for efficient querying
  blockNumberIdx: index('generic_events_block_number_idx').on(table.blockNumber),
  contractAddressIdx: index('generic_events_contract_address_idx').on(table.contractAddress),
  eventNameIdx: index('generic_events_event_name_idx').on(table.eventName),
  timestampIdx: index('generic_events_timestamp_idx').on(table.timestamp),
}));

// Export types for TypeScript
export type ContractEvent = typeof contractEvents.$inferSelect;
export type NewContractEvent = typeof contractEvents.$inferInsert;

export type ERC20Transfer = typeof erc20Transfers.$inferSelect;
export type NewERC20Transfer = typeof erc20Transfers.$inferInsert;

export type ERC721Transfer = typeof erc721Transfers.$inferSelect;
export type NewERC721Transfer = typeof erc721Transfers.$inferInsert;

export type GenericContractEvent = typeof genericContractEvents.$inferSelect;
export type NewGenericContractEvent = typeof genericContractEvents.$inferInsert;