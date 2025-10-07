import { pgTable, serial, varchar, integer } from "drizzle-orm/pg-core";

export const tokenConfigsSchema = pgTable("token_configs", {
  id: serial("id").primaryKey(),
  tokenMint: varchar("token_mint").notNull(),
  tokenConfigAddress: varchar("token_config_address").notNull(),
  creator: varchar("creator").notNull(),
  minTransferAmount: integer("min_transfer_amount").notNull(),
  feeBps: integer("fee_bps").notNull(),
  feeTreasury: varchar("fee_treasury").notNull(),
  maxHops: integer("max_hops").notNull(),
  maxDelaySeconds: integer("max_delay").notNull(),
  timelockSeconds: integer("timelock").notNull(),
  pairAddress: varchar("pair_address").notNull(),
  flatFeeLamports: integer("flat_fee_lamports").notNull(),
});

export type TokenConfig = typeof tokenConfigsSchema.$inferSelect;
export type NewTokenConfig = typeof tokenConfigsSchema.$inferInsert;
