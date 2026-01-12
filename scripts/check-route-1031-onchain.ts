import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { IDL } from '../libs/server/src/solana/idl/multi_hopper_project';
import { Keypair } from '@solana/web3.js';

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = 'HopQVBubZynF59qFkV58EvFkGvQhArhGXwZ4B3rpxqmY';

async function checkRoute1031OnChain() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet = new Wallet(Keypair.generate());
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program(IDL, provider);

  console.log('\n=== ROUTE 1031 ON-CHAIN STATUS ===\n');

  // Derive PDAs for route 1031
  const [routeConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('route_config'), Buffer.from([0x07, 0x04, 0x00, 0x00])], // 1031 in little-endian
    new PublicKey(PROGRAM_ID)
  );

  const [routeStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('route_state'), Buffer.from([0x07, 0x04, 0x00, 0x00])], // 1031 in little-endian
    new PublicKey(PROGRAM_ID)
  );

  try {
    // Fetch route configuration
    const routeConfig = await program.account.routeConfig.fetch(routeConfigPda);
    console.log('Route Config Found:');
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
    console.log('Route Config NOT FOUND:', error instanceof Error ? error.message : error);
  }

  try {
    // Fetch route state
    const routeState = await program.account.routeState.fetch(routeStatePda);
    console.log('\n\nRoute State Found:');
    console.log('  Current Hop Index:', routeState.currentHopIndex);
    console.log('  Hops Count:', routeState.hopsCount);
    console.log('  Started At:', new Date(routeState.startedAt.toNumber() * 1000).toISOString());
  } catch (error) {
    console.log('\nRoute State NOT FOUND:', error instanceof Error ? error.message : error);
  }

  // Check intermediate wallet balance
  console.log('\n\n=== INTERMEDIATE WALLET CHECK ===\n');
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
      console.log(`\nToken Account #${index + 1}:`, account.pubkey.toBase58());
    });
  }
}

checkRoute1031OnChain().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
