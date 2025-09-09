import { pgTable, serial, varchar, integer } from "drizzle-orm/pg-core";

export const routesSchema = pgTable('routes', {
    id: serial('id').primaryKey(),
    token: varchar('token').notNull(),
    amount: varchar('amount').notNull(),
    pairMint: varchar('pair_mint').notNull(),
    owner: varchar('owner').notNull(),
    currentIndex: integer('current_index').notNull().default(0),
    lastIndex: integer('last_index').notNull(),
});
export type Routes = typeof routesSchema.$inferSelect;

export type NewRoute = typeof routesSchema.$inferInsert;