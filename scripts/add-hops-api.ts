/**
 * Quick fix for route 1027 - Call this from your browser console
 *
 * 1. Go to: https://multi-hopper-staging-dd0bdc7cde11.herokuapp.com
 * 2. Make sure you're connected with wallet: 93AceAmSTY4sCkdwnaExuUj8nmaCVKijDHCABx49pTFw
 * 3. Open browser console (F12)
 * 4. Paste and run this code:
 */

async function fixRoute1027() {
  const ROUTE_ID = 1027;

  console.log('🔧 Fixing route 1027 by adding missing hops...');

  // Get the hop data from the route
  const response = await fetch(`/trpc/routes.getRoute?input=${encodeURIComponent(JSON.stringify({
    id: ROUTE_ID,
    creator: '93AceAmSTY4sCkdwnaExuUj8nmaCVKijDHCABx49pTFw'
  }))}`);

  const data = await response.json();
  const route = data.result?.data;

  if (!route) {
    throw new Error('Route not found');
  }

  console.log(`Found route with ${route.hops?.length || 0} hops`);

  // Recalculate fresh timestamps
  const now = Date.now();
  const freshHops = route.hops.map((hop: any, idx: number) => ({
    recipient: hop.recipient,
    scheduledAt: now + ((idx + 1) * 10 * 60 * 1000) // 10 minutes apart
  }));

  console.log('Recalculated timestamps:', freshHops);

  // Call the addHopsBatched mutation
  const result = await fetch('/trpc/contract.addHopsBatched', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      routeId: ROUTE_ID,
      creator: route.creator,
      hops: freshHops
    })
  });

  const txData = await result.json();
  console.log('✅ Transactions generated:', txData);

  // Now you need to sign these transactions with your wallet
  console.log('⚠️  Next: Sign the transactions with your Solana wallet');

  return txData;
}

// Export for use
if (typeof window !== 'undefined') {
  (window as any).fixRoute1027 = fixRoute1027;
}
