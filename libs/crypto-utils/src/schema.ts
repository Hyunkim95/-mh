import { pgTable, serial, varchar, text, timestamp } from 'drizzle-orm/pg-core';

// Custodial Wallets table for encrypted wallet storage
export const custodialWallets = pgTable('custodial_wallets', {
  id: serial('id').primaryKey(),
  keyIdentifier: varchar('key_identifier', { length: 255 }).notNull().unique(),
  address: varchar('address', { length: 255 }).notNull(),
  encryptedPrivateKey: text('encrypted_private_key').notNull(),
  iv: varchar('iv', { length: 255 }).notNull(),
  chainType: varchar('chain_type', { length: 50 }).notNull(), // 'ethereum' | 'solana'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types
export type CustodialWallet = typeof custodialWallets.$inferSelect;
export type NewCustodialWallet = typeof custodialWallets.$inferInsert;