import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

dotenv.config();

// Database connection configuration
const connectionString = process.env.DATABASE_URL;

// Create the connection pool with UTC timezone
const client = new Pool({
  connectionString,
  // Ensure all database operations use UTC timezone
  options: '-c timezone=UTC',
});

export const db = drizzle(client, { schema });

// Export the client for raw queries if needed
export { client };
