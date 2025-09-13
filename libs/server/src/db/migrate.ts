#!/usr/bin/env node

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { join } from 'path';
import { DATABASE_CONFIG } from '../config/database';

// Database connection configuration
const connectionString = DATABASE_CONFIG.getConnectionString();

async function runMigrations() {
  console.log('🔄 Starting database migration...');
  
  // Create the connection pool
  const client = new Pool({
    connectionString,
  });

  try {
    // Test the connection
    await client.query('SELECT NOW()');
    console.log('✅ Database connection successful');

    // Create drizzle instance for migrations
    const db = drizzle(client);

    // Run migrations
    const migrationsFolder = join(__dirname, 'migrations');
    console.log(`📂 Looking for migrations in: ${migrationsFolder}`);
    
    await migrate(db, { migrationsFolder });
    
    console.log('✅ Database migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Close the connection
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n⚠️  Migration interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Migration terminated');
  process.exit(0);
});

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations().catch((error) => {
    console.error('❌ Unexpected error during migration:', error);
    process.exit(1);
  });
}

export { runMigrations };
