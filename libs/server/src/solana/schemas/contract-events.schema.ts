import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  bigint,
  boolean,
  json,
} from "drizzle-orm/pg-core";
import { contractTransactions } from "./contract-transactions.schema";
import { relations } from "drizzle-orm";

// Contract events extracted from transactions
export const contractEvents = pgTable("contract_events", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id")
    .references(() => contractTransactions.id, { onDelete: "cascade" })
    .notNull(),
  signature: varchar("signature").notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'HopCompleted', 'RouteCreated', 'RouteFinished', 'TokenConfigCreated'

  // Event-specific data (JSON)
  eventData: json("event_data").notNull(),

  // Common event fields for indexing
  routePda: varchar("route_pda"),
  routeId: bigint("route_id", { mode: "number" }),
  creator: varchar("creator"),
  hopIndex: integer("hop_index"),

  // Processing metadata
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const contractEventsRelations = relations(contractEvents, ({ one }) => ({
  transaction: one(contractTransactions, {
    fields: [contractEvents.transactionId],
    references: [contractTransactions.id],
  }),
}));

export type ContractEvent = typeof contractEvents.$inferSelect;
export type NewContractEvent = typeof contractEvents.$inferInsert;
