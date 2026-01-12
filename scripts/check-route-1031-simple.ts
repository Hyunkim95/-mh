import { Connection, PublicKey } from '@solana/web3.js';
import { getRouteConfiguration, getRouteStateAccount } from '../libs/server/src/solana/services/contract.service';
import { config } from '../libs/server/src/config';

async function checkRoute1031OnChain() {
  console.log('\n=== ROUTE 1031 ON-CHAIN STATUS ===\n');

  try {
    // Get route configuration
    const routeConfig = await getRouteConfiguration(1031);

    if (routeConfig) {
      console.log('Route Config Found:');
      console.log('  Creator:', routeConfig.creator);
      console.log('  Hops Count:', routeConfig.hops.length);
      console.log('  Hop Amount:', routeConfig.hopAmount);
      console.log('  Is Finalized:', routeConfig.isFinalized);

      console.log('\n  Hops on-chain:');
      routeConfig.hops.forEach((hop, index) => {
        console.log(`\n  Hop #${index + 1}:`);
        console.log('    Recipient:', hop.recipient);
        console.log('    Delay Seconds:', hop.delaySeconds);
      });
    } else {
      console.log('Route Config NOT FOUND on-chain');
    }
  } catch (error) {
    console.log('Error fetching route config:', error instanceof Error ? error.message : error);
  }

  try {
    // Get route state
    const routeState = await getRouteStateAccount(1031);

    if (routeState) {
      console.log('\n\nRoute State Found:');
      console.log('  Current Hop Index:', routeState.currentHopIndex);
      console.log('  Hops Count:', routeState.hopsCount);
      console.log('  Started At:', new Date(Number(routeState.startedAt) * 1000).toISOString());
    } else {
      console.log('\nRoute State NOT FOUND on-chain');
    }
  } catch (error) {
    console.log('\nError fetching route state:', error instanceof Error ? error.message : error);
  }

  // Check intermediate wallet balance
  console.log('\n\n=== INTERMEDIATE WALLET CHECK ===\n');
  const connection = new Connection(config.solanaRpcUrl || 'https://api.mainnet-beta.solana.com', 'confirmed');
  const intermediateWallet = new PublicKey('3BLjRcxWGtR7WRshJ3hL25U3RjWr5Ud98wMcczQqk4Ei');
  const balance = await connection.getBalance(intermediateWallet);
  console.log('Intermediate Wallet:', intermediateWallet.toBase58());
  console.log('SOL Balance:', balance / 1e9, 'SOL');

  // Check for token accounts (wrapped route tokens)
  const tokenAccounts = await connection.getTokenAccountsByOwner(intermediateWallet, {
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  });

  console.log('\nToken Accounts:', tokenAccounts.value.length);
  if (tokenAccounts.value.length > 0) {
    console.log('\nWARNING: Intermediate wallet has token accounts (likely wrapped route tokens)');
    tokenAccounts.value.forEach((account, index) => {
      console.log(`  Token Account #${index + 1}:`, account.pubkey.toBase58());
    });
  }

  // Check final destination wallet
  console.log('\n\n=== FINAL DESTINATION WALLET CHECK ===\n');
  const finalWallet = new PublicKey('5UHMyYf1Md9dWfXEWGyaAv6uanMVvfKc9fkcbaL5yDYp');
  const finalBalance = await connection.getBalance(finalWallet);
  console.log('Final Destination Wallet:', finalWallet.toBase58());
  console.log('SOL Balance:', finalBalance / 1e9, 'SOL');
}

checkRoute1031OnChain().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
