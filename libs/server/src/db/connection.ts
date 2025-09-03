import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Database connection configuration
const connectionString = process.env.DATABASE_URL || 'postgresql://trpc_user:trpc_password@localhost:5432/trpc_db';

// Create the connection pool
const client = new Pool({
  connectionString,
});

export const db = drizzle(client, { schema });

// Export the client for raw queries if needed
export { client };
