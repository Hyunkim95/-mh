import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { IDL } from '../libs/server/src/solana/idl/multi_hopper_project';
import { BN } from '@coral-xyz/anchor';

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey('HopQVBubZynF59qFkV58EvFkGvQhArhGXwZ4B3rpxqmY');

async function checkRoute1031() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const provider = new AnchorProvider(connection, {} as any, {});
  const program = new Program(IDL as any, provider);

  console.log('\n=== ROUTE 1031 ON-CHAIN STATUS ===\n');

  const routeId = new BN(1031);

  // Derive PDAs
  const [routeConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('route_config'), routeId.toArrayLike(Buffer, 'le', 8)],
    PROGRAM_ID
  );

  const [routeStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('route_state'), routeId.toArrayLike(Buffer, 'le', 8)],
    PROGRAM_ID
  );

  try {
    const routeConfig = await program.account.routeConfig.fetch(routeConfigPda);
    console.log('✅ Route Config Found:');
    console.log('  Creator:', routeConfig.creator.toBase58());
    console.log('  Hops Count:', routeConfig.hops.length);
    console.log('  Hop Amount:', routeConfig.hopAmount.toString());
    console.log('  Is Finalized:', routeConfig.isFinalized);

    console.log('\n  Hops on-chain:');
    routeConfig.hops.forEach((hop: any, index: number) => {
      console.log(`\n  Hop #${index + 1}:`);
      console.log('    Recipient:', hop.recipient.toBase58());
      console.log('    Execute At:', new Date(hop.executeAt.toNumber() * 1000).toISOString());
    });
  } catch (error) {
    console.log('❌ Route Config NOT FOUND');
  }

  try {
    const routeState = await program.account.routeState.fetch(routeStatePda);
    console.log('\n\n✅ Route State Found:');
    console.log('  Current Hop Index:', routeState.currentHopIndex);
    console.log('  Hops Count:', routeState.hopsCount);
    console.log('  Started At:', new Date(routeState.startedAt.toNumber() * 1000).toISOString());
  } catch (error) {
    console.log('\n❌ Route State NOT FOUND');
  }

  // Check intermediate wallet
  console.log('\n\n=== INTERMEDIATE WALLET CHECK ===\n');
  const intermediateWallet = new PublicKey('3BLjRcxWGtR7WRshJ3hL25U3RjWr5Ud98wMcczQqk4Ei');
  const balance = await connection.getBalance(intermediateWallet);
  console.log('Wallet:', intermediateWallet.toBase58());
  console.log('SOL Balance:', balance / 1e9, 'SOL');

  // Check token accounts
  const tokenAccounts = await connection.getTokenAccountsByOwner(intermediateWallet, {
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  });

  console.log('Token Accounts:', tokenAccounts.value.length);
  if (tokenAccounts.value.length > 0) {
    console.log('\n⚠️  WARNING: Wallet has token accounts (wrapped route tokens):');
    for (const account of tokenAccounts.value) {
      console.log('  -', account.pubkey.toBase58());
    }
  }

  // Check final wallet
  console.log('\n\n=== FINAL DESTINATION WALLET CHECK ===\n');
  const finalWallet = new PublicKey('5UHMyYf1Md9dWfXEWGyaAv6uanMVvfKc9fkcbaL5yDYp');
  const finalBalance = await connection.getBalance(finalWallet);
  console.log('Wallet:', finalWallet.toBase58());
  console.log('SOL Balance:', finalBalance / 1e9, 'SOL');
}

checkRoute1031().catch(err => {
  console.error('\n❌ Error:', err);
  process.exit(1);
});
