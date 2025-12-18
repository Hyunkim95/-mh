import { pgTable, serial, varchar, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

export const busyWalletsSchema = pgTable('busy_wallets', {
  id: serial('id').primaryKey(),
  address: varchar('address', { length: 64 }).notNull().unique(),
  transactionsAmount: integer('transactions_amount').default(0),
  isActive: boolean('is_active').default(true).notNull(),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type BusyWallet = typeof busyWalletsSchema.$inferSelect;
export type NewBusyWallet = typeof busyWalletsSchema.$inferInsert;