import { pgTable, serial, varchar, integer, timestamp, text } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { routesSchema } from "../../routes/schema/route.schema";
import { custodialWalletsSchema } from "@libs/crypto-utils";

// Obfuscation session status types
export type ObfuscationSessionStatus =
  | 'pending'      // Session created, waiting for funding
  | 'funding'      // User is signing funding transactions
  | 'aggregating'  // Intermediates are transferring to Wallet X
  | 'executing'    // Wallet X has invoked contract, route is running
  | 'cleaning'     // Closing ATAs and returning dust
  | 'completed'    // All done
  | 'failed';      // Something went wrong

// Intermediate wallet funding status
export type FundingStatus = 'pending' | 'funded' | 'failed';

// Intermediate wallet aggregation status
export type AggregationStatus = 'pending' | 'scheduled' | 'sent' | 'confirmed' | 'failed';

// Cleanup status
export type CleanupStatus = 'pending' | 'closing_ata' | 'returning_dust' | 'completed' | 'failed';

/**
 * Obfuscation Sessions Table
 *
 * Tracks the overall obfuscation process for a route.
 * Each route with hasObfuscation=true has exactly one session.
 */
export const obfuscationSessionsSchema = pgTable('obfuscation_sessions', {
  id: serial('id').primaryKey(),

  // Link to route (one-to-one)
  routeId: integer('route_id').references(() => routesSchema.id, { onDelete: 'cascade' }).notNull().unique(),

  // Session state
  status: varchar('status', { length: 20 }).notNull().default('pending'),

  // Wallet X (aggregator wallet that invokes the contract)
  // FK to custodial_wallets where the encrypted private key is stored
  walletXId: integer('wallet_x_id').references(() => custodialWalletsSchema.id),

  // Configuration
  intermediateCount: integer('intermediate_count').notNull(), // 5-8 random
  tokenMint: varchar('token_mint'), // null for SOL
  tokenType: varchar('token_type', { length: 10 }).notNull(), // 'SOL' or 'SPL'
  totalAmount: varchar('total_amount').notNull(), // Total tokens to transfer (raw units)

  // Fee tracking
  estimatedFeesLamports: varchar('estimated_fees_lamports'),
  actualFeesLamports: varchar('actual_fees_lamports'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }), // When funding began
  completedAt: timestamp('completed_at', { withTimezone: true }),

  // Error handling
  lastError: text('last_error'),
  retryCount: integer('retry_count').default(0),
});

/**
 * Intermediate Wallets Table
 *
 * Tracks each intermediate wallet in an obfuscation session.
 * User funds these, then they transfer to Wallet X.
 */
export const intermediateWalletsSchema = pgTable('intermediate_wallets', {
  id: serial('id').primaryKey(),

  // Link to session
  sessionId: integer('session_id').references(() => obfuscationSessionsSchema.id, { onDelete: 'cascade' }).notNull(),

  // Wallet reference (stored in custodial_wallets for encrypted private key)
  custodialWalletId: integer('custodial_wallet_id').references(() => custodialWalletsSchema.id).notNull(),

  // Position in the intermediate wallet array (0 to N-1)
  walletIndex: integer('wallet_index').notNull(),

  // Amount allocated to this wallet (random split of total)
  allocatedAmount: varchar('allocated_amount').notNull(),

  // Step 1: Source -> Intermediate (user signs these)
  fundingStatus: varchar('funding_status', { length: 20 }).notNull().default('pending'),
  fundingTxHash: varchar('funding_tx_hash'),
  fundedAt: timestamp('funded_at', { withTimezone: true }),

  // Step 2: Intermediate -> Wallet X (server signs these)
  aggregationStatus: varchar('aggregation_status', { length: 20 }).notNull().default('pending'),
  aggregationScheduledAt: timestamp('aggregation_scheduled_at', { withTimezone: true }), // Random time
  aggregationTxHash: varchar('aggregation_tx_hash'),
  aggregatedAt: timestamp('aggregated_at', { withTimezone: true }),

  // Step 3: Cleanup (after route completes)
  cleanupStatus: varchar('cleanup_status', { length: 20 }).notNull().default('pending'),
  dustReturnTxHash: varchar('dust_return_tx_hash'),
  ataCloseTxHash: varchar('ata_close_tx_hash'),
  cleanedUpAt: timestamp('cleaned_up_at', { withTimezone: true }),

  // Error tracking
  lastError: text('last_error'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Define relations
export const obfuscationSessionsRelations = relations(obfuscationSessionsSchema, ({ one, many }) => ({
  route: one(routesSchema, {
    fields: [obfuscationSessionsSchema.routeId],
    references: [routesSchema.id],
  }),
  walletX: one(custodialWalletsSchema, {
    fields: [obfuscationSessionsSchema.walletXId],
    references: [custodialWalletsSchema.id],
  }),
  intermediateWallets: many(intermediateWalletsSchema),
}));

export const intermediateWalletsRelations = relations(intermediateWalletsSchema, ({ one }) => ({
  session: one(obfuscationSessionsSchema, {
    fields: [intermediateWalletsSchema.sessionId],
    references: [obfuscationSessionsSchema.id],
  }),
  custodialWallet: one(custodialWalletsSchema, {
    fields: [intermediateWalletsSchema.custodialWalletId],
    references: [custodialWalletsSchema.id],
  }),
}));

// Type exports
export type ObfuscationSession = typeof obfuscationSessionsSchema.$inferSelect;
export type NewObfuscationSession = typeof obfuscationSessionsSchema.$inferInsert;

export type IntermediateWallet = typeof intermediateWalletsSchema.$inferSelect;
export type NewIntermediateWallet = typeof intermediateWalletsSchema.$inferInsert;

// Input types for creating sessions
export interface CreateObfuscationSessionInput {
  routeId: number;
  tokenMint?: string;
  tokenType: 'SOL' | 'SPL';
  totalAmount: string;
}

// Session with joined wallet addresses
export interface ObfuscationSessionWithWallets extends ObfuscationSession {
  walletXAddress?: string;
  intermediateWallets: (IntermediateWallet & { address: string })[];
}

/**
 * Compute idempotency key for a transaction
 * Used to prevent duplicate transactions during retries
 */
export function computeIdempotencyKey(
  sessionId: number,
  walletIndex: number,
  txType: 'fund' | 'aggregate' | 'close_ata' | 'return_dust'
): string {
  return `${sessionId}_${walletIndex}_${txType}`;
}
