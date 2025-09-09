import { pgTable, serial, varchar, integer } from "drizzle-orm/pg-core";

export const tokenConfigsSchema = pgTable('token_configs', {
    id: serial('id').primaryKey(),
    address: varchar('address').notNull().unique(),
    pairAddress: varchar('pair_address').notNull(),
    feePercentage: integer('fee_percentage').notNull(),
    maxHops: integer('max_hops').notNull(),
    maxDelay: integer('max_delay').notNull(),
    minTransferAmount: integer('min_transfer_amount').notNull(),
});

export type TokenConfig = typeof tokenConfigsSchema.$inferSelect;
export type NewTokenConfig = typeof tokenConfigsSchema.$inferInsert;