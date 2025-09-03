import { pgTable, serial, varchar, text, timestamp, boolean, json } from 'drizzle-orm/pg-core';

// Example User table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Example Post table
export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  published: boolean('published').default(false).notNull(),
  authorId: serial('author_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ETL Cursor table for tracking extraction progress
export const etlCursors = pgTable('etl_cursors', {
  id: serial('id').primaryKey(),
  jobName: varchar('job_name', { length: 255 }).notNull().unique(),
  cursorValue: text('cursor_value').notNull(),
  metadata: json('metadata'), // Additional context like batch size, source info, etc.
  lastProcessedAt: timestamp('last_processed_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type EtlCursor = typeof etlCursors.$inferSelect;
export type NewEtlCursor = typeof etlCursors.$inferInsert;
