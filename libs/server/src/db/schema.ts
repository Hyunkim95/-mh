import { pgTable, serial, varchar, integer, timestamp, text, bigint, boolean, json } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { custodialWalletsSchema } from '@libs/crypto-utils';
import { etlCursors } from '@libs/etl';

export * from '../auth/schema/auth.schema';
export * from '../hops/schema/hops.schema';
export * from '../routes/schema/route.schema';
export * from '../token-configs/schema/token-config.schema';
export {
    custodialWalletsSchema,
    etlCursors,
}

// Export relations for drizzle query functionality
export { hopsRelations } from '../hops/schema/hops.schema';
export { routesRelations } from '../routes/schema/route.schema';

// Contract transaction tracking
export const contractTransactions = pgTable('contract_transactions', {
  id: serial('id').primaryKey(),
  signature: varchar('signature').notNull().unique(),
  slot: bigint('slot', { mode: 'number' }).notNull(),
  blockTime: timestamp('block_time', { withTimezone: true }),
  fee: bigint('fee', { mode: 'number' }).default(0),
  success: boolean('success').notNull().default(true),
  error: text('error'),
  programId: varchar('program_id').notNull(),
  
  // Raw transaction data (JSON)
  transactionData: json('transaction_data'),
  
  // Processing metadata
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Contract events extracted from transactions
export const contractEvents = pgTable('contract_events', {
  id: serial('id').primaryKey(),
  transactionId: integer('transaction_id').references(() => contractTransactions.id, { onDelete: 'cascade' }).notNull(),
  signature: varchar('signature').notNull(),
  eventType: varchar('event_type', { length: 50 }).notNull(), // 'HopCompleted', 'RouteCreated', 'RouteFinished', 'TokenConfigCreated'
  
  // Event-specific data (JSON)
  eventData: json('event_data').notNull(),
  
  // Common event fields for indexing
  routePda: varchar('route_pda'),
  routeId: bigint('route_id', { mode: 'number' }),
  creator: varchar('creator'),
  hopIndex: integer('hop_index'),
  
  // Processing metadata
  processed: boolean('processed').notNull().default(false),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Relations for contract tracking
export const contractTransactionsRelations = relations(contractTransactions, ({ many }) => ({
  events: many(contractEvents),
}));

export const contractEventsRelations = relations(contractEvents, ({ one }) => ({
  transaction: one(contractTransactions, {
    fields: [contractEvents.transactionId],
    references: [contractTransactions.id],
  }),
}));

// Type exports for contract tracking
export type ContractTransaction = typeof contractTransactions.$inferSelect;
export type NewContractTransaction = typeof contractTransactions.$inferInsert;
export type ContractEvent = typeof contractEvents.$inferSelect;
export type NewContractEvent = typeof contractEvents.$inferInsert;