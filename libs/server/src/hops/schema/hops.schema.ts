import { pgTable, serial, varchar, integer, timestamp, text } from "drizzle-orm/pg-core";
import { routesSchema } from "../../routes/schema/route.schema";
import { relations } from "drizzle-orm";

export const hopsSchema = pgTable('hops', {
  id: serial('id').primaryKey(),
  routeId: integer('route_id').references(() => routesSchema.id, { onDelete: 'cascade' }).notNull(),
  hopIndex: integer('hop_index').notNull(), // Order of the hop in the route
  recipient: varchar('recipient').notNull(), // Recipient wallet address
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(), // When this hop should execute (UTC)
  
  executedAt: timestamp('executed_at', { withTimezone: true }),
  txHash: varchar('tx_hash'),
  error: text('error'),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Define relations
export const hopsRelations = relations(hopsSchema, ({ one }) => ({
  route: one(routesSchema, {
    fields: [hopsSchema.routeId],
    references: [routesSchema.id],
  }),
}));

export type Hop = typeof hopsSchema.$inferSelect;
export type NewHop = typeof hopsSchema.$inferInsert;

// Type for creating hops with timestamps
export interface CreateHopInput {
  routeId: number;
  hopIndex: number;
  recipient: string;
  scheduledAt: Date;
}

// Type for hop data with calculated delays (for API responses)
export interface HopWithDelay extends Hop {
  delayMinutes?: number; // Calculated from timestamp differences
  delaySeconds?: number; // Calculated from timestamp differences
}