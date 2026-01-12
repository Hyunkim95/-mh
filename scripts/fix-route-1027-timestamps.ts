import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { hopsSchema } from '../libs/server/src/hops/schema/hops.schema';
import { eq } from 'drizzle-orm';

// Connect directly to Heroku database
const DATABASE_URL = 'postgres://ub27k2qsbfsk8h:p39c1a23c8dbc02f693e143e9f8cc1baa5623519442b2eebc7023266e9d78fc8b@c5cqb8h0eop3g3.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com:5432/de4obo4e2gps9t';

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const db = drizzle(client);

/**
 * Fix route 1027 timestamps in database to match on-chain values
 *
 * The route was deployed with fresh timestamps on-chain, but database still has old times.
 * This script updates the database to match.
 */

async function fixRoute1027Timestamps() {
  const ROUTE_ID = 1027;

  console.log(`\n🔧 Fixing Route ${ROUTE_ID} database timestamps\n`);

  // Connect to database
  await client.connect();

  // Calculate fresh timestamps (10 minutes apart, starting from now + 5 minutes)
  const now = Date.now();
  const startIn = 5 * 60 * 1000; // Start in 5 minutes

  const freshHops = [
    {
      recipient: 'h6gar47c9GxYda8Kkg5J9So3R9K3jhcWKbgrjKhqfst',
      scheduledAt: new Date(now + startIn + (1 * 10 * 60 * 1000)),
      hopIndex: 0,
    },
    {
      recipient: 'Data6X2sFNz6WFGJ5nXBCYMvyVvJUQh5oUJLkPd9pM58',
      scheduledAt: new Date(now + startIn + (2 * 10 * 60 * 1000)),
      hopIndex: 1,
    },
    {
      recipient: 'DRFTws1Segbxx6NYGfbxnJiTBi7m8wVuhwMfoY5RCXMD',
      scheduledAt: new Date(now + startIn + (3 * 10 * 60 * 1000)),
      hopIndex: 2,
    },
    {
      recipient: '5UHMyYf1Md9dWfXEWGyaAv6uanMVvfKc9fkcbaL5yDYp',
      scheduledAt: new Date(now + startIn + (4 * 10 * 60 * 1000)),
      hopIndex: 3,
    },
  ];

  console.log('📅 New hop schedule:');
  freshHops.forEach((hop, idx) => {
    console.log(`   Hop ${idx}: ${hop.scheduledAt.toISOString()} - ${hop.recipient.slice(0, 8)}...`);
  });

  // Delete existing hops for route 1027
  console.log(`\n🗑️  Deleting old hops...`);
  await db.delete(hopsSchema).where(eq(hopsSchema.routeId, ROUTE_ID));

  // Insert new hops with fresh timestamps
  console.log(`✅ Inserting new hops with fresh timestamps...`);
  await db.insert(hopsSchema).values(
    freshHops.map((hop) => ({
      routeId: ROUTE_ID,
      hopIndex: hop.hopIndex,
      recipient: hop.recipient,
      scheduledAt: hop.scheduledAt,
    }))
  );

  console.log(`\n✅ Route ${ROUTE_ID} timestamps updated successfully!\n`);
  console.log(`📋 Next steps:`);
  console.log(`   1. Hops will now execute at the correct times`);
  console.log(`   2. First hop should execute in ~5 minutes`);
  console.log(`   3. Subsequent hops every 10 minutes after that\n`);
}

fixRoute1027Timestamps()
  .then(async () => {
    console.log('✅ Done!');
    await client.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Error:', err);
    await client.end();
    process.exit(1);
  });
