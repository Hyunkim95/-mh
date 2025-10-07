import {
  pgTable,
  serial,
  varchar,
  timestamp,
  text,
  bigint,
  boolean,
  json,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { contractEvents } from "./contract-events.schema";

// Contract transaction tracking
export const contractTransactions = pgTable("contract_transactions", {
  id: serial("id").primaryKey(),
  signature: varchar("signature").notNull().unique(),
  slot: bigint("slot", { mode: "number" }).notNull(),
  blockTime: timestamp("block_time", { withTimezone: true }),
  fee: bigint("fee", { mode: "number" }).default(0),
  success: boolean("success").notNull().default(true),
  error: text("error"),
  programId: varchar("program_id").notNull(),

  // Raw transaction data (JSON)
  transactionData: json("transaction_data"),

  // Processing metadata
  processedAt: timestamp("processed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Relations for contract tracking
export const contractTransactionsRelations = relations(
  contractTransactions,
  ({ many }) => ({
    events: many(contractEvents),
  })
);

// Type exports for contract tracking
export type ContractTransaction = typeof contractTransactions.$inferSelect;
export type NewContractTransaction = typeof contractTransactions.$inferInsert;
