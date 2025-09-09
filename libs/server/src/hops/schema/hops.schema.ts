import { pgTable, serial, varchar, integer, timestamp, text, boolean } from "drizzle-orm/pg-core";
import { routesSchema } from "../../routes/schema/route.schema";

export const hopsSchema = pgTable('hops', {
  id: serial('id').primaryKey(),
  index: integer('index').notNull(),
  toAddress: varchar('to_address').notNull(),
  executesAt: timestamp('executes_at').notNull(),
  executedAt: timestamp('executed_at'),
  txHash: varchar('tx_hash'),
  error: text('error'),
  isReady: boolean('is_ready').notNull().default(false),
  routeId: serial('route_id').references(() => routesSchema.id),
});

export type Hop = typeof hopsSchema.$inferSelect;
export type NewHop = typeof hopsSchema.$inferInsert;