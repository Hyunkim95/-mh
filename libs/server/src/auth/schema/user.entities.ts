import {
  pgTable,
  serial,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const userSchema = pgTable(
  "user",
  {
    id: serial("id").primaryKey(),
    role: varchar("role", { length: 255 }).notNull().default("user"),
    publicKey: varchar("public_key", { length: 44 }).notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      publicKeyIdx: index("user_public_key_idx").on(table.publicKey),
    };
  }
);
