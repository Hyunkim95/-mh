import { 
  pgTable, 
  serial, 
  varchar, 
  text, 
  timestamp, 
  json 
} from 'drizzle-orm/pg-core';

export const etlCursors = pgTable('etl_cursors', {
  id: serial('id').primaryKey(),
  jobName: varchar('job_name', { length: 255 }).notNull().unique(),
  cursorValue: text('cursor_value').notNull(),
  metadata: json('metadata'),
  lastProcessedAt: timestamp('last_processed_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type EtlCursor = typeof etlCursors.$inferSelect;
export type NewEtlCursor = typeof etlCursors.$inferInsert;