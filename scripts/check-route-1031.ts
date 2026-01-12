import { db } from '../libs/server/src/db';
import { routesSchema } from '../libs/server/src/routes/schema/route.schema';
import { eq } from 'drizzle-orm';

async function checkRoute1031() {
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

  process.exit(0);
}

checkRoute1031().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
