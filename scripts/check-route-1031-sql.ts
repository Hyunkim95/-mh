import { Client } from 'pg';

const DATABASE_URL = 'postgres://ub27k2qsbfsk8h:p39c1a23c8dbc02f693e143e9f8cc1baa5623519442b2eebc7023266e9d78fc8b@c5cqb8h0eop3g3.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com:5432/de4obo4e2gps9t';

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkRoute1031() {
  await client.connect();

  console.log('=== ROUTE 1031 DATABASE STATUS ===\n');

  // Get route info
  const routeResult = await client.query('SELECT * FROM routes WHERE id = $1', [1031]);

  if (routeResult.rows.length === 0) {
    console.log('Route 1031 not found in database');
    await client.end();
    return;
  }

  const route = routeResult.rows[0];

  console.log('Route ID:', route.id);
  console.log('Route Status:', route.status);
  console.log('Deployment Status:', route.deployment_status || 'N/A');
  console.log('Creator:', route.creator);
  console.log('Token Type:', route.token_type);
  console.log('Hop Amount:', route.hop_amount_tokens, route.token_symbol);
  console.log('Created At:', route.created_at);
  console.log('Deployed At:', route.deployed_at);
  console.log('Updated At:', route.updated_at);

  // Get hops
  const hopsResult = await client.query(
    'SELECT * FROM hops WHERE route_id = $1 ORDER BY hop_index',
    [1031]
  );

  console.log('\nHops in Database:', hopsResult.rows.length);

  hopsResult.rows.forEach((hop, index) => {
    console.log(`\nHop #${index + 1}:`);
    console.log('  Recipient:', hop.recipient);
    console.log('  Scheduled At:', hop.scheduled_at);
    console.log('  Executed At:', hop.executed_at || 'Not executed');
    console.log('  Error:', hop.error || 'None');
  });

  await client.end();
}

checkRoute1031().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
