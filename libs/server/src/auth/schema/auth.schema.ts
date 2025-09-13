import { pgTable, serial, varchar, timestamp, text, index } from "drizzle-orm/pg-core";

export const usersSchema = pgTable('users', {
  id: serial('id').primaryKey(),
  publicKey: varchar('public_key', { length: 44 }).notNull().unique(), // Solana public keys are 44 characters in base58
  role: varchar('role', { length: 20 }).notNull().default('user'), // 'user' or 'admin'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => {
  return {
    publicKeyIdx: index('users_public_key_idx').on(table.publicKey),
  };
});

export const sessionsSchema = pgTable('sessions', {
  id: serial('id').primaryKey(),
  userId: serial('user_id').references(() => usersSchema.id).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => {
  return {
    tokenIdx: index('sessions_token_idx').on(table.token),
    userIdIdx: index('sessions_user_id_idx').on(table.userId),
    expiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),
  };
});

export const authChallengesSchema = pgTable('auth_challenges', {
  id: serial('id').primaryKey(),
  publicKey: varchar('public_key', { length: 44 }).notNull(),
  nonce: varchar('nonce', { length: 32 }).notNull(),
  message: text('message').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  used: timestamp('used'),
}, (table) => {
  return {
    publicKeyIdx: index('auth_challenges_public_key_idx').on(table.publicKey),
    nonceIdx: index('auth_challenges_nonce_idx').on(table.nonce),
    expiresAtIdx: index('auth_challenges_expires_at_idx').on(table.expiresAt),
  };
});

export type User = typeof usersSchema.$inferSelect;
export type NewUser = typeof usersSchema.$inferInsert;
export type Session = typeof sessionsSchema.$inferSelect;
export type NewSession = typeof sessionsSchema.$inferInsert;
export type AuthChallenge = typeof authChallengesSchema.$inferSelect;
export type NewAuthChallenge = typeof authChallengesSchema.$inferInsert;