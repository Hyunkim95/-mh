import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { config } from '../libs/server/src/config/config';
import contractService from '../libs/server/src/solana/services/contract.service';
import { db } from '../libs/server/src/db';
import { eq } from 'drizzle-orm';
import { routesSchema } from '../libs/server/src/routes/schema/route.schema';
import { hopsSchema } from '../libs/server/src/routes/schema/hop.schema';

/**
 * Script to fix route 1027 by adding the missing hops on-chain
 *
 * This route was initialized but the addHops transaction was never executed.
 * The user's 0.1 SOL is safe as route tokens and can be unwrapped.
 *
 * Usage:
 *   npx tsx scripts/fix-route-1027.ts
 *
 * This will generate the addHops transaction that needs to be signed by the creator.
 */

const ROUTE_ID = 1027;

async function main() {
  console.log(`\n🔧 Fixing Route ${ROUTE_ID}\n`);

  // 1. Fetch route from database
  const [route] = await db
    .select()
    .from(routesSchema)
    .where(eq(routesSchema.id, ROUTE_ID))
    .limit(1);

  if (!route) {
    throw new Error(`Route ${ROUTE_ID} not found in database`);
  }

  console.log(`✅ Found route ${ROUTE_ID}`);
  console.log(`   Creator: ${route.creator}`);
  console.log(`   Status: ${route.status}`);
  console.log(`   Hop amount: ${route.hopAmountTokens} ${route.tokenType}`);

  // 2. Fetch hops from database
  const hops = await db
    .select()
    .from(hopsSchema)
    .where(eq(hopsSchema.routeId, ROUTE_ID))
    .orderBy(hopsSchema.hopIndex);

  if (hops.length === 0) {
    throw new Error(`No hops found for route ${ROUTE_ID}`);
  }

  console.log(`\n✅ Found ${hops.length} hops in database:`);
  hops.forEach((hop, idx) => {
    console.log(`   ${idx + 1}. ${hop.recipient}`);
    console.log(`      Scheduled: ${hop.scheduledAt}`);
  });

  // 3. Recalculate fresh timestamps (delays based on 10 minutes apart)
  const now = Date.now();
  const freshHops = hops.map((hop, idx) => {
    // Space hops 10 minutes apart starting from now
    const delayMs = (idx + 1) * 10 * 60 * 1000;
    const scheduledAt = now + delayMs;

    return {
      recipient: new PublicKey(hop.recipient),
      executeAt: new BN(Math.floor(scheduledAt / 1000)), // Unix timestamp in seconds
    };
  });

  console.log(`\n✅ Recalculated fresh timestamps:`);
  freshHops.forEach((hop, idx) => {
    const date = new Date(hop.executeAt.toNumber() * 1000);
    console.log(`   ${idx + 1}. ${hop.recipient.toBase58()}`);
    console.log(`      Execute at: ${date.toISOString()}`);
  });

  // 4. Generate addHops transactions
  console.log(`\n⏳ Generating addHops transaction(s)...`);

  const creatorKey = new PublicKey(route.creator);
  const routeIdBN = new BN(route.routeId);

  const transactions = await contractService.addHopsBatched(
    creatorKey,
    routeIdBN,
    freshHops
  );

  console.log(`\n✅ Generated ${transactions.length} transaction(s)`);
  console.log(`   Hops per transaction: ${contractService.HOPS_PER_BATCH}`);

  // 5. Instructions for user
  console.log(`\n📝 Next Steps:\n`);
  console.log(`This script has generated the transaction(s) needed to add the missing hops.`);
  console.log(`\nTo complete the fix, you need to sign and send these transactions.\n`);

  console.log(`Option 1: Use the frontend (EASIEST)`);
  console.log(`-----------------------------------------`);
  console.log(`1. Go to: https://multi-hopper-staging-dd0bdc7cde11.herokuapp.com/routes/${ROUTE_ID}`);
  console.log(`2. Connect wallet: ${route.creator}`);
  console.log(`3. Open browser console (F12)`);
  console.log(`4. Run this command:\n`);
  console.log(`   await window.addMissingHops(${ROUTE_ID})\n`);

  console.log(`Option 2: Use this API endpoint`);
  console.log(`-----------------------------------------`);
  console.log(`POST https://multi-hopper-staging-dd0bdc7cde11.herokuapp.com/trpc/contract.addHopsBatched`);
  console.log(`Body: ${JSON.stringify({
    routeId: ROUTE_ID,
    creator: route.creator,
    hops: hops.map((h, idx) => ({
      recipient: h.recipient,
      scheduledAt: freshHops[idx].executeAt.toNumber() * 1000
    }))
  }, null, 2)}\n`);

  console.log(`Option 3: Send the serialized transactions (MANUAL)`);
  console.log(`-----------------------------------------`);
  console.log(`The transactions are ready but need to be signed by the creator's wallet.`);
  console.log(`You would need to implement transaction signing and sending.\n`);

  // 6. Verify current on-chain state
  const connection = new Connection(config.solanaRpcUrl);
  console.log(`\n🔍 Current on-chain state:`);

  try {
    const { routeHasHops } = await import('../libs/server/src/solana/services/contract.service');
    const status = await routeHasHops(ROUTE_ID);
    console.log(`   Has hops: ${status.hasHops}`);
    console.log(`   Is deployed: ${status.isDeployed}`);
  } catch (err) {
    console.log(`   ⚠️  Could not fetch on-chain state:`, err instanceof Error ? err.message : err);
  }

  console.log(`\n✅ Script complete!\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
