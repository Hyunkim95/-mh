import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { routesSchema } from '../libs/server/src/routes/schema/route.schema';
import { hopsSchema } from '../libs/server/src/hops/schema/hops.schema';
import { eq } from 'drizzle-orm';

const DATABASE_URL = 'postgres://ub27k2qsbfsk8h:p39c1a23c8dbc02f693e143e9f8cc1baa5623519442b2eebc7023266e9d78fc8b@c5cqb8h0eop3g3.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com:5432/de4obo4e2gps9t';

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const db = drizzle(client);

async function checkRoute1031() {
  await client.connect();

  console.log('=== ROUTE 1031 DATABASE STATUS ===\n');

  // Get route info
  const route = await db.query.routesSchema.findFirst({
    where: eq(routesSchema.id, 1031),
    with: {
      hops: {
        orderBy: (hops, { asc }) => [asc(hops.hopIndex)]
      }
    }
  });

  if (!route) {
    console.log('Route 1031 not found in database');
    await client.end();
    return;
  }

  console.log('Route ID:', route.id);
  console.log('Route Status:', route.status);
  console.log('Deployment Status:', route.deploymentStatus);
  console.log('Creator:', route.creator);
  console.log('Token Type:', route.tokenType);
  console.log('Hop Amount:', route.hopAmountTokens, route.tokenSymbol);
  console.log('Created At:', route.createdAt);
  console.log('Deployed At:', route.deployedAt);
  console.log('Updated At:', route.updatedAt);
  console.log('\nHops in Database:', route.hops?.length || 0);

  if (route.hops) {
    route.hops.forEach((hop, index) => {
      console.log(`\nHop #${index + 1}:`);
      console.log('  Recipient:', hop.recipient);
      console.log('  Scheduled At:', hop.scheduledAt);
      console.log('  Executed At:', hop.executedAt);
      console.log('  Error:', hop.error || 'None');
    });
  }

  await client.end();
}

checkRoute1031().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
